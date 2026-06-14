import { createFileRoute } from "@tanstack/react-router";
import { StageShell } from "@/components/pipoca/StageShell";
import { mapFilmRow } from "@/lib/pipoca/movies";

export const Route = createFileRoute("/resultado")({
  head: () => ({
    meta: [
      { title: "Sua cena Pipoca & Cena — Tela Brasil" },
      {
        name: "description",
        content:
          "Baixe e compartilhe a sua imagem personalizada criada na experiência Pipoca & Cena do Tela Brasil.",
      },
      { property: "og:title", content: "Sua cena — Pipoca & Cena" },
      {
        property: "og:description",
        content:
          "Sua imagem personalizada criada na experiência Pipoca & Cena do Tela Brasil.",
      },
    ],
  }),
  component: ResultadoPage,
});

function ResultadoPage() {
  // Página de resultado standalone: usa placeholder até receber dados do fluxo.
  const movie = mapFilmRow({
    id: "",
    title: "Tela Brasil",
    slug: "",
    synopsis_short: null,
    cover_url: null,
    catalog_url: null,
    active: true,
    display_order: 0,
  });

  return (
    <StageShell subtitle="Pipoca & Cena · Sua cena">
      <div className="flex-1 flex flex-col gap-6 max-w-md mx-auto w-full pt-2 pb-4">
        <div className="text-center">
          <span className="text-[11px] uppercase tracking-[0.3em] text-gold">
            Resultado
          </span>
          <h1 className="font-display text-5xl text-white mt-2 leading-[0.95]">
            Sua cena está pronta
          </h1>
        </div>

        <p className="text-center text-white/70">
          Baixe sua imagem personalizada criada na experiência Pipoca &amp;
          Cena.
        </p>

        <div className="tb-card bg-card overflow-hidden">
          <div className="relative aspect-[3/4] film-grain vignette">
            <img
              src={movie.posterUrl}
              alt={`Cena inspirada em ${movie.title}`}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-5">
              <span className="text-[10px] uppercase tracking-[0.3em] text-gold">
                Inspirado em
              </span>
              <h3 className="font-display text-2xl text-white mt-1 leading-tight">
                {movie.title}
              </h3>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <button
            type="button"
            className="w-full bg-gold text-cinema font-semibold tracking-wider uppercase rounded-md py-4 text-sm hover:brightness-110 active:scale-[0.99] transition"
          >
            Baixar imagem
          </button>
          <button
            type="button"
            className="w-full border border-white/25 text-white font-medium tracking-wider uppercase rounded-md py-4 text-sm hover:bg-white/5 active:scale-[0.99] transition"
          >
            Compartilhar
          </button>
          <button
            type="button"
            className="w-full border border-gold/40 text-gold font-medium tracking-wider uppercase rounded-md py-4 text-sm hover:bg-gold/10 active:scale-[0.99] transition"
          >
            Conhecer o filme
          </button>
        </div>
      </div>
    </StageShell>
  );
}
