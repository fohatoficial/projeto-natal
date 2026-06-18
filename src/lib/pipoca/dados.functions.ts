// Indicadores agregados por capital. PIN-protegido (mesma sessão da fila).

import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

const LOG = "[PIPOCA_DADOS]";

async function requireAdmin(): Promise<void> {
  const { PRINT_QUEUE_COOKIE, isValidSessionToken } = await import(
    "@/lib/pipoca/print-auth.server"
  );
  const tok = getCookie(PRINT_QUEUE_COOKIE);
  if (!isValidSessionToken(tok)) throw new Error("Unauthorized");
}

export type CapitalIndicators = {
  capitalId: string | null;
  capitalName: string;
  isSystem: boolean;
  selectable: boolean;
  active: boolean;
  captures: number;
  capturesToday: number;
  generations: number;
  generationsToday: number;
  queuePending: number;
  queuePrinting: number;
  queuePrinted: number;
  queueTotal: number;
};

export type DadosSummary = {
  generatedAt: string;
  totals: {
    captures: number;
    capturesToday: number;
    generations: number;
    generationsToday: number;
    queuePending: number;
    queuePrinting: number;
    queuePrinted: number;
    capturesWithoutCapital: number;
    generationsWithoutCapital: number;
    queueWithoutCapital: number;
  };
  perCapital: CapitalIndicators[];
};

// Início do "hoje" em America/Sao_Paulo (UTC-3, sem horário de verão) → ISO em UTC.
function startOfTodaySaoPauloISO(): string {
  const now = new Date();
  // Pega o "agora" como string no fuso de SP e extrai Y-M-D.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [{ value: y }, , { value: m }, , { value: d }] = fmt.formatToParts(now) as Array<{
    type: string;
    value: string;
  }>;
  // SP fixa UTC-3 → 00:00 local == 03:00 UTC no mesmo dia.
  return `${y}-${m}-${d}T03:00:00.000Z`;
}

async function countAll(
  table: string,
  build: (q: any) => any,
): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const base = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  const { count, error } = await build(base);
  if (error) {
    console.warn(LOG, "count fail", { table, message: error.message });
    return 0;
  }
  return count ?? 0;
}

export const getDadosSummary = createServerFn({ method: "GET" }).handler(
  async (): Promise<DadosSummary> => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const todayISO = startOfTodaySaoPauloISO();

    // Lista capitais (todas, incluindo system).
    const { data: caps, error: capsErr } = await supabaseAdmin
      .from("pipoca_capitals")
      .select("id, name, slug, is_system, selectable, active, display_order")
      .order("is_system", { ascending: true })
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (capsErr) throw new Error("Falha ao listar capitais");

    const capitalRows = caps ?? [];
    const perCapital: CapitalIndicators[] = [];

    for (const c of capitalRows) {
      const capId = c.id as string;
      const [captures, capturesToday, generations, generationsToday, qPending, qPrinting, qPrinted] =
        await Promise.all([
          countAll("pipoca_captures", (q) => q.eq("capital_id", capId)),
          countAll("pipoca_captures", (q) =>
            q.eq("capital_id", capId).gte("created_at", todayISO),
          ),
          countAll("pipoca_generations", (q) => q.eq("capital_id", capId)),
          countAll("pipoca_generations", (q) =>
            q.eq("capital_id", capId).gte("created_at", todayISO),
          ),
          countAll("pipoca_print_queue", (q) =>
            q.eq("capital_id", capId).eq("status", "pending"),
          ),
          countAll("pipoca_print_queue", (q) =>
            q.eq("capital_id", capId).eq("status", "printing"),
          ),
          countAll("pipoca_print_queue", (q) =>
            q.eq("capital_id", capId).eq("status", "printed"),
          ),
        ]);
      perCapital.push({
        capitalId: capId,
        capitalName: c.name as string,
        isSystem: Boolean(c.is_system),
        selectable: Boolean(c.selectable),
        active: Boolean(c.active),
        captures,
        capturesToday,
        generations,
        generationsToday,
        queuePending: qPending,
        queuePrinting: qPrinting,
        queuePrinted: qPrinted,
        queueTotal: qPending + qPrinting + qPrinted,
      });
    }

    const [
      capturesTotal,
      capturesToday,
      generationsTotal,
      generationsToday,
      qPendingTotal,
      qPrintingTotal,
      qPrintedTotal,
      capturesNullCap,
      generationsNullCap,
      queueNullCap,
    ] = await Promise.all([
      countAll("pipoca_captures", (q) => q),
      countAll("pipoca_captures", (q) => q.gte("created_at", todayISO)),
      countAll("pipoca_generations", (q) => q),
      countAll("pipoca_generations", (q) => q.gte("created_at", todayISO)),
      countAll("pipoca_print_queue", (q) => q.eq("status", "pending")),
      countAll("pipoca_print_queue", (q) => q.eq("status", "printing")),
      countAll("pipoca_print_queue", (q) => q.eq("status", "printed")),
      countAll("pipoca_captures", (q) => q.is("capital_id", null)),
      countAll("pipoca_generations", (q) => q.is("capital_id", null)),
      countAll("pipoca_print_queue", (q) => q.is("capital_id", null)),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        captures: capturesTotal,
        capturesToday,
        generations: generationsTotal,
        generationsToday,
        queuePending: qPendingTotal,
        queuePrinting: qPrintingTotal,
        queuePrinted: qPrintedTotal,
        capturesWithoutCapital: capturesNullCap,
        generationsWithoutCapital: generationsNullCap,
        queueWithoutCapital: queueNullCap,
      },
      perCapital,
    };
  },
);
