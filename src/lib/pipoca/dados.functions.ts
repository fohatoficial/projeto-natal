// Painel /dados — indicadores agregados + listagem detalhada por captura.
// PIN-protegido (cookie pipoca_pq compartilhado com a fila).

import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";

const LOG = "[PIPOCA_DADOS]";
const MAX_FILTERED_CAPTURES = 5000;
const PAGE_SIZE = 25;

async function requireAdmin(): Promise<void> {
  const { PRINT_QUEUE_COOKIE, isValidSessionToken } = await import(
    "@/lib/pipoca/print-auth.server"
  );
  const tok = getCookie(PRINT_QUEUE_COOKIE);
  if (!isValidSessionToken(tok)) throw new Error("Unauthorized");
}

// ────────────────────────── helpers de tempo (America/Sao_Paulo) ──────────────────────────

// Converte uma data civil (YYYY-MM-DD HH:mm:ss) interpretada em America/Sao_Paulo
// para o instante UTC correspondente, levando em conta DST/offset reais via Intl.
function saoPauloCivilToUTC(
  y: number,
  m: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
): Date {
  const asIfUTC = Date.UTC(y, m - 1, d, h, mi, s);
  // Pergunta ao Intl: dado esse instante UTC, que parede o relógio em SP marca?
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
  const offsetMs = wallAsUTC - asIfUTC; // local - utc
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
  const start = saoPauloCivilToUTC(y, m, d, 0, 0, 0);
  const end = saoPauloCivilToUTC(y, m, d + 1, 0, 0, 0);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
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
  const startISO = a ? saoPauloCivilToUTC(a.y, a.m, a.d, 0, 0, 0).toISOString() : null;
  const endISO = b ? saoPauloCivilToUTC(b.y, b.m, b.d + 1, 0, 0, 0).toISOString() : null;
  return { startISO, endISO };
}

// ────────────────────────── tipos ──────────────────────────

export type DadosFilters = {
  startDate?: string | null; // YYYY-MM-DD em SP
  endDate?: string | null;   // YYYY-MM-DD em SP (inclusivo)
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
    captures: number;
    capturesToday: number;
    generations: number;
    generationsToday: number;
    generationsCompleted: number;
    generationsFailed: number;
    uniqueVisitors: number;
    successRate: number; // 0..1
    avgAttemptsPerCapture: number;
    queuePending: number;
    queuePrinting: number;
    queuePrinted: number;
    capturesWithoutCapital: number;
    generationsWithoutCapital: number;
    queueWithoutCapital: number;
  };
  perCapital: CapitalIndicators[];
  details: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    rangeStart: number; // 1-based
    rangeEnd: number;   // 1-based inclusive
    rows: DetailRow[];
    truncated: boolean; // true se filtro excedeu MAX_FILTERED_CAPTURES
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
  page: z.number().int().positive().max(10000).nullable().optional(),
});

// ────────────────────────── helpers de query ──────────────────────────

