// Print queue server functions. All access goes through supabaseAdmin and
// (for admin operations) a verified session cookie set by the PIN login.

import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  setCookie,
  deleteCookie,
} from "@tanstack/react-start/server";
import { z } from "zod";

const LOG = "[PIPOCA_PRINT]";
const GENERATED_BUCKET = "pipoca-generated-scenes";
const SIGNED_TTL = 60 * 30;

const TokenInput = z.object({ publicToken: z.string().trim().uuid() });

async function requireAdmin(): Promise<void> {
  const { PRINT_QUEUE_COOKIE, isValidSessionToken } = await import(
    "@/lib/pipoca/print-auth.server"
  );
  const tok = getCookie(PRINT_QUEUE_COOKIE);
  if (!isValidSessionToken(tok)) throw new Error("Unauthorized");
}

// ─── Public: visitor requests print from their phone ────────────────────
export const requestPipocaPrint = createServerFn({ method: "POST" })
  .inputValidator((input) => TokenInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: gen, error: gErr } = await supabaseAdmin
      .from("pipoca_generations")
      .select("id, session_id, capture_id, capital_id, final_image_path, public_token, status")
      .eq("public_token", data.publicToken)
      .eq("status", "completed")
      .maybeSingle();
    if (gErr) {
      console.warn(`${LOG} falha: geração`, {
        code: gErr.code, message: gErr.message, details: gErr.details, hint: gErr.hint,
      });
      throw new Error("Falha ao localizar geração");
    }
    if (!gen) throw new Error("Geração não encontrada");
    if (!gen.session_id) throw new Error("Geração sem sessão vinculada");
    console.log(`${LOG} geração localizada`, { generationId: gen.id });

    const { data: session, error: sErr } = await supabaseAdmin
      .from("pipoca_sessions")
      .select("id, visitor_id")
      .eq("id", gen.session_id)
      .maybeSingle();
    if (sErr) {
      console.warn(`${LOG} falha: sessão`, {
        code: sErr.code, message: sErr.message, details: sErr.details, hint: sErr.hint,
      });
      throw new Error("Falha ao localizar sessão");
    }
    if (!session) throw new Error("Sessão não encontrada");
    if (!session.visitor_id) {
      console.warn(`${LOG} sessão sem visitor_id`, { sessionId: session.id });
      throw new Error("Visitante não vinculado a esta cena");
    }
    console.log(`${LOG} sessão localizada`, { sessionId: session.id });

    const { data: visitor, error: vErr } = await supabaseAdmin
      .from("pipoca_visitors")
      .select("id")
      .eq("id", session.visitor_id)
      .maybeSingle();
    if (vErr || !visitor) {
      console.warn(`${LOG} falha: visitante`, {
        code: vErr?.code, message: vErr?.message, details: vErr?.details, hint: vErr?.hint,
      });
      throw new Error("Visitante não encontrado");
    }
    console.log(`${LOG} visitante localizado`);

    // Resolve + validate capital. generation/capture/print must agree.
    let captureCapitalId: string | null = null;
    if (gen.capture_id) {
      const { data: cap } = await supabaseAdmin
        .from("pipoca_captures")
        .select("capital_id")
        .eq("id", gen.capture_id)
        .maybeSingle();
      captureCapitalId = (cap?.capital_id as string | null) ?? null;
    }
    const genCapitalId = (gen.capital_id as string | null) ?? null;
    if (genCapitalId && captureCapitalId && genCapitalId !== captureCapitalId) {
      console.warn("[PIPOCA_PRINT_CAPITAL]", "PRINT_CAPITAL_MISMATCH", {
        generation_id: gen.id,
        generation_capital_id: genCapitalId,
        capture_capital_id: captureCapitalId,
      });
      throw new Error("PRINT_CAPITAL_MISMATCH");
    }
    let resolvedCapitalId = genCapitalId ?? captureCapitalId;
    if (!resolvedCapitalId) {
      const { data: unknown } = await supabaseAdmin
        .from("pipoca_capitals")
        .select("id")
        .eq("slug", "capital-desconhecida")
        .maybeSingle();
      resolvedCapitalId = (unknown?.id as string | null) ?? null;
    }
    if (!resolvedCapitalId) throw new Error("Capital indisponível");

    // Existing active request?
    const { data: existing } = await supabaseAdmin
      .from("pipoca_print_queue")
      .select("id, status")
      .eq("generation_id", gen.id)
      .in("status", ["pending", "printing"])
      .maybeSingle();
    if (existing) {
      return {
        success: true as const,
        alreadyRequested: true as const,
        alreadyQueued: true as const,
        queueId: existing.id as string,
        status: existing.status as string,
      };
    }

    const { data: inserted, error: iErr } = await supabaseAdmin
      .from("pipoca_print_queue")
      .insert({
        visitor_id: visitor.id,
        generation_id: gen.id,
        status: "pending",
        capital_id: resolvedCapitalId,
      })
      .select("id, status")
      .single();
    if (iErr || !inserted) {
      // Unique partial index conflict → another active request was just inserted; re-read.
      if (iErr?.code === "23505") {
        const { data: again } = await supabaseAdmin
          .from("pipoca_print_queue")
          .select("id, status")
          .eq("generation_id", gen.id)
          .in("status", ["pending", "printing"])
          .maybeSingle();
        if (again) {
          return {
            success: true as const,
            alreadyRequested: true as const,
            alreadyQueued: true as const,
            queueId: again.id as string,
            status: again.status as string,
          };
        }
      }
      console.warn(`${LOG} falha: insert`, {
        code: iErr?.code, message: iErr?.message, details: iErr?.details, hint: iErr?.hint,
      });
      throw new Error("Falha ao entrar na fila");
    }

    console.log(`${LOG} item criado na fila`, { queueId: inserted.id });
    console.log("[PIPOCA_PRINT_CAPITAL]", "PRINT_CAPITAL_ATTACHED", {
      queue_id: inserted.id,
      generation_id: gen.id,
      capital_id: resolvedCapitalId,
    });
    return {
      success: true as const,
      alreadyRequested: false as const,
      alreadyQueued: false as const,
      queueId: inserted.id as string,
      status: inserted.status as string,
    };
  });

