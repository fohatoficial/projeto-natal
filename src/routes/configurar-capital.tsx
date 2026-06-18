import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  listActiveCapitals,
  type PipocaCapital,
} from "@/lib/pipoca/capitals.functions";
import {
  readValidStoredCapital,
  writeStoredCapital,
} from "@/lib/pipoca/capital-storage";

const LOG = "[PIPOCA_CAPITAL]";

export const Route = createFileRoute("/configurar-capital")({
  head: () => ({
    meta: [
      { title: "Configurar capital — Pipoca & Cena" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ConfigurarCapitalPage,
});

function ConfigurarCapitalPage() {
  const listFn = useServerFn(listActiveCapitals);
  const [capitals, setCapitals] = useState<PipocaCapital[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = readValidStoredCapital();
    if (stored) {
      setCurrentSlug(stored.capital_slug);
      setSelectedSlug(stored.capital_slug);
    }
    // Preserva ?display=totem e demais params.
    setForwardSearch(window.location.search ?? "");
    let alive = true;
    (async () => {
      try {
        const r = await listFn({});
        if (!alive) return;
        setCapitals(r.capitals);
      } catch (e) {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : "Falha ao carregar capitais");
      }
    })();
    return () => {
      alive = false;
    };
  }, [listFn]);

  async function handleConfirm() {
    if (!selectedSlug || !capitals) return;
    const chosen = capitals.find((c) => c.slug === selectedSlug);
    if (!chosen) return;
    setSubmitting(true);
    writeStoredCapital({
      capital_id: chosen.id,
      capital_name: chosen.name,
      capital_slug: chosen.slug,
    });
    console.log(LOG, "CAPITAL_SELECTED", {
      capital_id: chosen.id,
      capital_slug: chosen.slug,
      origin: "configurar-capital",
    });
    const search = forwardSearch && forwardSearch !== "?" ? forwardSearch : "";
    window.location.assign(`/experiencia/${chosen.slug}${search}`);
  }

  return (
    <div className="min-h-[100dvh] bg-[#000C20] text-white px-5 py-10 flex items-center justify-center">
      <div className="w-full max-w-2xl">
        <header className="text-center mb-8">
          <p className="text-xs uppercase tracking-[0.4em] text-gold/80">
            Tela técnica · Pipoca &amp; Cena
          </p>
          <h1 className="font-display text-3xl md:text-4xl mt-3">
            Configurar <span className="text-gold">capital</span>
          </h1>
          <p className="text-sm md:text-base text-white/70 mt-2">
            Trocar a capital deste equipamento. A escolha vale apenas para o dia de hoje.
          </p>
          {currentSlug && (
            <p className="text-xs text-white/50 mt-3">
              Atual: <span className="text-gold/90">{currentSlug}</span>
            </p>
          )}
        </header>

        {loadError && (
          <p className="text-red-300 text-center text-sm mb-6">{loadError}</p>
        )}

        {!capitals && !loadError && (
          <div className="grid place-items-center py-12">
            <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-gold animate-spin" />
          </div>
        )}

        {capitals && capitals.length === 0 && (
          <p className="text-center text-white/70">
            Nenhuma capital selecionável cadastrada.
          </p>
        )}

        {capitals && capitals.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {capitals.map((c) => {
                const active = selectedSlug === c.slug;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedSlug(c.slug)}
                    className={`text-left rounded-2xl border px-5 py-5 transition-all ${
                      active
                        ? "border-gold bg-gold/10 ring-2 ring-gold/40"
                        : "border-white/15 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">
                      {c.uf}
                    </p>
                    <p className="font-display text-xl mt-1">{c.name}</p>
                    {currentSlug === c.slug && (
                      <p className="text-[10px] mt-1 text-gold/80 uppercase tracking-widest">
                        Selecionada hoje
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex flex-col items-center gap-3">
              <button
                type="button"
                disabled={!selectedSlug || submitting}
                onClick={handleConfirm}
                className="w-full sm:w-auto bg-gold text-[#000C20] font-semibold uppercase tracking-wider rounded-md px-8 py-4 disabled:opacity-50"
              >
                {submitting ? "Abrindo experiência…" : "Salvar e abrir experiência"}
              </button>
              <a
                href="/?resetCapital=1"
                className="text-xs text-white/60 underline"
              >
                Limpar capital salva
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
