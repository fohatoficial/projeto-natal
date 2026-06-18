// /dados — Painel executivo visual (modo apresentação) para o cliente.
// Sem filtros, sem dados pessoais. Dashboard vertical contínuo.
// Reutiliza a server function getDadosSummary (RPC pipoca_dados_summary),
// usando apenas os agregados (totals + perCapital). Detalhes/PII são
// ignorados no frontend.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  checkPrintQueueSession,
  loginPrintQueue,
  logoutPrintQueue,
} from "@/lib/pipoca/print-queue.functions";
import {
  getDadosSummary,
  type CapitalIndicators,
  type DadosSummary,
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

// ───────────────────────────── tokens visuais ─────────────────────────────
const COLOR_BG = "#000C20";
const COLOR_GOLD = "#F8BA32";
const COLOR_GOLD_SOFT = "#F8BA32CC";
const COLOR_BLUE = "#5BA3D0";
const COLOR_GREEN = "#7BD389";
const COLOR_AMBER = "#F2B544";
const COLOR_MUTED = "#94A3B8";

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
      <div className="h-[100dvh] w-full grid place-items-center bg-[#000C20] text-white">
        <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-[color:var(--gold)] animate-spin" style={{ ["--gold" as any]: COLOR_GOLD }} />
      </div>
    );
  }
  if (!authed) return <PinForm onAuthed={() => setAuthed(true)} />;
  return <DashboardPresentation onSignOut={() => setAuthed(false)} />;
}

// ───────────────────────────── PIN ─────────────────────────────
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
    <div className="h-[100dvh] w-full grid place-items-center bg-[#000C20] text-white px-5">
      <form
        onSubmit={submit}
        className="w-full max-w-sm border border-white/15 rounded-2xl p-6 flex flex-col gap-4"
      >
        <h1 className="font-display text-2xl text-center">
          PAINEL DE <span style={{ color: COLOR_GOLD }}>RESULTADOS</span>
        </h1>
        <p className="text-sm text-white/70 text-center">
          Informe o PIN para acessar o painel.
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
          className="w-full font-semibold uppercase tracking-wider rounded-md py-3 disabled:opacity-60"
          style={{ background: COLOR_GOLD, color: COLOR_BG }}
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

// ───────────────────────────── Helpers ─────────────────────────────
function spTimeLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

const SYSTEM_LABEL = "Dados anteriores";

function splitCapitals(perCapital: CapitalIndicators[]): {
  real: CapitalIndicators[];
  unknown: CapitalIndicators | null;
} {
  const unknown =
    perCapital.find((c) => c.isSystem) ??
    perCapital.find((c) => /desconhecid/i.test(c.capitalName)) ??
    null;
  const real = perCapital.filter((c) => c !== unknown);
  return { real, unknown };
}