// ─── Admin: PIN login / logout ───────────────────────────────────────────
const PinInput = z.object({ pin: z.string().min(1).max(64) });

export const loginPrintQueue = createServerFn({ method: "POST" })
  .inputValidator((input) => PinInput.parse(input))
  .handler(async ({ data }) => {
    const { verifyPin, issueSessionToken, PRINT_QUEUE_COOKIE } = await import(
      "@/lib/pipoca/print-auth.server"
    );
    if (!verifyPin(data.pin)) {
      // small delay would be nice; keep simple
      throw new Error("PIN inválido");
    }
    const { token, maxAge } = issueSessionToken();
    setCookie(PRINT_QUEUE_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge,
    });
    return { success: true as const };
  });

export const logoutPrintQueue = createServerFn({ method: "POST" }).handler(async () => {
  const { PRINT_QUEUE_COOKIE } = await import("@/lib/pipoca/print-auth.server");
  deleteCookie(PRINT_QUEUE_COOKIE, { path: "/" });
  return { success: true as const };
});

export const checkPrintQueueSession = createServerFn({ method: "GET" }).handler(async () => {
  const { PRINT_QUEUE_COOKIE, isValidSessionToken } = await import(
    "@/lib/pipoca/print-auth.server"
  );
  const tok = getCookie(PRINT_QUEUE_COOKIE);
  return { authenticated: isValidSessionToken(tok) };
});

// ─── Admin: list queue ───────────────────────────────────────────────────
const ListInput = z.object({
  search: z.string().trim().max(80).optional(),
  status: z
    .enum(["pending", "printing", "printed", "failed", "cleared", "cancelled", "active", "all"])
    .optional(),
  capitalId: z.string().uuid().optional(),
});

export type PrintQueueItem = {
  id: string;
  status: string;
  requestedAt: string;
  printingStartedAt: string | null;
  printedAt: string | null;
  generationId: string;
  filmTitle: string;
  visitorFirstName: string;
  visitorFullName: string;
  visitorWhatsappLast4: string;
  thumbnailUrl: string | null;
  capitalId: string | null;
  capitalName: string;
};

