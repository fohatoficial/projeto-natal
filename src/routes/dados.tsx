// /dados — Painel executivo visual (modo apresentação) para o cliente.
// Sem filtros, sem dados pessoais. Dashboard vertical contínuo.
// Reutiliza a server function getDadosSummary (RPC pipoca_dados_summary),
// usando apenas os agregados (totals + perCapital). Detalhes/PII são
// ignorados no frontend.

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type * as React from "react";
import { useCallback, useEffect, useState } from "react";
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
import { logoutPrintQueue } from "@/lib/pipoca/print-queue.functions";
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

// ───────────────────────────── tokens visuais ─────────────────────────────
const COLOR_BG = "#000C20";
const COLOR_GOLD = "#F8BA32";
const COLOR_GOLD_SOFT = "#F8BA32CC";
const COLOR_BLUE = "#5BA3D0";
const COLOR_GREEN = "#7BD389";
const COLOR_AMBER = "#F2B544";
const COLOR_MUTED = "#94A3B8";

function DadosPage() {
  // PIN removido: acesso liberado.
  return <DashboardPresentation onSignOut={() => { /* noop */ }} />;
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

  function scrollToId(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const anchors: Array<{ id: string; label: string }> = [
    { id: "sec-overview", label: "Visão geral" },
  ];

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
    <div className="w-full min-h-[240px] grid grid-rows-[auto_1fr] gap-4">
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
    <div className="w-full min-h-[240px] grid place-items-center">
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
    <div className="w-full min-h-[240px] grid place-items-center">
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
  value: number | string | null;
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
        {value == null ? "—" : value}
        {suffix && <span className="text-white/60 text-base ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

// ───────────────────────────── Section: Visão geral ─────────────────────────────
function SectionOverview({ data }: { data: DadosSummary }) {
  const t = data.totals;
  const impressPct =
    t.generations > 0 ? Math.round((t.queuePrinted / t.generations) * 1000) / 10 : 0;
  return (
    <div className="w-full flex flex-col gap-3 sm:gap-4">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 min-h-0">
        <Kpi label="Visitantes únicos" value={t.uniqueVisitors} accent />
        <Kpi label="Gerações" value={t.generations} />
        <Kpi label="Concluídas" value={t.generationsCompleted} />
        <Kpi label="Impressões" value={t.queuePrinted} accent />
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 min-h-0">
        <Kpi label="Gerações hoje" value={t.generationsToday} size="sm" />
        <Kpi label="Pendentes" value={t.queuePending} size="sm" />
        <Kpi label="Em impressão" value={t.queuePrinting} size="sm" />
        <Kpi label="Impressão / geração" value={impressPct} suffix="%" size="sm" />
      </section>

      <section
        className="rounded-2xl border border-white/10 p-4 sm:p-6 min-h-0 flex flex-col justify-center gap-3"
        style={{
          background:
            "linear-gradient(135deg, rgba(248,186,50,0.08), rgba(255,255,255,0.02))",
        }}
      >
        <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">
          Tela Brasil · Pipoca &amp; Cena
        </div>
        <div className="text-base sm:text-xl text-white/85 leading-relaxed max-w-3xl">
          Um panorama em tempo real da experiência itinerante por todo o país.
          Cada captura representa uma pessoa que viveu o cinema brasileiro
          através da Pipoca &amp; Cena.
        </div>
        {data.topFilms.length > 0 && (
          <div className="mt-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[10px] uppercase tracking-[0.3em] text-white/50">
              Filme mais escolhido
            </span>
            <span
              className="text-base sm:text-lg font-semibold"
              style={{ color: COLOR_GOLD }}
            >
              {data.topFilms[0].title}
            </span>
            <span className="text-xs text-white/60">
              {data.topFilms[0].captures}{" "}
              {data.topFilms[0].captures === 1 ? "captura" : "capturas"}
            </span>
          </div>
        )}
        <div className="text-xs text-white/45">
          Atualizado em {spTimeLabel(data.generatedAt)} (horário de Brasília)
        </div>
      </section>

    </div>
  );
}

const tooltipStyle: React.CSSProperties = {
  background: "#0a1830",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  color: "white",
  fontSize: 12,
};