// ───────────────────────────── Dashboard (vertical scroll) ─────────────────────────────
function DashboardPresentation({ onSignOut }: { onSignOut: () => void }) {
  const [data, setData] = useState<DadosSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTop, setShowTop] = useState(false);

  const fetchSummary = useServerFn(getDadosSummary);
  const logout = useServerFn(logoutPrintQueue);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchSummary({ data: { page: 1 } });
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

  // Liberar scroll natural somente enquanto /dados está montada.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add("pipoca-dados-page");
    body.classList.add("pipoca-dados-page");
    return () => {
      html.classList.remove("pipoca-dados-page");
      body.classList.remove("pipoca-dados-page");
    };
  }, []);

  // Botão "voltar ao topo" após rolar uma distância razoável.
  useEffect(() => {
    function onScroll() {
      setShowTop(window.scrollY > 500);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const split = useMemo(
    () => (data ? splitCapitals(data.perCapital) : { real: [], unknown: null }),
    [data],
  );

  function scrollToId(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const anchors: Array<{ id: string; label: string }> = [
    { id: "sec-overview", label: "Visão geral" },
    { id: "sec-captures", label: "Capitais" },
    { id: "sec-generations", label: "Gerações" },
    { id: "sec-prints", label: "Impressões" },
  ];

  const ordered = data
    ? [
        ...split.real.slice().sort((a, b) => b.captures - a.captures),
        ...(split.unknown ? [split.unknown] : []),
      ]
    : [];

  return (
    <div className="min-h-screen w-full text-white relative" style={{ background: COLOR_BG }}>
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at top, rgba(248,186,50,0.18), transparent 60%)",
        }}
      />

      {/* Cabeçalho sticky */}
      <header
        className="sticky top-0 z-30 backdrop-blur-md border-b border-white/10"
        style={{ background: "rgba(0,12,32,0.85)" }}
      >
        <div className="px-4 sm:px-8 pt-3 pb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-white/50">
              Pipoca &amp; Cena · Tela Brasil
            </div>
            <h1 className="font-display text-lg sm:text-2xl truncate">
              Painel de resultados
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {data && (
              <span className="hidden sm:inline text-[11px] text-white/50">
                Atualizado em {spTimeLabel(data.generatedAt)}
              </span>
            )}
            <button
              onClick={() => load()}
              disabled={loading}
              className="text-xs border border-white/15 rounded-md px-2.5 py-1.5 hover:bg-white/5 disabled:opacity-60"
              aria-label="Atualizar"
              title="Atualizar"
            >
              ↻
            </button>
            <button
              onClick={async () => {
                await logout();
                onSignOut();
              }}
              className="text-xs border border-white/15 rounded-md px-2.5 py-1.5 hover:bg-white/5"
            >
              Sair
            </button>
          </div>
        </div>
        <nav className="px-4 sm:px-8 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {anchors.map((a) => (
            <button
              key={a.id}
              onClick={() => scrollToId(a.id)}
              className="text-[11px] sm:text-xs uppercase tracking-wider whitespace-nowrap border border-white/15 rounded-full px-3 py-1.5 hover:bg-white/5 hover:border-white/30"
            >
              {a.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Conteúdo */}
      <main className="relative z-10 px-4 sm:px-8 py-6 sm:py-10 max-w-7xl mx-auto flex flex-col gap-10">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !data && loading ? (
          <LoadingState />
        ) : !data ? (
          <EmptyState />
        ) : (
          <>
            <Section id="sec-overview" title="Visão geral">
              <SectionOverview data={data} />
            </Section>

            <Section id="sec-captures" title="Experiências por capital">
              <ChartFrame>
                <SectionCaptures real={split.real} unknown={split.unknown} />
              </ChartFrame>
            </Section>

            <Section id="sec-generations" title="Fotos geradas por capital">
              <ChartFrame>
                <SectionGenerations real={split.real} unknown={split.unknown} />
              </ChartFrame>
            </Section>

            <Section id="sec-prints" title="Impressões por capital">
              <ChartFrame>
                <SectionPrints real={split.real} unknown={split.unknown} data={data} />
              </ChartFrame>
            </Section>

            <Section id="sec-cards" title="Resumo por capital">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {ordered.map((c) => (
                  <CapitalCard key={c.capitalId} c={c} />
                ))}
              </div>
            </Section>
          </>
        )}

        <footer className="pt-6 pb-10 text-center text-[11px] text-white/40">
          Pipoca &amp; Cena · Tela Brasil
        </footer>
      </main>

      {/* Botão voltar ao topo */}
      {showTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-5 right-5 z-40 rounded-full shadow-lg px-4 py-3 text-xs font-semibold uppercase tracking-wider"
          style={{ background: COLOR_GOLD, color: COLOR_BG }}
          aria-label="Voltar ao topo"
        >
          ↑ Topo
        </button>
      )}

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32 flex flex-col gap-3">
      <h2 className="font-display text-xl sm:text-2xl text-white/90">{title}</h2>
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-5">
        {children}
      </div>
    </section>
  );
}

function ChartFrame({ children }: { children: React.ReactNode }) {
  // Altura fixa por breakpoint para gráficos Recharts responsivos.
  return <div className="h-[300px] md:h-[340px] lg:h-[400px] w-full">{children}</div>;
}


