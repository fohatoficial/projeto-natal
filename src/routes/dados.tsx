import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  checkPrintQueueSession,
  loginPrintQueue,
  logoutPrintQueue,
} from "@/lib/pipoca/print-queue.functions";
import { getDadosSummary, type DadosSummary } from "@/lib/pipoca/dados.functions";

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

function DadosView({ onSignOut }: { onSignOut: () => void }) {
  const [data, setData] = useState<DadosSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchSummary = useServerFn(getDadosSummary);
  const logout = useServerFn(logoutPrintQueue);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchSummary();
      setData(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, [fetchSummary]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-[100dvh] bg-[#000C20] text-white">
      <div className="max-w-6xl mx-auto px-5 py-6 flex flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl md:text-3xl">
              PAINEL DE <span className="text-gold">DADOS</span>
            </h1>
            <p className="text-xs text-white/60">
              Indicadores por capital · Pipoca & Cena
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
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

        {data && (
          <>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Capturas (total)" value={data.totals.captures} sub={`hoje: ${data.totals.capturesToday}`} />
              <Kpi label="Gerações (total)" value={data.totals.generations} sub={`hoje: ${data.totals.generationsToday}`} />
              <Kpi label="Fila pendente" value={data.totals.queuePending} sub={`imprimindo: ${data.totals.queuePrinting}`} />
              <Kpi label="Já impressos" value={data.totals.queuePrinted} />
            </section>

            <section className="border border-white/10 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <h2 className="font-display text-lg">Por capital</h2>
                <span className="text-xs text-white/50">
                  Atualizado em {new Date(data.generatedAt).toLocaleString("pt-BR")}
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
                    {data.perCapital.map((c) => (
                      <tr
                        key={c.capitalId ?? "none"}
                        className="border-t border-white/5 hover:bg-white/5"
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span>{c.capitalName}</span>
                            {c.isSystem && (
                              <span className="text-[10px] uppercase tracking-wider bg-white/10 px-1.5 py-0.5 rounded">
                                sistema
                              </span>
                            )}
                            {!c.active && (
                              <span className="text-[10px] uppercase tracking-wider bg-red-500/20 text-red-200 px-1.5 py-0.5 rounded">
                                inativa
                              </span>
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

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "ok" | "warn";
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
      <div className="font-display text-2xl mt-1">{value.toLocaleString("pt-BR")}</div>
      {sub && <div className="text-xs text-white/50 mt-0.5">{sub}</div>}
    </div>
  );
}
