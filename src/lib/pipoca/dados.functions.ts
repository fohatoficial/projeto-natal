// Painel /dados — indicadores agregados + listagem detalhada por captura.
// Toda agregação e paginação ocorrem em SQL via RPCs (ver migration
// docs/migrations/20260620_pipoca_dados_rpcs.sql). Não há cap de 5000
// registros no servidor de aplicação e nenhuma chamada `.in()` com lista
// proporcional ao tamanho do conjunto filtrado.

import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";

const LOG = "[PIPOCA_DADOS]";
const PAGE_SIZE = 25;

async function requireAdmin(): Promise<void> {
  const { PRINT_QUEUE_COOKIE, isValidSessionToken } = await import(
    "@/lib/pipoca/print-auth.server"
  );
  const tok = getCookie(PRINT_QUEUE_COOKIE);
  if (!isValidSessionToken(tok)) throw new Error("Unauthorized");
}

// ────────────────────────── helpers de tempo (America/Sao_Paulo) ──────────────────────────

function saoPauloCivilToUTC(
  y: number,
  m: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
): Date {
  const asIfUTC = Date.UTC(y, m - 1, d, h, mi, s);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(asIfUTC));
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const wallAsUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second),
  );
  const offsetMs = wallAsUTC - asIfUTC;
  return new Date(asIfUTC - offsetMs);
}

function spYmd(date: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
}

function todayBoundsSP(): { startISO: string; endISO: string } {
  const { y, m, d } = spYmd(new Date());
  return {
    startISO: saoPauloCivilToUTC(y, m, d, 0, 0, 0).toISOString(),
    endISO: saoPauloCivilToUTC(y, m, d + 1, 0, 0, 0).toISOString(),
  };
}

function rangeBoundsSP(
  startYmd?: string | null,
  endYmd?: string | null,
): { startISO: string | null; endISO: string | null } {
  const parse = (s?: string | null) => {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  };
  const a = parse(startYmd);
  const b = parse(endYmd);
  return {
    startISO: a ? saoPauloCivilToUTC(a.y, a.m, a.d, 0, 0, 0).toISOString() : null,
    endISO: b ? saoPauloCivilToUTC(b.y, b.m, b.d + 1, 0, 0, 0).toISOString() : null,
  };
}

// ────────────────────────── tipos ──────────────────────────

export type DadosFilters = {
  startDate?: string | null;
  endDate?: string | null;
  capitalId?: string | null;
  filmId?: string | null;
  generationStatus?: string | null;
  printStatus?: string | null;
  search?: string | null;
  page?: number | null;
};

export type CapitalIndicators = {
  capitalId: string;
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

export type DetailRow = {
  captureId: string;
  createdAt: string;
  capitalId: string | null;
  capitalName: string;
  visitorFirstName: string;
  visitorFullName: string;
  whatsappMasked: string;
  filmId: string | null;
  filmTitle: string;
  generationId: string | null;
  generationStatus: string | null;
  generationAttempts: number;
  printQueueId: string | null;
  printStatus: string | null;
  publicToken: string | null;
};

export type FilmOption = { id: string; title: string };
export type CapitalOption = {
  id: string;
  name: string;
  isSystem: boolean;
  active: boolean;
  selectable: boolean;
  hasRecords: boolean;
};

export type DadosSummary = {
  generatedAt: string;
  filters: DadosFilters;
  todayBounds: { startISO: string; endISO: string };
  totals: {
    captures: number | null;
    capturesToday: number;
    generations: number;
    generationsToday: number;
    generationsCompleted: number;
    generationsFailed: number;
    uniqueVisitors: number;
    successRate: number;
    avgAttemptsPerCapture: number;
    queuePending: number;
    queuePrinting: number;
    queuePrinted: number;
    capturesWithoutCapital: number;
    generationsWithoutCapital: number;
    queueWithoutCapital: number;
  };
  perCapital: CapitalIndicators[];
  topFilms: Array<{ filmId: string; title: string; captures: number }>;
  details: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    rangeStart: number;
    rangeEnd: number;
    rows: DetailRow[];
  };
  options: {
    capitals: CapitalOption[];
    films: FilmOption[];
    generationStatuses: string[];
    printStatuses: string[];
  };
};

const FiltersSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  capitalId: z.string().uuid().nullable().optional(),
  filmId: z.string().uuid().nullable().optional(),
  generationStatus: z.string().min(1).max(40).nullable().optional(),
  printStatus: z.string().min(1).max(40).nullable().optional(),
  search: z.string().max(80).nullable().optional(),
  page: z.number().int().positive().max(100000).nullable().optional(),
});

// ────────────────────────── helpers ──────────────────────────

function maskWhatsapp(e164: string | null, last4: string | null): string {
  if (last4 && /^\d{4}$/.test(last4)) {
    if (e164 && e164.length >= 6) {
      const m = /^\+?(\d{2})(\d{2})/.exec(e164);
      const ddd = m ? m[2] : "••";
      return `(${ddd}) •••••-${last4}`;
    }
    return `••••• ${last4}`;
  }
  return "—";
}

function normalizeSearch(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
}

// ────────────────────────── server fn principal ──────────────────────────

export const getDadosSummary = createServerFn({ method: "POST" })
  .inputValidator((input) => FiltersSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<DadosSummary> => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const today = todayBoundsSP();
    const range = rangeBoundsSP(data.startDate ?? null, data.endDate ?? null);
    const search = normalizeSearch(data.search ?? null);
    const page = Math.max(1, data.page ?? 1);
    const offset = (page - 1) * PAGE_SIZE;

    const rpcArgs = {
      p_start: range.startISO,
      p_end: range.endISO,
      p_capital: data.capitalId ?? null,
      p_film: data.filmId ?? null,
      p_gen_status: data.generationStatus ?? null,
      p_print_status: data.printStatus ?? null,
      p_search: search,
    } as const;

    // Painel executivo: apenas summary (agregados). A RPC pipoca_dados_page
    // não é mais consultada — listagem detalhada/PII não aparece em /dados.
    const [summaryRes, { data: capsAll }, { data: filmsAll }] =
      await Promise.all([
        supabaseAdmin.rpc("pipoca_dados_summary", {
          ...rpcArgs,
          p_today_start: today.startISO,
          p_today_end: today.endISO,
        }),
        supabaseAdmin
          .from("pipoca_capitals")
          .select("id, name, slug, is_system, selectable, active, display_order")
          .order("is_system", { ascending: true })
          .order("display_order", { ascending: true })
          .order("name", { ascending: true }),
        supabaseAdmin.from("pipoca_films").select("id, title").order("title", { ascending: true }),
      ]);
    const pageRows: Array<Record<string, any>> = [];
    void offset;

    if (summaryRes.error) {
      console.warn(LOG, "DADOS_DASHBOARD_LOAD_FAILED", {
        rpc_name: "pipoca_dados_summary",
        error_code: summaryRes.error.code,
        error_message: summaryRes.error.message,
      });
      throw new Error("Não foi possível carregar os dados do painel.");
    }

    const summary = (summaryRes.data ?? { totals: {}, per_capital: [] }) as {
      totals: Record<string, number | string | null>;
      per_capital: Array<Record<string, any>>;
    };

    // Debug: totais brutos (sem dados pessoais) — diagnóstico do KPI Capturas.
    const _rawT = summary.totals ?? {};
    const _capturesRaw = _rawT.captures;
    const _capturesTodayRaw = _rawT.captures_today;
    console.log(LOG, "DADOS_SUMMARY_TOTALS_DEBUG", {
      captures: _capturesRaw,
      captures_today: _capturesTodayRaw,
      generations: _rawT.generations,
      unique_visitors: _rawT.unique_visitors,
      totals_keys: Object.keys(_rawT),
    });
    if (
      _capturesRaw != null &&
      _capturesTodayRaw != null &&
      Number(_capturesTodayRaw) > Number(_capturesRaw)
    ) {
      console.warn(LOG, "DADOS_CAPTURE_TOTAL_INCONSISTENT", {
        captures: Number(_capturesRaw),
        captures_today: Number(_capturesTodayRaw),
      });
    }
    
    

    // hasRecords: para cada capital (lista curta, ≤ ~10), uma head-count em
    // pipoca_captures com LIMIT 1. Nenhuma chamada cresce com a base.
    const capitalsList = (capsAll ?? []) as Array<{ id: string }>;
    const hasRecordsChecks = await Promise.all(
      capitalsList.map(async (c) => {
        const { count } = await supabaseAdmin
          .from("pipoca_captures")
          .select("id", { count: "exact", head: true })
          .eq("capital_id", c.id)
          .limit(1);
        return [c.id, (count ?? 0) > 0] as const;
      }),
    );
    const hasRecordsSet = new Set(
      hasRecordsChecks.filter(([, has]) => has).map(([id]) => id),
    );

    const capitalsOpt: CapitalOption[] = (capsAll ?? []).map((c: any) => ({
      id: c.id as string,
      name: c.name as string,
      isSystem: Boolean(c.is_system),
      active: Boolean(c.active),
      selectable: Boolean(c.selectable),
      hasRecords: hasRecordsSet.has(c.id as string),
    }));
    const filmsOpt: FilmOption[] = (filmsAll ?? []).map((f: any) => ({
      id: f.id as string,
      title: f.title as string,
    }));

    const generationStatuses = ["queued", "processing", "completed", "failed"];
    const printStatuses = ["pending", "printing", "printed", "failed", "cleared", "cancelled"];

    // ── perCapital
    const perCapital: CapitalIndicators[] = (summary.per_capital ?? []).map((r) => ({
      capitalId: r.capital_id as string,
      capitalName: (r.capital_name as string) ?? "—",
      isSystem: Boolean(r.is_system),
      selectable: Boolean(r.selectable),
      active: Boolean(r.active),
      captures: Number(r.captures ?? 0),
      capturesToday: Number(r.captures_today ?? 0),
      generations: Number(r.generations ?? 0),
      generationsToday: Number(r.generations_today ?? 0),
      queuePending: Number(r.queue_pending ?? 0),
      queuePrinting: Number(r.queue_printing ?? 0),
      queuePrinted: Number(r.queue_printed ?? 0),
      queueTotal:
        Number(r.queue_pending ?? 0) +
        Number(r.queue_printing ?? 0) +
        Number(r.queue_printed ?? 0),
    }));

    // Reatribuição por DDD removida: registros novos respeitam a capital
    // escolhida pelo técnico. O histórico já foi categorizado e permanece
    // como está.

    // ── totals
    const t = summary.totals ?? {};
    const generationsTotal = Number(t.generations ?? 0);
    // Não mascarar ausência de dado como 0: se a RPC não retornar a chave
    // `captures`, mantemos null para que a UI exiba "—" em vez de zerar.
    const capturesTotal: number | null =
      t.captures == null ? null : Number(t.captures);
    const generationsCompleted = Number(t.generations_completed ?? 0);

    // ── details
    const capturesForDetails = capturesTotal ?? 0;
    const totalDetails =
      pageRows.length > 0 ? Number((pageRows[0] as any).total ?? 0) : capturesForDetails;
    const totalPages = Math.max(1, Math.ceil(totalDetails / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const startIdx = (safePage - 1) * PAGE_SIZE;

    const rows: DetailRow[] = pageRows.map((r: any) => ({
      captureId: r.capture_id as string,
      createdAt: r.created_at as string,
      capitalId: (r.capital_id as string | null) ?? null,
      capitalName: (r.capital_name as string | null) ?? (r.capital_id ? "—" : "Sem capital"),
      visitorFirstName: (r.visitor_first_name as string | null) ?? "—",
      visitorFullName: (r.visitor_full_name as string | null) ?? "—",
      whatsappMasked: maskWhatsapp(
        (r.whatsapp_e164 as string | null) ?? null,
        (r.whatsapp_last4 as string | null) ?? null,
      ),
      filmId: (r.film_id as string | null) ?? null,
      filmTitle: (r.film_title as string | null) ?? "—",
      generationId: (r.generation_id as string | null) ?? null,
      generationStatus: (r.generation_status as string | null) ?? null,
      generationAttempts: Number(r.generation_attempts ?? 0),
      printQueueId: (r.print_queue_id as string | null) ?? null,
      printStatus: (r.print_status as string | null) ?? null,
      publicToken: (r.public_token as string | null) ?? null,
    }));

    // ── Top films (ranking de filmes mais escolhidos para a foto, geral).
    // Conta capturas agrupando por sessions.selected_film_id. Volume previsto
    // baixo (~centenas), então agregamos em memória sem RPC dedicada.
    let topFilms: Array<{ filmId: string; title: string; captures: number }> = [];
    try {
      const { data: capFilmRows } = await supabaseAdmin
        .from("pipoca_captures")
        .select("id, pipoca_sessions!inner(selected_film_id)")
        .limit(10000);
      const counts = new Map<string, number>();
      for (const r of (capFilmRows ?? []) as any[]) {
        const fid = r?.pipoca_sessions?.selected_film_id as string | null | undefined;
        if (!fid) continue;
        counts.set(fid, (counts.get(fid) ?? 0) + 1);
      }
      const titleById = new Map(filmsOpt.map((f) => [f.id, f.title]));
      topFilms = Array.from(counts.entries())
        .map(([filmId, captures]) => ({
          filmId,
          title: titleById.get(filmId) ?? "—",
          captures,
        }))
        .sort((a, b) => b.captures - a.captures)
        .slice(0, 10);
    } catch (e) {
      console.warn(LOG, "DADOS_TOP_FILMS_FAILED", {
        message: e instanceof Error ? e.message : String(e),
      });
    }


    return {
      generatedAt: new Date().toISOString(),
      filters: {
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
        capitalId: data.capitalId ?? null,
        filmId: data.filmId ?? null,
        generationStatus: data.generationStatus ?? null,
        printStatus: data.printStatus ?? null,
        search: search ?? null,
        page: safePage,
      },
      todayBounds: today,
      totals: {
        captures: capturesTotal,
        capturesToday: Number(t.captures_today ?? 0),
        generations: generationsTotal,
        generationsToday: Number(t.generations_today ?? 0),
        generationsCompleted,
        generationsFailed: Number(t.generations_failed ?? 0),
        uniqueVisitors: Number(t.unique_visitors ?? 0),
        successRate: generationsTotal > 0 ? generationsCompleted / generationsTotal : 0,
        avgAttemptsPerCapture:
          capturesTotal != null && capturesTotal > 0 ? generationsTotal / capturesTotal : 0,
        queuePending: Number(t.queue_pending ?? 0),
        queuePrinting: Number(t.queue_printing ?? 0),
        queuePrinted: Number(t.queue_printed ?? 0),
        capturesWithoutCapital: Number(t.captures_without_capital ?? 0),
        generationsWithoutCapital: Number(t.generations_without_capital ?? 0),
        queueWithoutCapital: Number(t.queue_without_capital ?? 0),
      },
      perCapital,
      topFilms,
      details: {
        page: safePage,
        pageSize: PAGE_SIZE,
        total: totalDetails,
        totalPages,
        rangeStart: totalDetails === 0 ? 0 : startIdx + 1,
        rangeEnd: Math.min(startIdx + PAGE_SIZE, totalDetails),
        rows,
      },
      options: {
        capitals: capitalsOpt,
        films: filmsOpt,
        generationStatuses,
        printStatuses,
      },
    };
  });

// Ação administrativa: revelar WhatsApp completo. Não loga o número.
const RevealInput = z.object({ captureId: z.string().uuid() });
export const revealWhatsapp = createServerFn({ method: "POST" })
  .inputValidator((input) => RevealInput.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cap } = await supabaseAdmin
      .from("pipoca_captures")
      .select("session_id")
      .eq("id", data.captureId)
      .maybeSingle();
    if (!cap?.session_id) throw new Error("Captura não encontrada");
    const { data: sess } = await supabaseAdmin
      .from("pipoca_sessions")
      .select("visitor_id")
      .eq("id", cap.session_id)
      .maybeSingle();
    if (!sess?.visitor_id) throw new Error("Visitante não vinculado");
    const { data: v } = await supabaseAdmin
      .from("pipoca_visitors")
      .select("whatsapp_e164")
      .eq("id", sess.visitor_id)
      .maybeSingle();
    if (!v?.whatsapp_e164) throw new Error("Sem WhatsApp registrado");
    console.log(LOG, "WHATSAPP_REVEALED", { capture_id: data.captureId });
    return { whatsapp: v.whatsapp_e164 as string };
  });