export const listPrintQueue = createServerFn({ method: "POST" })
  .inputValidator((input) => ListInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<{ items: PrintQueueItem[] }> => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("pipoca_print_queue")
      .select(
        "id, status, requested_at, printing_started_at, printed_at, generation_id, visitor_id, capital_id",
      )
      .order("requested_at", { ascending: false })
      .limit(200);

    const statusFilter = data.status ?? "active";
    if (statusFilter === "active") {
      q = q.in("status", ["pending", "printing"]);
    } else if (statusFilter !== "all") {
      q = q.eq("status", statusFilter);
    }
    if (data.capitalId) {
      q = q.eq("capital_id", data.capitalId);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error("Falha ao listar fila");
    if (!rows || rows.length === 0) return { items: [] };

    const visitorIds = [...new Set(rows.map((r) => r.visitor_id))];
    const generationIds = [...new Set(rows.map((r) => r.generation_id))];
    const capitalIds = [...new Set(rows.map((r) => r.capital_id).filter(Boolean) as string[])];

    const [{ data: visitors }, { data: gens }, { data: caps }] = await Promise.all([
      supabaseAdmin
        .from("pipoca_visitors")
        .select("id, first_name, full_name, whatsapp_last4")
        .in("id", visitorIds),
      supabaseAdmin
        .from("pipoca_generations")
        .select("id, final_image_path, film_id")
        .in("id", generationIds),
      capitalIds.length > 0
        ? supabaseAdmin.from("pipoca_capitals").select("id, name").in("id", capitalIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);

    const filmIds = [...new Set((gens ?? []).map((g) => g.film_id).filter(Boolean))];
    const { data: films } = await supabaseAdmin
      .from("pipoca_films")
      .select("id, title")
      .in("id", filmIds);

    const vMap = new Map((visitors ?? []).map((v) => [v.id, v]));
    const gMap = new Map((gens ?? []).map((g) => [g.id, g]));
    const fMap = new Map((films ?? []).map((f) => [f.id, f.title as string]));
    const cMap = new Map((caps ?? []).map((c) => [c.id as string, c.name as string]));

    // Sign thumbnails in parallel.
    const items: PrintQueueItem[] = await Promise.all(
      rows.map(async (r) => {
        const v = vMap.get(r.visitor_id);
        const g = gMap.get(r.generation_id);
        const filmTitle = (g && fMap.get(g.film_id)) || "Tela Brasil";
        let thumbnailUrl: string | null = null;
        if (g?.final_image_path) {
          const { data: signed } = await supabaseAdmin.storage
            .from(GENERATED_BUCKET)
            .createSignedUrl(g.final_image_path, SIGNED_TTL);
          thumbnailUrl = signed?.signedUrl ?? null;
        }
        const filtered = data.search?.toLowerCase().trim();
        if (filtered) {
          const hay = `${v?.full_name ?? ""} ${v?.first_name ?? ""} ${v?.whatsapp_last4 ?? ""}`.toLowerCase();
          if (!hay.includes(filtered)) return null as unknown as PrintQueueItem;
        }
        const capId = (r.capital_id as string | null) ?? null;
        return {
          id: r.id,
          status: r.status,
          requestedAt: r.requested_at,
          printingStartedAt: r.printing_started_at,
          printedAt: r.printed_at,
          generationId: r.generation_id,
          filmTitle,
          visitorFirstName: v?.first_name ?? "—",
          visitorFullName: v?.full_name ?? "—",
          visitorWhatsappLast4: v?.whatsapp_last4 ?? "—",
          thumbnailUrl,
          capitalId: capId,
          capitalName: (capId && cMap.get(capId)) || "Capital desconhecida",
        } satisfies PrintQueueItem;
      }),
    );

    return { items: items.filter(Boolean) };
  });

// Capitais que aparecem na fila (para popular o filtro).
export const listPrintQueueCapitals = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ capitals: Array<{ id: string; name: string; isSystem: boolean }> }> => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Pagina a leitura porque o PostgREST limita por padrão em 1000 linhas,
    // o que fazia capitais com itens após esse corte (ex.: Goiânia) sumirem do filtro.
    const PAGE_SIZE = 1000;
    const idSet = new Set<string>();
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data: rows, error } = await supabaseAdmin
        .from("pipoca_print_queue")
        .select("capital_id")
        .not("capital_id", "is", null)
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error("Falha ao listar capitais da fila");
      const batch = rows ?? [];
      for (const r of batch) {
        const cid = r.capital_id as string | null;
        if (cid) idSet.add(cid);
      }
      if (batch.length < PAGE_SIZE) break;
    }
    const ids = [...idSet];
    if (ids.length === 0) return { capitals: [] };
    const { data: caps } = await supabaseAdmin
      .from("pipoca_capitals")
      .select("id, name, is_system, display_order")
      .in("id", ids)
      .order("is_system", { ascending: true })
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    return {
      capitals: (caps ?? []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        isSystem: Boolean(c.is_system),
      })),
    };
  },
);