function maskWhatsapp(e164: string | null, last4: string | null): string {
  if (last4 && /^\d{4}$/.test(last4)) {
    if (e164 && e164.length >= 6) {
      // (62) •••••-1234
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

function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "");
}

// ────────────────────────── server fn ──────────────────────────

export const getDadosSummary = createServerFn({ method: "POST" })
  .inputValidator((input) => FiltersSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<DadosSummary> => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const today = todayBoundsSP();
    const range = rangeBoundsSP(data.startDate ?? null, data.endDate ?? null);
    const search = normalizeSearch(data.search ?? null);
    const page = Math.max(1, data.page ?? 1);

    // 1) Options — capitais (todas, com flag hasRecords) + filmes + statuses fixos
    const [{ data: capsAll }, { data: filmsAll }] = await Promise.all([
      supabaseAdmin
        .from("pipoca_capitals")
        .select("id, name, is_system, selectable, active, display_order")
        .order("is_system", { ascending: true })
        .order("display_order", { ascending: true })
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("pipoca_films")
        .select("id, title")
        .order("title", { ascending: true }),
    ]);

    // hasRecords: capitais com pelo menos uma captura.
    const { data: capUsage } = await supabaseAdmin
      .from("pipoca_captures")
      .select("capital_id")
      .not("capital_id", "is", null)
      .limit(100000);
    const usedCapitals = new Set<string>(
      (capUsage ?? []).map((r) => r.capital_id as string),
    );

    const capitalsOpt: CapitalOption[] = (capsAll ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      isSystem: Boolean(c.is_system),
      active: Boolean(c.active),
      selectable: Boolean(c.selectable),
      hasRecords: usedCapitals.has(c.id as string),
    }));

    const filmsOpt: FilmOption[] = (filmsAll ?? []).map((f) => ({
      id: f.id as string,
      title: f.title as string,
    }));

    const generationStatuses = ["queued", "processing", "completed", "failed"];
    const printStatuses = ["pending", "printing", "printed", "failed", "cleared", "cancelled"];

    // 2) Resolver pré-filtros que afetam o conjunto de capture_ids candidatos

    // 2a) sessões filtradas por filme (se filmId)
    let allowedSessionIds: string[] | null = null;
    if (data.filmId) {
      const { data: s } = await supabaseAdmin
        .from("pipoca_sessions")
        .select("id")
        .eq("selected_film_id", data.filmId)
        .limit(MAX_FILTERED_CAPTURES);
      allowedSessionIds = (s ?? []).map((r) => r.id as string);
      if (allowedSessionIds.length === 0) allowedSessionIds = ["00000000-0000-0000-0000-000000000000"];
    }

    // 2b) visitantes por busca
    let allowedVisitorIds: string[] | null = null;
    if (search) {
      const digits = digitsOnly(search);
      let vq = supabaseAdmin.from("pipoca_visitors").select("id").limit(2000);
      if (digits.length >= 3) {
        vq = vq.or(
          `whatsapp_e164.ilike.%${digits}%,whatsapp_last4.ilike.%${digits}%`,
        );
      } else {
        const safe = search.replace(/[%,]/g, " ").trim();
        vq = vq.or(`full_name.ilike.%${safe}%,first_name.ilike.%${safe}%`);
      }
      const { data: vs } = await vq;
      allowedVisitorIds = (vs ?? []).map((r) => r.id as string);
      if (allowedVisitorIds.length === 0) {
        allowedVisitorIds = ["00000000-0000-0000-0000-000000000000"];
      }
    }

    // Sessões cruzando filme + visitante (se houver filtros)
    let sessionAllowed: Set<string> | null = null;
    if (allowedSessionIds || allowedVisitorIds) {
      let sq = supabaseAdmin.from("pipoca_sessions").select("id").limit(MAX_FILTERED_CAPTURES);
      if (allowedSessionIds) sq = sq.in("id", allowedSessionIds);
      if (allowedVisitorIds) sq = sq.in("visitor_id", allowedVisitorIds);
      const { data } = await sq;
      sessionAllowed = new Set((data ?? []).map((r) => r.id as string));
      if (sessionAllowed.size === 0) {
        sessionAllowed = new Set(["00000000-0000-0000-0000-000000000000"]);
      }
    }

    // 2c) capture_ids por status de geração
    let captureIdsByGenStatus: Set<string> | null = null;
    if (data.generationStatus) {
      const { data: gs } = await supabaseAdmin
        .from("pipoca_generations")
        .select("capture_id")
        .eq("status", data.generationStatus)
        .not("capture_id", "is", null)
        .limit(MAX_FILTERED_CAPTURES);
      captureIdsByGenStatus = new Set(
        (gs ?? []).map((r) => r.capture_id as string).filter(Boolean),
      );
      if (captureIdsByGenStatus.size === 0) {
        captureIdsByGenStatus = new Set(["00000000-0000-0000-0000-000000000000"]);
      }
    }

    // 2d) capture_ids por status de impressão (via generation)
    let captureIdsByPrintStatus: Set<string> | null = null;
    if (data.printStatus) {
      const { data: pq } = await supabaseAdmin
        .from("pipoca_print_queue")
        .select("generation_id")
        .eq("status", data.printStatus)
        .limit(MAX_FILTERED_CAPTURES);
      const genIds = [...new Set((pq ?? []).map((r) => r.generation_id as string))];
      if (genIds.length === 0) {
        captureIdsByPrintStatus = new Set(["00000000-0000-0000-0000-000000000000"]);
      } else {
        const { data: gs } = await supabaseAdmin
          .from("pipoca_generations")
          .select("capture_id")
          .in("id", genIds)
          .not("capture_id", "is", null);
        captureIdsByPrintStatus = new Set(
          (gs ?? []).map((r) => r.capture_id as string).filter(Boolean),
        );
        if (captureIdsByPrintStatus.size === 0) {
          captureIdsByPrintStatus = new Set(["00000000-0000-0000-0000-000000000000"]);
        }
      }
    }

    // 3) Conjunto de capturas filtradas (apenas ids + meta mínima)
    let cq = supabaseAdmin
      .from("pipoca_captures")
      .select("id, created_at, capital_id, session_id")
      .order("created_at", { ascending: false })
      .limit(MAX_FILTERED_CAPTURES);

    if (range.startISO) cq = cq.gte("created_at", range.startISO);
    if (range.endISO) cq = cq.lt("created_at", range.endISO);
    if (data.capitalId) cq = cq.eq("capital_id", data.capitalId);
    if (sessionAllowed) cq = cq.in("session_id", Array.from(sessionAllowed));
    if (captureIdsByGenStatus) cq = cq.in("id", Array.from(captureIdsByGenStatus));
    if (captureIdsByPrintStatus) cq = cq.in("id", Array.from(captureIdsByPrintStatus));

    const { data: captureRows, error: capErr } = await cq;
    if (capErr) {
      console.warn(LOG, "captures fail", { code: capErr.code });
      throw new Error("Falha ao consultar capturas");
    }
    const captures = captureRows ?? [];
    const truncated = captures.length >= MAX_FILTERED_CAPTURES;

    const captureIds = captures.map((c) => c.id as string);
    const sessionIds = [...new Set(captures.map((c) => c.session_id as string))];

    // 4) Buscar gerações (todas) dessas capturas
    let allGens: Array<{
      id: string;
      capture_id: string | null;
      status: string;
      created_at: string;
      film_id: string | null;
      public_token: string | null;
    }> = [];
    if (captureIds.length > 0) {
      const { data: gs } = await supabaseAdmin
        .from("pipoca_generations")
        .select("id, capture_id, status, created_at, film_id, public_token")
        .in("capture_id", captureIds)
        .order("created_at", { ascending: false });
      allGens = (gs ?? []) as typeof allGens;
    }

    // Última geração por captura + contagem de tentativas
    const latestGenByCapture = new Map<string, (typeof allGens)[number]>();
    const attemptsByCapture = new Map<string, number>();
    for (const g of allGens) {
      const cid = g.capture_id;
      if (!cid) continue;
      attemptsByCapture.set(cid, (attemptsByCapture.get(cid) ?? 0) + 1);
      if (!latestGenByCapture.has(cid)) latestGenByCapture.set(cid, g);
    }

    // 5) Sessões → visitor + film
    let sessionMap = new Map<
      string,
      { visitor_id: string | null; selected_film_id: string | null }
    >();
    if (sessionIds.length > 0) {
      const { data: ss } = await supabaseAdmin
        .from("pipoca_sessions")
        .select("id, visitor_id, selected_film_id")
        .in("id", sessionIds);
      for (const s of ss ?? []) {
        sessionMap.set(s.id as string, {
          visitor_id: (s.visitor_id as string | null) ?? null,
          selected_film_id: (s.selected_film_id as string | null) ?? null,
        });
      }
    }

    // 6) Visitors + films + capitals
    const visitorIds = [...new Set(
      [...sessionMap.values()].map((v) => v.visitor_id).filter(Boolean) as string[],
    )];
    const filmIds = [...new Set(
      [...sessionMap.values()].map((v) => v.selected_film_id).filter(Boolean) as string[],
    )];
    const capitalIdsInPage = [...new Set(
      captures.map((c) => c.capital_id as string | null).filter(Boolean) as string[],
    )];

    const [{ data: vs }, { data: fs }, { data: cps }] = await Promise.all([
      visitorIds.length > 0
        ? supabaseAdmin
            .from("pipoca_visitors")
            .select("id, first_name, full_name, whatsapp_e164, whatsapp_last4")
            .in("id", visitorIds)
        : Promise.resolve({ data: [] as Array<any> }),
      filmIds.length > 0
        ? supabaseAdmin.from("pipoca_films").select("id, title").in("id", filmIds)
        : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
      capitalIdsInPage.length > 0
        ? supabaseAdmin
            .from("pipoca_capitals")
            .select("id, name")
            .in("id", capitalIdsInPage)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);

    const visitorMap = new Map((vs ?? []).map((v: any) => [v.id as string, v]));
    const filmMap = new Map((fs ?? []).map((f: any) => [f.id as string, f.title as string]));
    const capitalMap = new Map((cps ?? []).map((c: any) => [c.id as string, c.name as string]));

    // 7) Print queue para as gerações
    const genIds = [...latestGenByCapture.values()].map((g) => g.id);
    let printByGen = new Map<string, { id: string; status: string }>();
    if (genIds.length > 0) {
      const { data: pq } = await supabaseAdmin
        .from("pipoca_print_queue")
        .select("id, generation_id, status, requested_at")
        .in("generation_id", genIds)
        .order("requested_at", { ascending: false });
      for (const r of pq ?? []) {
        const gid = r.generation_id as string;
        if (!printByGen.has(gid)) {
          printByGen.set(gid, { id: r.id as string, status: r.status as string });
        }
      }
    }

    // 8) Totais e per-capital agregados a partir do conjunto filtrado
    let capturesToday = 0;
    const perCapAgg = new Map<
      string,
      {
        captures: number;
        capturesToday: number;
        generations: number;
        generationsToday: number;
        queuePending: number;
        queuePrinting: number;
        queuePrinted: number;
      }
    >();
    function bump(capId: string) {
      if (!perCapAgg.has(capId)) {
        perCapAgg.set(capId, {
          captures: 0,
          capturesToday: 0,
          generations: 0,
          generationsToday: 0,
          queuePending: 0,
          queuePrinting: 0,
          queuePrinted: 0,
        });
      }
      return perCapAgg.get(capId)!;
    }

    const NONE_CAP = "__none__";
    let generationsCompleted = 0;
    let generationsFailed = 0;
    let generationsToday = 0;

    const uniqueWhatsapps = new Set<string>();
    const uniqueVisitorsFallback = new Set<string>();

    for (const c of captures) {
      const capId = (c.capital_id as string | null) ?? NONE_CAP;
      const agg = bump(capId);
      agg.captures += 1;
      const createdAt = c.created_at as string;
      const isToday = createdAt >= today.startISO && createdAt < today.endISO;
      if (isToday) {
        capturesToday += 1;
        agg.capturesToday += 1;
      }
      const sess = sessionMap.get(c.session_id as string);
      if (sess?.visitor_id) {
        const v: any = visitorMap.get(sess.visitor_id);
        if (v?.whatsapp_e164) uniqueWhatsapps.add(v.whatsapp_e164 as string);
        else uniqueVisitorsFallback.add(sess.visitor_id);
      }
    }

    for (const g of allGens) {
      const cap = captures.find((c) => c.id === g.capture_id);
      const capId = (cap?.capital_id as string | null) ?? NONE_CAP;
      const agg = bump(capId);
      agg.generations += 1;
      if (g.created_at >= today.startISO && g.created_at < today.endISO) {
        agg.generationsToday += 1;
        generationsToday += 1;
      }
      if (g.status === "completed") generationsCompleted += 1;
      if (g.status === "failed") generationsFailed += 1;
    }
    const generationsTotal = allGens.length;

    // Print queue agregado: percorre printByGen (apenas última de cada geração da página)
    // Para indicadores mais completos, busca todas as queue rows das gerações.
    if (genIds.length > 0) {
      const { data: pqAll } = await supabaseAdmin
        .from("pipoca_print_queue")
        .select("status, generation_id")
        .in("generation_id", genIds);
      for (const r of pqAll ?? []) {
        const g = allGens.find((x) => x.id === r.generation_id);
        const cap = g ? captures.find((c) => c.id === g.capture_id) : null;
        const capId = (cap?.capital_id as string | null) ?? NONE_CAP;
        const agg = bump(capId);
        if (r.status === "pending") agg.queuePending += 1;
        else if (r.status === "printing") agg.queuePrinting += 1;
        else if (r.status === "printed") agg.queuePrinted += 1;
      }
    }

    // Resolver nome das capitais agregadas (inclui as não presentes na página)
    const capitalNameMap = new Map<string, { name: string; isSystem: boolean; selectable: boolean; active: boolean }>();
    for (const c of capsAll ?? []) {
      capitalNameMap.set(c.id as string, {
        name: c.name as string,
        isSystem: Boolean(c.is_system),
        selectable: Boolean(c.selectable),
        active: Boolean(c.active),
      });
    }

    const perCapital: CapitalIndicators[] = [];
    for (const [capId, agg] of perCapAgg.entries()) {
      if (capId === NONE_CAP) continue;
      const meta = capitalNameMap.get(capId);
      perCapital.push({
        capitalId: capId,
        capitalName: meta?.name ?? "—",
        isSystem: meta?.isSystem ?? false,
        selectable: meta?.selectable ?? false,
        active: meta?.active ?? false,
        captures: agg.captures,
        capturesToday: agg.capturesToday,
        generations: agg.generations,
        generationsToday: agg.generationsToday,
        queuePending: agg.queuePending,
        queuePrinting: agg.queuePrinting,
        queuePrinted: agg.queuePrinted,
        queueTotal: agg.queuePending + agg.queuePrinting + agg.queuePrinted,
      });
    }
    perCapital.sort((a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? 1 : -1;
      return b.captures - a.captures;
    });

    // 9) "Sem capital" — sempre globais (não dependem de filtro de capital)
    const [
      { count: capturesNullCap },
      { count: generationsNullCap },
      { count: queueNullCap },
    ] = await Promise.all([
      supabaseAdmin
        .from("pipoca_captures")
        .select("id", { count: "exact", head: true })
        .is("capital_id", null),
      supabaseAdmin
        .from("pipoca_generations")
        .select("id", { count: "exact", head: true })
        .is("capital_id", null),
      supabaseAdmin
        .from("pipoca_print_queue")
        .select("id", { count: "exact", head: true })
        .is("capital_id", null),
    ]);

    // 10) Paginação detalhada
    const total = captures.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const startIdx = (safePage - 1) * PAGE_SIZE;
    const pageSlice = captures.slice(startIdx, startIdx + PAGE_SIZE);

    const rows: DetailRow[] = pageSlice.map((c) => {
      const cid = c.id as string;
      const sess = sessionMap.get(c.session_id as string);
      const v: any = sess?.visitor_id ? visitorMap.get(sess.visitor_id) : null;
      const filmId = sess?.selected_film_id ?? null;
      const filmTitle = (filmId && filmMap.get(filmId)) || "—";
      const latest = latestGenByCapture.get(cid) ?? null;
      const print = latest ? printByGen.get(latest.id) ?? null : null;
      const capId = (c.capital_id as string | null) ?? null;
      return {
        captureId: cid,
        createdAt: c.created_at as string,
        capitalId: capId,
        capitalName: capId ? (capitalMap.get(capId) ?? capitalNameMap.get(capId)?.name ?? "—") : "Sem capital",
        visitorFirstName: v?.first_name ?? "—",
        visitorFullName: v?.full_name ?? "—",
        whatsappMasked: maskWhatsapp(v?.whatsapp_e164 ?? null, v?.whatsapp_last4 ?? null),
        filmId,
        filmTitle,
        generationId: latest?.id ?? null,
        generationStatus: latest?.status ?? null,
        generationAttempts: attemptsByCapture.get(cid) ?? 0,
        printQueueId: print?.id ?? null,
        printStatus: print?.status ?? null,
        publicToken: latest?.public_token ?? null,
      };
    });

    const uniqueVisitors = uniqueWhatsapps.size + uniqueVisitorsFallback.size;
    const successRate = generationsTotal > 0 ? generationsCompleted / generationsTotal : 0;
    const avgAttemptsPerCapture =
      captures.length > 0 ? generationsTotal / captures.length : 0;

    // Totais da fila no conjunto filtrado
    let queuePending = 0;
    let queuePrinting = 0;
    let queuePrinted = 0;
    for (const v of perCapAgg.values()) {
      queuePending += v.queuePending;
      queuePrinting += v.queuePrinting;
      queuePrinted += v.queuePrinted;
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
        captures: total,
        capturesToday,
        generations: generationsTotal,
        generationsToday,
        generationsCompleted,
        generationsFailed,
        uniqueVisitors,
        successRate,
        avgAttemptsPerCapture,
        queuePending,
        queuePrinting,
        queuePrinted,
        capturesWithoutCapital: capturesNullCap ?? 0,
        generationsWithoutCapital: generationsNullCap ?? 0,
        queueWithoutCapital: queueNullCap ?? 0,
      },
      perCapital,
      details: {
        page: safePage,
        pageSize: PAGE_SIZE,
        total,
        totalPages,
        rangeStart: total === 0 ? 0 : startIdx + 1,
        rangeEnd: Math.min(startIdx + PAGE_SIZE, total),
        rows,
        truncated,
      },
      options: {
        capitals: capitalsOpt,
        films: filmsOpt,
        generationStatuses,
        printStatuses,
      },
    };
  });

// Ação administrativa: revelar WhatsApp completo de um visitante.
// Não loga o número.
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
    // Não inclui o número em log.
    console.log(LOG, "WHATSAPP_REVEALED", { capture_id: data.captureId });
    return { whatsapp: v.whatsapp_e164 as string };
  });