// ────────────────────────── Visitantes (agrupados por WhatsApp) ──────────────────────────
// Lista de pessoas únicas (chave: whatsapp_e164) com contagem de gerações,
// capital mais recente e timestamp da última atividade. Sem `.in()` de
// tamanho proporcional ao conjunto — usamos embeds do PostgREST.

export type VisitorBreakdownRow = {
  visitorId: string;
  fullName: string;
  firstName: string;
  whatsappMasked: string;
  generations: number;
  lastCapitalId: string | null;
  lastCapitalName: string;
  lastGenerationAt: string | null;
};

export const getVisitorsBreakdown = createServerFn({ method: "POST" })
  .handler(async (): Promise<VisitorBreakdownRow[]> => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: gens, error: gErr }, { data: caps }] = await Promise.all([
      supabaseAdmin
        .from("pipoca_generations")
        .select(
          "id, capital_id, created_at, pipoca_sessions!inner(visitor_id, pipoca_visitors!inner(id, full_name, first_name, whatsapp_e164, whatsapp_last4))",
        )
        .order("created_at", { ascending: false })
        .limit(50000),
      supabaseAdmin.from("pipoca_capitals").select("id, name"),
    ]);

    if (gErr) {
      console.warn(LOG, "DADOS_VISITORS_LOAD_FAILED", {
        error_code: gErr.code,
        error_message: gErr.message,
      });
      throw new Error("Não foi possível carregar a lista de visitantes.");
    }

    const capName = new Map<string, string>(
      (caps ?? []).map((c: any) => [c.id as string, c.name as string]),
    );

    type Agg = {
      visitorId: string;
      fullName: string;
      firstName: string;
      e164: string | null;
      last4: string | null;
      count: number;
      lastCapitalId: string | null;
      lastAt: string | null;
    };
    const map = new Map<string, Agg>();
    for (const row of (gens ?? []) as any[]) {
      const sess = row?.pipoca_sessions;
      const v = sess?.pipoca_visitors;
      if (!v?.id) continue;
      const e164 = (v.whatsapp_e164 as string | null) ?? null;
      const key = e164 ?? `vid:${v.id}`;
      const existing = map.get(key);
      const createdAt = (row.created_at as string | null) ?? null;
      if (existing) {
        existing.count += 1;
        if (!existing.lastAt || (createdAt && createdAt > existing.lastAt)) {
          existing.lastAt = createdAt;
          existing.lastCapitalId = (row.capital_id as string | null) ?? null;
        }
      } else {
        map.set(key, {
          visitorId: v.id as string,
          fullName: (v.full_name as string) ?? "—",
          firstName: (v.first_name as string) ?? "—",
          e164,
          last4: (v.whatsapp_last4 as string | null) ?? null,
          count: 1,
          lastCapitalId: (row.capital_id as string | null) ?? null,
          lastAt: createdAt,
        });
      }
    }

    const rows: VisitorBreakdownRow[] = Array.from(map.values())
      .map((a) => ({
        visitorId: a.visitorId,
        fullName: a.fullName,
        firstName: a.firstName,
        whatsappMasked: maskWhatsapp(a.e164, a.last4),
        generations: a.count,
        lastCapitalId: a.lastCapitalId,
        lastCapitalName: a.lastCapitalId
          ? capName.get(a.lastCapitalId) ?? "—"
          : "Sem capital",
        lastGenerationAt: a.lastAt,
      }))
      .sort((a, b) => {
        if (b.generations !== a.generations) return b.generations - a.generations;
        return (b.lastGenerationAt ?? "").localeCompare(a.lastGenerationAt ?? "");
      });
    return rows;
  });

const RevealVisitorInput = z.object({ visitorId: z.string().uuid() });
export const revealVisitorWhatsapp = createServerFn({ method: "POST" })
  .inputValidator((input) => RevealVisitorInput.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: v } = await supabaseAdmin
      .from("pipoca_visitors")
      .select("whatsapp_e164")
      .eq("id", data.visitorId)
      .maybeSingle();
    if (!v?.whatsapp_e164) throw new Error("Sem WhatsApp registrado");
    console.log(LOG, "VISITOR_WHATSAPP_REVEALED", { visitor_id: data.visitorId });
    return { whatsapp: v.whatsapp_e164 as string };
  });