// ─── Admin: actions ──────────────────────────────────────────────────────
const QueueIdInput = z.object({ queueId: z.string().uuid() });

export const startPrintingItem = createServerFn({ method: "POST" })
  .inputValidator((input) => QueueIdInput.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("pipoca_print_queue")
      .update({
        status: "printing",
        printing_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.queueId)
      .in("status", ["pending", "printing", "failed"])
      .select("id, generation_id")
      .single();
    if (error || !row) throw new Error("Falha ao iniciar impressão");

    const { data: gen } = await supabaseAdmin
      .from("pipoca_generations")
      .select("final_image_path")
      .eq("id", row.generation_id)
      .single();

    let imageUrl: string | null = null;
    if (gen?.final_image_path) {
      const { data: signed } = await supabaseAdmin.storage
        .from(GENERATED_BUCKET)
        .createSignedUrl(gen.final_image_path, SIGNED_TTL);
      imageUrl = signed?.signedUrl ?? null;
    }
    console.log(`${LOG} impressão iniciada`, { queueId: row.id });
    return { success: true as const, imageUrl };
  });

export const getPrintItemImage = createServerFn({ method: "POST" })
  .inputValidator((input) => QueueIdInput.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("pipoca_print_queue")
      .select("generation_id")
      .eq("id", data.queueId)
      .single();
    if (!row) throw new Error("Item não encontrado");
    const { data: gen } = await supabaseAdmin
      .from("pipoca_generations")
      .select("final_image_path, film_id")
      .eq("id", row.generation_id)
      .single();
    if (!gen?.final_image_path) throw new Error("Imagem indisponível");
    const { data: signed } = await supabaseAdmin.storage
      .from(GENERATED_BUCKET)
      .createSignedUrl(gen.final_image_path, SIGNED_TTL);
    const { data: film } = await supabaseAdmin
      .from("pipoca_films")
      .select("title")
      .eq("id", gen.film_id)
      .maybeSingle();
    return { imageUrl: signed?.signedUrl ?? null, filmTitle: film?.title ?? "Tela Brasil" };
  });

export const markPrintedItem = createServerFn({ method: "POST" })
  .inputValidator((input) => QueueIdInput.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("pipoca_print_queue")
      .update({
        status: "printed",
        printed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.queueId);
    if (error) throw new Error("Falha ao marcar como impresso");
    console.log(`${LOG} impressão concluída`, { queueId: data.queueId });
    return { success: true as const };
  });

export const cancelPrintItem = createServerFn({ method: "POST" })
  .inputValidator((input) => QueueIdInput.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("pipoca_print_queue")
      .update({
        status: "cancelled",
        cleared_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.queueId);
    if (error) throw new Error("Falha ao cancelar");
    return { success: true as const };
  });

export const clearPrintQueue = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("pipoca_print_queue")
    .update({ status: "cleared", cleared_at: now, updated_at: now })
    .in("status", ["pending", "printing", "failed"])
    .select("id");
  if (error) throw new Error("Falha ao zerar fila");
  console.log(`${LOG} fila zerada`, { count: rows?.length ?? 0 });
  return { success: true as const, cleared: rows?.length ?? 0 };
});

export const countActivePrintQueue = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("pipoca_print_queue")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "printing", "failed"]);
  if (error) throw new Error("Falha ao contar fila");
  return { count: count ?? 0 };
});
