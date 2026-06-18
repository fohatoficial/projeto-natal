import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  checkPrintQueueSession,
  loginPrintQueue,
  logoutPrintQueue,
} from "@/lib/pipoca/print-queue.functions";
import {
  getDadosSummary,
  revealWhatsapp,
  type DadosSummary,
  type DetailRow,
} from "@/lib/pipoca/dados.functions";

export const Route = createFileRoute("/dados")({
  head: () => ({
    meta: [
      { title: "Dados — Pipoca & Cena" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DadosPage,
});

function DadosPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const checkFn = useServerFn(checkPrintQueueSession);

  useEffect(() => {
    (async () => {
      try {
        const r = await checkFn({});
        setAuthed(r.authenticated);
      } catch {
        setAuthed(false);
      }
    })();
  }, [checkFn]);

  if (authed === null) {
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-[#000C20] text-white">
        <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-gold animate-spin" />
      </div>
    );
  }
  if (!authed) return <PinForm onAuthed={() => setAuthed(true)} />;
  return <DadosView onSignOut={() => setAuthed(false)} />;
}

function PinForm({ onAuthed }: { onAuthed: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const login = useServerFn(loginPrintQueue);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login({ data: { pin } });
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] grid place-items-center bg-[#000C20] text-white px-5">
      <form
        onSubmit={submit}
        className="w-full max-w-sm border border-white/15 rounded-2xl p-6 flex flex-col gap-4"
      >
        <h1 className="font-display text-2xl text-center">
          PAINEL DE <span className="text-gold">DADOS</span>
        </h1>
        <p className="text-sm text-white/70 text-center">
          Informe o PIN da recepcionista.
        </p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          className="w-full bg-black/40 border border-white/20 rounded-md px-3 py-3 text-center text-lg tracking-[0.5em]"
        />
        {error && <p className="text-red-300 text-sm text-center">{error}</p>}
        <button
          disabled={loading || pin.length === 0}
          className="w-full bg-gold text-[#000C20] font-semibold uppercase tracking-wider rounded-md py-3 disabled:opacity-60"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
        <Link to="/" className="text-xs text-center text-white/50 underline">
          Voltar para a experiência
        </Link>
      </form>
    </div>
  );
}

type FiltersState = {
  startDate: string;
  endDate: string;
  capitalId: string;
  filmId: string;
  generationStatus: string;
  printStatus: string;
  search: string;
};

const EMPTY: FiltersState = {
  startDate: "",
  endDate: "",
  capitalId: "",
  filmId: "",
  generationStatus: "",
  printStatus: "",
  search: "",
};

function DadosView({ onSignOut }: { onSignOut: () => void }) {
  const [data, setData] = useState<DadosSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FiltersState>(EMPTY);
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(EMPTY);
  const [page, setPage] = useState(1);

  const fetchSummary = useServerFn(getDadosSummary);
  const logout = useServerFn(logoutPrintQueue);
  const reveal = useServerFn(revealWhatsapp);

  const load = useCallback(
    async (af: FiltersState, p: number) => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetchSummary({
          data: {
            startDate: af.startDate || null,
            endDate: af.endDate || null,
            capitalId: af.capitalId || null,
            filmId: af.filmId || null,
            generationStatus: af.generationStatus || null,
            printStatus: af.printStatus || null,
            search: af.search || null,
            page: p,
          },
        });
        setData(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar");
      } finally {
        setLoading(false);
      }
    },
    [fetchSummary],
  );

  useEffect(() => {
    load(appliedFilters, page);
  }, [load, appliedFilters, page]);

  function applyFilters() {
    setAppliedFilters(filters);
    setPage(1);
  }
  function clearFilters() {
    setFilters(EMPTY);
    setAppliedFilters(EMPTY);
    setPage(1);
  }

  return (
    <div className="min-h-[100dvh] bg-[#000C20] text-white">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl md:text-3xl">
              PAINEL DE <span className="text-gold">DADOS</span>
            </h1>
            <p className="text-xs text-white/60">
              Indicadores por capital · Pipoca & Cena
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => load(appliedFilters, page)}
              disabled={loading}
              className="text-sm border border-white/20 rounded-md px-3 py-2 hover:bg-white/10 disabled:opacity-60"
            >
              {loading ? "Atualizando…" : "Atualizar"}
            </button>
            <Link
              to="/fila-de-impressao"
              className="text-sm border border-white/20 rounded-md px-3 py-2 hover:bg-white/10"
            >
              Fila
            </Link>
            <button
              onClick={async () => {
                await logout();
                onSignOut();
              }}
              className="text-sm border border-white/20 rounded-md px-3 py-2 hover:bg-white/10"
            >
              Sair
            </button>
          </div>
        </header>

        {error && (
          <div className="border border-red-400/50 bg-red-500/10 text-red-200 rounded-md px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <FiltersBar
          filters={filters}
          options={data?.options}
          onChange={setFilters}
          onApply={applyFilters}
          onClear={clearFilters}
          loading={loading}
        />

        {data && (
          <>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Capturas (total)" value={data.totals.captures} sub={`hoje: ${data.totals.capturesToday}`} />
              <Kpi label="Gerações (total)" value={data.totals.generations} sub={`hoje: ${data.totals.generationsToday}`} />
              <Kpi label="Fila pendente" value={data.totals.queuePending} sub={`imprimindo: ${data.totals.queuePrinting}`} />
              <Kpi label="Já impressos" value={data.totals.queuePrinted} />
            </section>

            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi
                label="Visitantes únicos"
                value={data.totals.uniqueVisitors}
                sub="por WhatsApp"
              />
              <Kpi
                label="Taxa de sucesso"
                value={Math.round(data.totals.successRate * 1000) / 10}
                sub={`gerações concluídas / total`}
                suffix="%"
              />
              <Kpi label="Gerações com erro" value={data.totals.generationsFailed} />
              <Kpi
                label="Tentativas / captura"
                value={Math.round(data.totals.avgAttemptsPerCapture * 100) / 100}
              />
            </section>

            <section className="border border-white/10 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg">Por capital</h2>
                <span className="text-xs text-white/50">
                  Atualizado em {new Date(data.generatedAt).toLocaleString("pt-BR")}
                  {data.details.truncated && (
                    <span className="ml-2 text-amber-300">
                      (conjunto limitado a 5000 capturas — refine os filtros)
                    </span>
                  )}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-white/70">
                    <tr>
                      <th className="text-left px-3 py-2">Capital</th>
                      <th className="text-right px-3 py-2">Capturas</th>
                      <th className="text-right px-3 py-2">Hoje</th>
                      <th className="text-right px-3 py-2">Gerações</th>
                      <th className="text-right px-3 py-2">Hoje</th>
                      <th className="text-right px-3 py-2">Pend.</th>
                      <th className="text-right px-3 py-2">Impr.</th>
                      <th className="text-right px-3 py-2">Concl.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perCapital.length === 0 && (
                      <tr><td colSpan={8} className="text-center text-white/50 py-6">Nenhum registro para os filtros.</td></tr>
                    )}
                    {data.perCapital.map((c) => (
                      <tr key={c.capitalId} className="border-t border-white/5 hover:bg-white/5">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span>{c.capitalName}</span>
                            {c.isSystem && (
                              <span className="text-[10px] uppercase tracking-wider bg-white/10 px-1.5 py-0.5 rounded">sistema</span>
                            )}
                            {!c.active && (
                              <span className="text-[10px] uppercase tracking-wider bg-red-500/20 text-red-200 px-1.5 py-0.5 rounded">inativa</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">{c.captures}</td>
                        <td className="px-3 py-2 text-right text-gold">{c.capturesToday}</td>
                        <td className="px-3 py-2 text-right">{c.generations}</td>
                        <td className="px-3 py-2 text-right text-gold">{c.generationsToday}</td>
                        <td className="px-3 py-2 text-right">{c.queuePending}</td>
                        <td className="px-3 py-2 text-right">{c.queuePrinting}</td>
                        <td className="px-3 py-2 text-right">{c.queuePrinted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <DetailsSection
              data={data}
              page={page}
              onPageChange={setPage}
              onReveal={async (captureId) => {
                const r = await reveal({ data: { captureId } });
                return r.whatsapp;
              }}
            />

            <section className="border border-white/10 rounded-xl p-4">
              <h2 className="font-display text-lg mb-3">Registros sem capital</h2>
              <p className="text-xs text-white/60 mb-3">
                Após o backfill da migration, esses números devem permanecer em zero.
                Qualquer valor maior indica registros novos sem vínculo de capital.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Kpi label="Capturas sem capital" value={data.totals.capturesWithoutCapital} tone={data.totals.capturesWithoutCapital > 0 ? "warn" : "ok"} />
                <Kpi label="Gerações sem capital" value={data.totals.generationsWithoutCapital} tone={data.totals.generationsWithoutCapital > 0 ? "warn" : "ok"} />
                <Kpi label="Fila sem capital" value={data.totals.queueWithoutCapital} tone={data.totals.queueWithoutCapital > 0 ? "warn" : "ok"} />
              </div>
            </section>
          </>
        )}

        {!data && !error && (
          <div className="text-white/60 text-sm">Carregando indicadores…</div>
        )}
      </div>
    </div>
  );
}

function FiltersBar({
  filters,
  options,
  onChange,
  onApply,
  onClear,
  loading,
}: {
  filters: FiltersState;
  options: DadosSummary["options"] | undefined;
  onChange: (f: FiltersState) => void;
  onApply: () => void;
  onClear: () => void;
  loading: boolean;
}) {
  const capitals = options?.capitals ?? [];
  // Capitais visíveis no filtro: reais selecionáveis + inativas com registros + system com registros.
  const visibleCapitals = useMemo(
    () =>
      capitals.filter(
        (c) =>
          (c.active && c.selectable && !c.isSystem) ||
          (!c.active && c.hasRecords) ||
          (c.isSystem && c.hasRecords),
      ),
    [capitals],
  );

  function set<K extends keyof FiltersState>(k: K, v: FiltersState[K]) {
    onChange({ ...filters, [k]: v });
  }

  return (
    <section className="border border-white/10 rounded-xl p-4 flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Data inicial">
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded-md px-2 py-2 text-sm"
          />
        </Field>
        <Field label="Data final">
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => set("endDate", e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded-md px-2 py-2 text-sm"
          />
        </Field>
        <Field label="Capital">
          <select
            value={filters.capitalId}
            onChange={(e) => set("capitalId", e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded-md px-2 py-2 text-sm"
          >
            <option value="">Todas as capitais</option>
            {visibleCapitals.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isSystem ? " (sistema)" : ""}
                {!c.active ? " (inativa)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Filme">
          <select
            value={filters.filmId}
            onChange={(e) => set("filmId", e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded-md px-2 py-2 text-sm"
          >
            <option value="">Todos os filmes</option>
            {(options?.films ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status da geração">
          <select
            value={filters.generationStatus}
            onChange={(e) => set("generationStatus", e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded-md px-2 py-2 text-sm"
          >
            <option value="">Todos</option>
            {(options?.generationStatuses ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Status da impressão">
          <select
            value={filters.printStatus}
            onChange={(e) => set("printStatus", e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded-md px-2 py-2 text-sm"
          >
            <option value="">Todos</option>
            {(options?.printStatuses ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Busca (nome ou WhatsApp)">
          <input
            type="search"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onApply();
            }}
            placeholder="Maria, 62..."
            className="w-full bg-black/40 border border-white/20 rounded-md px-2 py-2 text-sm"
          />
        </Field>
        <div className="flex items-end gap-2">
          <button
            onClick={onApply}
            disabled={loading}
            className="flex-1 bg-gold text-[#000C20] font-semibold uppercase tracking-wider rounded-md py-2 text-sm disabled:opacity-60"
          >
            Aplicar
          </button>
          <button
            onClick={onClear}
            disabled={loading}
            className="flex-1 border border-white/20 rounded-md py-2 text-sm hover:bg-white/10 disabled:opacity-60"
          >
            Limpar filtros
          </button>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-white/60">
      <span className="uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}

function DetailsSection({
  data,
  page,
  onPageChange,
  onReveal,
}: {
  data: DadosSummary;
  page: number;
  onPageChange: (n: number) => void;
  onReveal: (captureId: string) => Promise<string>;
}) {
  const d = data.details;
  const pages = getPageNumbers(d.page, d.totalPages);
  return (
    <section className="border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg">Capturas detalhadas</h2>
        <div className="text-xs text-white/50">
          {d.total > 0
            ? `Exibindo ${d.rangeStart}–${d.rangeEnd} de ${d.total.toLocaleString("pt-BR")} registros`
            : "Nenhum registro"}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-white/70">
            <tr>
              <th className="text-left px-3 py-2">Data/hora</th>
              <th className="text-left px-3 py-2">Capital</th>
              <th className="text-left px-3 py-2">Nome</th>
              <th className="text-left px-3 py-2">WhatsApp</th>
              <th className="text-left px-3 py-2">Filme</th>
              <th className="text-left px-3 py-2">Geração</th>
              <th className="text-left px-3 py-2">Impressão</th>
              <th className="text-left px-3 py-2">IDs</th>
              <th className="text-left px-3 py-2">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.length === 0 && (
              <tr><td colSpan={9} className="text-center text-white/50 py-8">Nada para exibir.</td></tr>
            )}
            {d.rows.map((r) => (
              <DetailRowView key={r.captureId} row={r} onReveal={onReveal} />
            ))}
          </tbody>
        </table>
      </div>
      {d.total > 0 && (
        <div className="px-4 py-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="text-white/60">
            Página {d.page} de {d.totalPages}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border border-white/20 rounded hover:bg-white/10 disabled:opacity-40"
            >
              Anterior
            </button>
            {pages.map((p, i) =>
              p === "…" ? (
                <span key={`e${i}`} className="px-2 text-white/40">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  className={`px-3 py-1 border rounded ${p === d.page ? "bg-gold text-[#000C20] border-gold font-semibold" : "border-white/20 hover:bg-white/10"}`}
                >
                  {p}
                </button>
              ),
            )}
            <button
              onClick={() => onPageChange(Math.min(d.totalPages, page + 1))}
              disabled={page >= d.totalPages}
              className="px-3 py-1 border border-white/20 rounded hover:bg-white/10 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function DetailRowView({
  row,
  onReveal,
}: {
  row: DetailRow;
  onReveal: (captureId: string) => Promise<string>;
}) {
  const [full, setFull] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  return (
    <tr className="border-t border-white/5 hover:bg-white/5 align-top">
      <td className="px-3 py-2 whitespace-nowrap">
        {new Date(row.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
      </td>
      <td className="px-3 py-2">{row.capitalName}</td>
      <td className="px-3 py-2">
        <div>{row.visitorFullName}</div>
        <div className="text-xs text-white/50">{row.visitorFirstName}</div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span>{full ?? row.whatsappMasked}</span>
          {!full && (
            <button
              onClick={async () => {
                setRevealing(true);
                try {
                  const v = await onReveal(row.captureId);
                  setFull(v);
                } catch {
                  /* noop */
                } finally {
                  setRevealing(false);
                }
              }}
              className="text-[10px] uppercase tracking-wider border border-white/20 rounded px-1.5 py-0.5 hover:bg-white/10"
            >
              {revealing ? "…" : "Revelar"}
            </button>
          )}
        </div>
      </td>
      <td className="px-3 py-2">{row.filmTitle}</td>
      <td className="px-3 py-2">
        <StatusBadge status={row.generationStatus} />
        {row.generationAttempts > 1 && (
          <div className="text-[10px] text-white/50 mt-0.5">{row.generationAttempts} tentativas</div>
        )}
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={row.printStatus} />
      </td>
      <td className="px-3 py-2 text-[10px] text-white/50 font-mono">
        <div title={row.captureId}>cap: {row.captureId.slice(0, 8)}</div>
        {row.generationId && <div title={row.generationId}>gen: {row.generationId.slice(0, 8)}</div>}
      </td>
      <td className="px-3 py-2">
        {row.publicToken ? (
          <a
            href={`/resultado/${row.publicToken}`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-gold underline text-xs"
          >
            abrir
          </a>
        ) : (
          <span className="text-white/40 text-xs">—</span>
        )}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-white/40 text-xs">—</span>;
  const tone = (() => {
    switch (status) {
      case "completed":
      case "printed":
        return "bg-emerald-500/20 text-emerald-200";
      case "failed":
        return "bg-red-500/20 text-red-200";
      case "processing":
      case "printing":
        return "bg-amber-500/20 text-amber-200";
      case "pending":
      case "queued":
        return "bg-sky-500/20 text-sky-200";
      case "cleared":
      case "cancelled":
        return "bg-white/10 text-white/60";
      default:
        return "bg-white/10 text-white/70";
    }
  })();
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${tone}`}>
      {status}
    </span>
  );
}

function getPageNumbers(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function Kpi({
  label,
  value,
  sub,
  tone,
  suffix,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "ok" | "warn";
  suffix?: string;
}) {
  const ring =
    tone === "warn"
      ? "border-red-400/40 bg-red-500/10"
      : tone === "ok"
        ? "border-emerald-400/30 bg-emerald-500/5"
        : "border-white/10 bg-white/5";
  return (
    <div className={`rounded-xl border px-4 py-3 ${ring}`}>
      <div className="text-xs uppercase tracking-wider text-white/60">{label}</div>
      <div className="font-display text-2xl mt-1">
        {value.toLocaleString("pt-BR")}
        {suffix ?? ""}
      </div>
      {sub && <div className="text-xs text-white/50 mt-0.5">{sub}</div>}
    </div>
  );
}