// ───────────────────────────── Estados ─────────────────────────────
function LoadingState() {
  return (
    <div className="h-full w-full grid grid-rows-[auto_1fr] gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-white/[0.04] border border-white/10 animate-pulse" />
        ))}
      </div>
      <div className="rounded-xl bg-white/[0.04] border border-white/10 animate-pulse" />
    </div>
  );
}
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="h-full w-full grid place-items-center">
      <div className="max-w-sm text-center flex flex-col items-center gap-4">
        <p className="text-red-200">{message}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-md font-semibold"
          style={{ background: COLOR_GOLD, color: COLOR_BG }}
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
function EmptyState() {
  return (
    <div className="h-full w-full grid place-items-center">
      <p className="text-white/60 text-center max-w-md">
        Ainda não há dados suficientes para este painel.
      </p>
    </div>
  );
}

// ───────────────────────────── KPI card ─────────────────────────────
function Kpi({
  label,
  value,
  suffix,
  size = "lg",
  accent = false,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  size?: "lg" | "sm";
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-xl border h-full flex flex-col justify-center px-3 sm:px-4 py-2 sm:py-3 min-w-0"
      style={{
        background: accent ? "rgba(248,186,50,0.08)" : "rgba(255,255,255,0.03)",
        borderColor: accent ? "rgba(248,186,50,0.35)" : "rgba(255,255,255,0.1)",
      }}
    >
      <div className={`uppercase tracking-wider text-white/55 ${size === "lg" ? "text-[10px] sm:text-xs" : "text-[10px]"}`}>
        {label}
      </div>
      <div
        className={`font-display leading-none mt-1 ${
          size === "lg" ? "text-2xl sm:text-4xl lg:text-5xl" : "text-lg sm:text-2xl"
        }`}
        style={{ color: accent ? COLOR_GOLD : "white" }}
      >
        {value}
        {suffix && <span className="text-white/60 text-base ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

// ───────────────────────────── Section: Visão geral ─────────────────────────────
function SectionOverview({ data }: { data: DadosSummary }) {
  const t = data.totals;
  const pct = Math.round(t.successRate * 1000) / 10;
  return (
    <div className="h-full w-full grid grid-rows-[auto_auto_1fr] gap-3 sm:gap-4">
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 min-h-0">
        <Kpi label="Capturas" value={t.captures} accent />
        <Kpi label="Visitantes únicos" value={t.uniqueVisitors} />
        <Kpi label="Gerações" value={t.generations} />
        <Kpi label="Concluídas" value={t.generationsCompleted} />
        <Kpi label="Taxa de sucesso" value={pct} suffix="%" accent />
        <Kpi label="Fotos impressas" value={t.queuePrinted} />
      </section>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3 min-h-0">
        <Kpi label="Capturas hoje" value={t.capturesToday} size="sm" />
        <Kpi label="Gerações hoje" value={t.generationsToday} size="sm" />
        <Kpi label="Pendentes" value={t.queuePending} size="sm" />
        <Kpi label="Em impressão" value={t.queuePrinting} size="sm" />
        <Kpi label="Impressas" value={t.queuePrinted} size="sm" />
      </section>

      <section
        className="rounded-2xl border border-white/10 p-4 sm:p-6 min-h-0 flex flex-col justify-center"
        style={{
          background:
            "linear-gradient(135deg, rgba(248,186,50,0.08), rgba(255,255,255,0.02))",
        }}
      >
        <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">
          Tela Brasil · Pipoca &amp; Cena
        </div>
        <div className="mt-2 text-base sm:text-xl text-white/85 leading-relaxed max-w-3xl">
          Um panorama em tempo real da experiência itinerante por todo o país.
          Cada captura representa uma pessoa que viveu o cinema brasileiro
          através da Pipoca &amp; Cena.
        </div>
        <div className="mt-3 text-xs text-white/45">
          Atualizado em {spTimeLabel(data.generatedAt)} (horário de Brasília)
        </div>
      </section>
    </div>
  );
}

// ───────────────────────────── Section: Capturas por capital ─────────────────────────────
function SectionCaptures({
  real,
  unknown,
}: {
  real: CapitalIndicators[];
  unknown: CapitalIndicators | null;
}) {
  const sorted = [...real].sort((a, b) => b.captures - a.captures);
  const chartData = sorted.map((c) => ({
    name: c.capitalName,
    capturas: c.captures,
    hoje: c.capturesToday,
  }));

  return (
    <div className="h-full w-full grid grid-rows-[1fr_auto] gap-3">
      <div className="rounded-2xl border border-white/10 p-3 sm:p-5 min-h-0 flex flex-col">
        {chartData.length === 0 ? (
          <div className="flex-1 grid place-items-center text-white/50">
            Ainda não há capturas registradas.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 8, right: 60, left: 8, bottom: 8 }}
              barCategoryGap={"22%"}
            >
              <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
              <XAxis type="number" stroke={COLOR_MUTED} fontSize={11} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                stroke={COLOR_MUTED}
                fontSize={12}
                width={140}
                tick={{ fill: "#E5E7EB" }}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                contentStyle={tooltipStyle}
                labelStyle={{ color: COLOR_GOLD }}
                formatter={(v: number, name: string) => [v, name === "capturas" ? "Capturas" : "Hoje"]}
              />
              <Bar dataKey="capturas" fill={COLOR_GOLD} radius={[0, 6, 6, 0]} isAnimationActive={false}>
                <LabelInsideBar />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {unknown && unknown.captures > 0 && (
        <UnknownStrip
          label="Dados anteriores sem identificação de capital"
          value={unknown.captures}
          hint={`hoje: ${unknown.capturesToday}`}
        />
      )}
    </div>
  );
}

function LabelInsideBar() {
  // Recharts label content rendered via formatter — left as placeholder.
  return null;
}

const tooltipStyle: React.CSSProperties = {
  background: "#0a1830",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  color: "white",
  fontSize: 12,
};

// ───────────────────────────── Section: Gerações por capital ─────────────────────────────
function SectionGenerations({
  real,
  unknown,
}: {
  real: CapitalIndicators[];
  unknown: CapitalIndicators | null;
}) {
  const sorted = [...real].sort((a, b) => b.captures - a.captures);
  const chartData = sorted.map((c) => ({
    name: c.capitalName,
    Capturas: c.captures,
    Gerações: c.generations,
    hoje: c.generationsToday,
  }));

  return (
    <div className="h-full w-full grid grid-rows-[1fr_auto] gap-3">
      <div className="rounded-2xl border border-white/10 p-3 sm:p-5 min-h-0 flex flex-col">
        {chartData.length === 0 ? (
          <div className="flex-1 grid place-items-center text-white/50">
            Ainda não há gerações registradas.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 28 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="name"
                stroke={COLOR_MUTED}
                fontSize={11}
                interval={0}
                angle={chartData.length > 4 ? -15 : 0}
                textAnchor={chartData.length > 4 ? "end" : "middle"}
                height={50}
              />
              <YAxis stroke={COLOR_MUTED} fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: COLOR_GOLD }} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: "white" }} />
              <Bar dataKey="Capturas" fill={COLOR_BLUE} radius={[6, 6, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="Gerações" fill={COLOR_GOLD} radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {unknown && (unknown.captures > 0 || unknown.generations > 0) && (
        <UnknownStrip
          label="Dados anteriores · capturas / gerações"
          value={`${unknown.captures} / ${unknown.generations}`}
          hint={`hoje: ${unknown.generationsToday}`}
        />
      )}
    </div>
  );
}

// ───────────────────────────── Section: Impressões ─────────────────────────────
function SectionPrints({
  real,
  unknown,
  data,
}: {
  real: CapitalIndicators[];
  unknown: CapitalIndicators | null;
  data: DadosSummary;
}) {
  const sorted = [...real].sort(
    (a, b) =>
      b.queuePending + b.queuePrinting + b.queuePrinted -
      (a.queuePending + a.queuePrinting + a.queuePrinted),
  );
  const chartData = sorted.map((c) => ({
    name: c.capitalName,
    Pendentes: c.queuePending,
    "Em impressão": c.queuePrinting,
    Impressas: c.queuePrinted,
  }));
  const t = data.totals;

  return (
    <div className="h-full w-full grid grid-rows-[auto_1fr_auto] gap-3">
      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        <Kpi label="Pendentes" value={t.queuePending} size="sm" />
        <Kpi label="Em impressão" value={t.queuePrinting} size="sm" />
        <Kpi label="Impressas" value={t.queuePrinted} size="sm" accent />
      </section>

      <div className="rounded-2xl border border-white/10 p-3 sm:p-5 min-h-0 flex flex-col">
        {chartData.length === 0 ? (
          <div className="flex-1 grid place-items-center text-white/50">
            Ainda não há impressões registradas.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 28 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="name"
                stroke={COLOR_MUTED}
                fontSize={11}
                interval={0}
                angle={chartData.length > 4 ? -15 : 0}
                textAnchor={chartData.length > 4 ? "end" : "middle"}
                height={50}
              />
              <YAxis stroke={COLOR_MUTED} fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: COLOR_GOLD }} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: "white" }} />
              <Bar dataKey="Pendentes" stackId="q" fill={COLOR_AMBER} isAnimationActive={false} />
              <Bar dataKey="Em impressão" stackId="q" fill={COLOR_BLUE} isAnimationActive={false} />
              <Bar dataKey="Impressas" stackId="q" fill={COLOR_GREEN} radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {unknown &&
        (unknown.queuePending + unknown.queuePrinting + unknown.queuePrinted > 0) && (
          <UnknownStrip
            label="Dados anteriores · pendentes / impressão / impressas"
            value={`${unknown.queuePending} / ${unknown.queuePrinting} / ${unknown.queuePrinted}`}
          />
        )}
    </div>
  );
}


function CapitalCard({ c }: { c: CapitalIndicators }) {
  const isUnknown = c.isSystem;
  return (
    <div
      className="rounded-2xl border h-full min-h-0 p-3 sm:p-5 flex flex-col gap-3"
      style={{
        background: isUnknown ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.04)",
        borderColor: isUnknown ? "rgba(255,255,255,0.08)" : "rgba(248,186,50,0.25)",
      }}
    >
      <header className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/45 truncate">
          {isUnknown ? SYSTEM_LABEL : "Capital"}
        </div>
        <h3
          className="font-display text-lg sm:text-xl truncate"
          style={{ color: isUnknown ? "rgba(255,255,255,0.75)" : COLOR_GOLD }}
        >
          {c.capitalName}
        </h3>
      </header>
      <div className="grid grid-cols-3 gap-2 flex-1 min-h-0">
        <Stat label="Capturas" value={c.captures} highlight />
        <Stat label="Gerações" value={c.generations} />
        <Stat label="Impressas" value={c.queuePrinted} />
      </div>
      <footer className="grid grid-cols-2 gap-2 text-[11px] text-white/55">
        <div className="flex items-center justify-between rounded-md bg-white/[0.04] px-2 py-1.5">
          <span>Capturas hoje</span>
          <span className="text-white font-semibold">{c.capturesToday}</span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-white/[0.04] px-2 py-1.5">
          <span>Gerações hoje</span>
          <span className="text-white font-semibold">{c.generationsToday}</span>
        </div>
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg bg-black/30 border border-white/10 p-2 flex flex-col items-center justify-center min-h-0">
      <div className="text-[9px] uppercase tracking-wider text-white/50">{label}</div>
      <div
        className="font-display text-xl sm:text-2xl leading-none mt-1"
        style={{ color: highlight ? COLOR_GOLD : "white" }}
      >
        {value}
      </div>
    </div>
  );
}

// ───────────────────────────── Unknown strip ─────────────────────────────
function UnknownStrip({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 sm:px-4 py-2 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-white/45">
          {SYSTEM_LABEL}
        </div>
        <div className="text-xs sm:text-sm text-white/75 truncate">{label}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-display text-lg sm:text-2xl text-white">{value}</div>
        {hint && <div className="text-[10px] text-white/45">{hint}</div>}
      </div>
    </div>
  );
}
