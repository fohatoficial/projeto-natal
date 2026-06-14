import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-router";
import type { Movie } from "@/lib/pipoca/movies";
import { usePipocaFilms } from "@/lib/pipoca/usePipocaFilms";
import { useCamera, type CameraErrorKind } from "@/lib/pipoca/useCamera";
import { supabase } from "@/integrations/supabase/client";
import {
  createPipocaCaptureUpload,
  confirmPipocaCaptureUpload,
} from "@/lib/pipoca/upload.functions";


type Step =
  | "choose"
  | "orient"
  | "camera"
  | "confirm"
  | "processing"
  | "result";

const LOGO_URL =
  "/__l5e/assets-v1/ebc60a74-6a98-4a67-97b1-950064f94104/logo_tela_brasil_light.svg";
const QR_URL =
  "/__l5e/assets-v1/c736c04b-4813-43bc-80b0-1d6742d491a3/qr-code.png";

const LOADING_PHRASES = [
  "Preparando o cenário...",
  "Ajustando luz e atmosfera...",
  "Colocando você no centro da cena...",
  "Finalizando sua imagem cinematográfica...",
];

const PAGE_SIZE = 4;
const COUNTDOWN_SECONDS = 10;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PIPOCA_INACTIVITY_TIMEOUT_MS = 90_000;

const UX = "[PIPOCA_UX]";

/* ---------- Root ---------- */

export function PipocaFlow() {
  const [step, setStep] = useState<Step>("choose");
  const [selected, setSelected] = useState<Movie | null>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const { films, loading, error } = usePipocaFilms();

  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.url);
    };
  }, [photo]);

  function transitionTo(swap: () => void) {
    setTransitioning(true);
    window.setTimeout(swap, 450);
    window.setTimeout(() => setTransitioning(false), 950);
  }

  const reset = () =>
    transitionTo(() => {
      console.log(`${UX} fluxo reiniciado`);
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto(null);
      setSelected(null);
      setStep("choose");
    });

  return (
    <div className="bg-cinema text-white relative">
      {step === "choose" && (
        <Choose
          movies={films}
          loading={loading}
          error={error}
          onPick={(m) => {
            console.log(`${UX} filme selecionado`, { id: m.id, title: m.title });
            transitionTo(() => {
              setSelected(m);
              setStep("orient");
            });
          }}
        />
      )}
      {step === "orient" && selected && (
        <Orient
          movie={selected}
          onNext={() => {
            console.log(`${UX} pronto para câmera`);
            transitionTo(() => setStep("camera"));
          }}
          onBack={() => {
            console.log(`${UX} voltar para escolha`);
            transitionTo(() => {
              setSelected(null);
              setStep("choose");
            });
          }}
        />
      )}
      {step === "camera" && (
        <Camera
          onCaptured={(p) => {
            console.log(`${UX} foto capturada`);
            setPhoto(p);
            transitionTo(() => setStep("confirm"));
          }}
          onBack={() =>
            transitionTo(() => {
              console.log(`${UX} câmera cancelada`);
              setStep("orient");
            })
          }
        />
      )}
      {step === "confirm" && photo && (
        <Confirm
          photoUrl={photo.url}
          onRetake={() =>
            transitionTo(() => {
              console.log(`${UX} foto descartada`);
              URL.revokeObjectURL(photo.url);
              setPhoto(null);
              setStep("camera");
            })
          }
          onUse={() =>
            transitionTo(() => {
              console.log(`${UX} foto confirmada`);
              setStep("processing");
            })
          }
        />
      )}
      {step === "processing" && selected && (
        <Processing
          movie={selected}
          onDone={() => transitionTo(() => setStep("result"))}
        />
      )}
      {step === "result" && selected && (
        <Result
          movie={selected}
          photoUrl={photo?.url ?? null}
          onRestart={reset}
        />
      )}

      {/* Wedge transition overlay */}
      {transitioning && (
        <div className="fixed inset-0 z-[60] pointer-events-none overflow-hidden" aria-hidden>
          <div
            className="wedge-tl absolute inset-0"
            style={{ background: "#F8BA32", clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
          />
          <div
            className="wedge-br absolute inset-0"
            style={{ background: "#2E5BE5", clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
          />
        </div>
      )}
    </div>
  );
}

/* ---------- Shared layout pieces ---------- */

function Screen({
  children,
  aurora = false,
  wedgeColor = "#2E5BE5",
  className = "",
}: {
  children: React.ReactNode;
  aurora?: boolean;
  wedgeColor?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative h-[100svh] w-full overflow-hidden film-grain vignette flex flex-col items-center px-4 sm:px-6 lg:px-10 pt-5 pb-4 sm:pt-7 sm:pb-5 lg:pt-8 lg:pb-6 text-center ${
        aurora ? "bg-aurora" : "bg-cinema"
      } ${className}`}
    >
      <div className="absolute inset-0 brand-pattern opacity-[0.05] pointer-events-none" aria-hidden />
      {/* Decorative corner wedges */}
      <div
        className="absolute top-0 left-0 w-10 h-10 sm:w-14 sm:h-14 lg:w-20 lg:h-20 pointer-events-none z-20"
        style={{ background: "#F8BA32", clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
        aria-hidden
      />
      <div
        className="absolute bottom-0 right-0 w-10 h-10 sm:w-14 sm:h-14 lg:w-20 lg:h-20 pointer-events-none z-20"
        style={{ background: wedgeColor, clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
        aria-hidden
      />
      {children}
    </div>
  );
}

function Logo({ className = "h-8 sm:h-10 lg:h-14 w-auto" }: { className?: string }) {
  return <img src={LOGO_URL} alt="Tela Brasil" className={className} />;
}

function Header({ subtitle }: { subtitle?: string }) {
  return (
    <div className="relative z-10 flex flex-col items-center gap-1.5 shrink-0">
      <Logo />
      <div className="brand-stripe w-20 sm:w-28 lg:w-40 rounded-full opacity-90" />
      {subtitle ? (
        <span className="mt-1 text-[10px] sm:text-xs lg:text-sm uppercase tracking-[0.3em] text-gold/85">
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}

function PrimaryCta({
  children,
  onClick,
  disabled,
  glow = true,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  glow?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`bg-gold text-[#000C20] font-display text-xl sm:text-2xl lg:text-3xl px-8 sm:px-10 lg:px-14 py-3.5 sm:py-4 lg:py-5 rounded-md hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 disabled:hover:scale-100 ${
        glow && !disabled ? "glow-pulse" : ""
      }`}
    >
      {children}
    </button>
  );
}

function GhostBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-white/70 hover:text-white text-xs sm:text-sm uppercase tracking-[0.3em] py-2 px-3 transition-colors"
    >
      {children}
    </button>
  );
}

/* ---------- Step 1: Choose film ---------- */

function Choose({
  movies,
  loading,
  error,
  onPick,
}: {
  movies: Movie[];
  loading: boolean;
  error: string | null;
  onPick: (m: Movie) => void;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(movies.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const slice = movies.slice(start, start + PAGE_SIZE);
  const onlyOne = movies.length === 1;

  return (
    <Screen aurora>
      <Header subtitle="Pipoca & Cena" />

      {/* CENTER */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-5xl py-3">
        <h1 className="font-display text-[2.4rem] leading-[1.02] sm:text-5xl md:text-6xl lg:text-7xl text-white animate-fade-up">
          Escolha seu{" "}
          <span className="text-gold">filme</span>
        </h1>
        <p className="mt-2 sm:mt-3 text-sm sm:text-base lg:text-lg text-white/75 max-w-xl animate-fade-up">
          Toque em uma obra do catálogo Tela Brasil para entrar em cena.
        </p>

        {/* Marquee badges */}
        <div className="mt-4 sm:mt-5 w-full max-w-full overflow-hidden">
          <div className="flex gap-3 animate-marquee whitespace-nowrap">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex gap-3 shrink-0">
                <MarqueeBadge color="#F8BA32" text="Cinema brasileiro" />
                <MarqueeBadge color="#2E5BE5" text="Sua foto vira cena" />
                <MarqueeBadge color="#92C37A" text="100% gratuito" />
                <MarqueeBadge color="#F8BA32" text="Pronta em segundos" />
                <MarqueeBadge color="#E0463A" text="Catálogo Tela Brasil" />
              </div>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="mt-4 sm:mt-5 lg:mt-6 w-full flex-1 min-h-0 flex items-center justify-center">
          {loading ? (
            <p className="text-base text-white/70 tracking-wide animate-pulse-soft">
              Carregando filmes…
            </p>
          ) : error ? (
            <p className="text-base text-white/85 max-w-md">{error}</p>
          ) : movies.length === 0 ? (
            <p className="text-base text-white/70">Nenhum filme disponível.</p>
          ) : onlyOne ? (
            <div className="h-full max-h-full aspect-[3/4] mx-auto">
              <PosterCard movie={slice[0]} onPick={onPick} />
            </div>
          ) : (
            <div className="h-full w-full max-w-3xl grid grid-cols-2 grid-rows-2 gap-3 sm:gap-4 lg:gap-5">
              {slice.map((m, i) => (
                <div
                  key={m.id}
                  className="min-h-0 animate-slide-in"
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <PosterCard movie={m} onPick={onPick} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FOOTER pagination */}
      <div className="relative z-10 shrink-0 h-12 flex items-center justify-center gap-4">
        {totalPages > 1 ? (
          <>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border border-white/25 grid place-items-center text-white text-2xl disabled:opacity-30 active:scale-95"
              aria-label="Anterior"
            >
              ‹
            </button>
            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2 rounded-full transition-all ${
                    i === page ? "w-8 bg-gold" : "w-2 bg-white/25"
                  }`}
                />
              ))}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border border-white/25 grid place-items-center text-white text-2xl disabled:opacity-30 active:scale-95"
              aria-label="Próxima"
            >
              ›
            </button>
          </>
        ) : null}
      </div>
    </Screen>
  );
}

function MarqueeBadge({ color, text }: { color: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-2 bg-white/5 border border-white/15 text-white/90 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm shrink-0">
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: color }}
      />
      {text}
    </span>
  );
}

function PosterCard({
  movie,
  onPick,
}: {
  movie: Movie;
  onPick: (m: Movie) => void;
}) {
  return (
    <button
      onClick={() => onPick(movie)}
      className="tb-card bg-card relative overflow-hidden text-left active:scale-[0.98] hover:scale-[1.02] transition-transform shadow-2xl w-full h-full group"
    >
      <div className="absolute inset-0 film-grain vignette">
        <img
          src={movie.posterUrl}
          alt={movie.title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/95 via-black/55 to-transparent" />
        <div className="absolute top-3 left-4">
          <span className="inline-block bg-gold text-cinema text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 rounded">
            Tela Brasil
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
          <h3 className="font-display text-xl sm:text-2xl md:text-3xl leading-tight text-white">
            {movie.title}
          </h3>
        </div>
      </div>
    </button>
  );
}

/* ---------- Step 2: Orient ---------- */

function Orient({
  movie,
  onNext,
  onBack,
}: {
  movie: Movie;
  onNext: () => void;
  onBack: () => void;
}) {
  useEffect(() => {
    console.log(`${UX} tela de instruções aberta`);
  }, []);

  const tips = [
    {
      svg: (
        <svg viewBox="0 0 24 24" className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10" fill="none" stroke="#F8BA32" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-7 8-7s8 3 8 7" strokeLinecap="round" />
        </svg>
      ),
      label: "Rosto visível",
    },
    {
      svg: (
        <svg viewBox="0 0 24 24" className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10" fill="none" stroke="#F8BA32" strokeWidth="2">
          <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12c1 1 1 2 1 3h6c0-1 0-2 1-3a7 7 0 0 0-4-12z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      label: "Boa iluminação",
    },
    {
      svg: (
        <svg viewBox="0 0 24 24" className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10" fill="none" stroke="#92C37A" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" fill="#92C37A" />
        </svg>
      ),
      label: "Olhe para a câmera",
    },
    {
      svg: (
        <svg viewBox="0 0 24 24" className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10" fill="none" stroke="#E0463A" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-7 8-7s8 3 8 7" strokeLinecap="round" />
          <line x1="2" y1="2" x2="22" y2="22" strokeLinecap="round" stroke="#E0463A" />
        </svg>
      ),
      label: "Apenas 1 pessoa",
    },
  ];

  return (
    <Screen aurora>
      <Header subtitle="Prepare-se" />

      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-3xl py-3 gap-4 sm:gap-5">
        {/* Film chip */}
        <div className="flex items-center gap-3 sm:gap-4 bg-white/5 border border-white/15 rounded-xl p-2.5 sm:p-3 animate-fade-up max-w-md w-full">
          <div className="w-14 h-18 sm:w-16 sm:h-20 rounded overflow-hidden shrink-0">
            <img src={movie.posterUrl} alt={movie.title} className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0 text-left flex-1">
            <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.3em] text-gold">
              Sua cena será inspirada em
            </p>
            <p className="font-display text-xl sm:text-2xl text-white truncate leading-tight mt-0.5">
              {movie.title}
            </p>
          </div>
        </div>

        <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl text-white leading-[0.95] animate-fade-up">
          Entre em <span className="text-gold">cena</span>
        </h1>
        <p className="text-sm sm:text-base text-white/70 max-w-md animate-fade-up">
          Sua foto será capturada automaticamente.
        </p>

        {/* Tips grid */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full max-w-md">
          {tips.map((t, i) => (
            <div
              key={t.label}
              className="flex flex-col items-center gap-2 rounded-xl border border-white/15 bg-white/5 p-3 sm:p-4 text-center animate-slide-in"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              {t.svg}
              <span className="text-[10px] sm:text-xs uppercase tracking-[0.18em] text-white/85">
                {t.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 shrink-0 flex flex-col items-center gap-2">
        <PrimaryCta onClick={onNext}>Estou pronto</PrimaryCta>
        <GhostBtn onClick={onBack}>Escolher outro filme</GhostBtn>
      </div>
    </Screen>
  );
}

/* ---------- Step 3: Camera ---------- */

function Camera({
  onCaptured,
  onBack,
}: {
  onCaptured: (p: { blob: Blob; url: string }) => void;
  onBack: () => void;
}) {
  const { videoRef, ready, errorKind, retry, capture } = useCamera(true);
  const [count, setCount] = useState<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (ready && count === null && !startedRef.current) {
      console.log(`${UX} contagem iniciada`);
      setCount(COUNTDOWN_SECONDS);
    }
  }, [ready, count]);

  useEffect(() => {
    if (count === null) return;
    if (count === 0) {
      if (startedRef.current) return;
      startedRef.current = true;
      (async () => {
        const result = await capture();
        if (result) onCaptured(result);
      })();
      return;
    }
    const t = setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [count, capture, onCaptured]);

  if (errorKind) return <CameraError kind={errorKind} onRetry={retry} onBack={onBack} />;

  return (
    <Screen>
      <Header subtitle="Câmera" />

      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-2xl py-3 gap-3 sm:gap-4">
        <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-white leading-[0.95] animate-fade-up">
          Olhe para a câmera
        </h1>

        <div className="relative w-full max-w-[420px] aspect-[4/5] rounded-2xl overflow-hidden border border-white/15 bg-black shadow-2xl">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />

          {!ready && !errorKind ? (
            <div className="absolute inset-0 grid place-items-center text-white/70 text-sm tracking-wide animate-pulse-soft">
              Iniciando câmera…
            </div>
          ) : null}

          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="w-2/3 h-3/4 rounded-[45%] border-2 border-gold/80 animate-pulse-soft" />
          </div>

          {(["tl", "tr", "bl", "br"] as const).map((p) => (
            <span
              key={p}
              className={`pointer-events-none absolute w-7 h-7 border-gold/90 ${
                p === "tl" ? "top-3 left-3 border-l-2 border-t-2" : ""
              } ${p === "tr" ? "top-3 right-3 border-r-2 border-t-2" : ""} ${
                p === "bl" ? "bottom-3 left-3 border-l-2 border-b-2" : ""
              } ${p === "br" ? "bottom-3 right-3 border-r-2 border-b-2" : ""}`}
            />
          ))}

          {count !== null && count > 0 ? (
            <div className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-[1px]">
              <span
                key={count}
                className="font-display text-white text-[140px] sm:text-[170px] lg:text-[220px] leading-none animate-pop-in"
                style={{ textShadow: "0 6px 30px rgba(0,0,0,0.6)" }}
              >
                {count}
              </span>
            </div>
          ) : null}
          {count === 0 ? (
            <div className="absolute inset-0 bg-white animate-fade-in" />
          ) : null}
        </div>

        <p className="text-xs sm:text-sm text-white/70 uppercase tracking-[0.25em]">
          Captura automática
        </p>
      </div>

      <div className="relative z-10 shrink-0">
        <GhostBtn onClick={onBack}>Voltar</GhostBtn>
      </div>
    </Screen>
  );
}

function CameraError({
  kind,
  onRetry,
  onBack,
}: {
  kind: CameraErrorKind;
  onRetry: () => void;
  onBack: () => void;
}) {
  const copy = useMemo(() => {
    if (kind === "permission")
      return {
        title: "Câmera bloqueada",
        body: "Autorize o uso da câmera nas configurações do navegador.",
        canRetry: true,
      };
    if (kind === "unsupported")
      return {
        title: "Navegador incompatível",
        body: "Abra a experiência em um navegador atualizado.",
        canRetry: false,
      };
    return {
      title: "Câmera indisponível",
      body: "Não foi possível iniciar a câmera.",
      canRetry: true,
    };
  }, [kind]);

  return (
    <Screen aurora wedgeColor="#E0463A">
      <Header />
      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-5 max-w-xl">
        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-red-500/15 border-2 border-red-500/40 grid place-items-center animate-badge-in">
          <svg viewBox="0 0 24 24" className="w-12 h-12 sm:w-14 sm:h-14" fill="none" stroke="#E0463A" strokeWidth="2">
            <rect x="2" y="6" width="14" height="12" rx="2" />
            <path d="M22 8l-6 4 6 4V8z" />
            <line x1="2" y1="2" x2="22" y2="22" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
        <h2 className="font-display text-3xl sm:text-5xl text-white leading-tight animate-fade-up">
          {copy.title}
        </h2>
        <p className="text-white/75 text-sm sm:text-base animate-fade-up">{copy.body}</p>
      </div>
      <div className="relative z-10 shrink-0 flex flex-col items-center gap-2">
        {copy.canRetry ? <PrimaryCta onClick={onRetry}>Tentar novamente</PrimaryCta> : null}
        <GhostBtn onClick={onBack}>Voltar para os filmes</GhostBtn>
      </div>
    </Screen>
  );
}

/* ---------- Step 4: Confirm ---------- */

function Confirm({
  photoUrl,
  onRetake,
  onUse,
}: {
  photoUrl: string;
  onRetake: () => void;
  onUse: () => void;
}) {
  return (
    <Screen aurora>
      <Header subtitle="Pré-visualização" />

      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-2xl py-3 gap-3 sm:gap-4">
        <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl text-white leading-[0.95] animate-fade-up">
          Gostou da sua <span className="text-gold">foto</span>?
        </h1>

        <div className="tb-card bg-card w-full max-w-[420px] aspect-[4/5] overflow-hidden mx-auto shadow-2xl animate-pop-in">
          <div className="relative w-full h-full">
            <img
              src={photoUrl}
              alt="Sua foto"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
          </div>
        </div>
      </div>

      <div className="relative z-10 shrink-0 flex flex-col items-center gap-2">
        <PrimaryCta onClick={onUse}>Usar esta foto</PrimaryCta>
        <GhostBtn onClick={onRetake}>Tirar novamente</GhostBtn>
      </div>
    </Screen>
  );
}

/* ---------- Step 5: Processing ---------- */

function Processing({ movie, onDone }: { movie: Movie; onDone: () => void }) {
  const [phraseIdx, setPhraseIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIdx((i) => (i + 1) % LOADING_PHRASES.length);
    }, 1600);
    const done = setTimeout(onDone, LOADING_PHRASES.length * 1600);
    return () => {
      clearInterval(interval);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <Screen aurora>
      <Header subtitle="Criando sua cena" />

      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-6 sm:gap-8 max-w-xl">
        <div className="w-28 h-28 sm:w-36 sm:h-36 lg:w-44 lg:h-44 rounded-full border border-gold/20 grid place-items-center relative animate-badge-in">
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gold animate-spin [animation-duration:1.8s]" />
          <div className="absolute inset-2 rounded-full border border-transparent border-t-brand-blue animate-spin [animation-duration:2.6s] [animation-direction:reverse]" />
          <span className="font-display text-2xl sm:text-3xl lg:text-4xl text-gold">P&amp;C</span>
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl text-white leading-none">
            Luzes, câmera, <span className="text-gold">ação</span>...
          </h1>
          <p className="text-white/70 text-sm sm:text-base">
            Inspirado em <span className="text-white">{movie.title}</span>
          </p>
        </div>

        <div className="h-6 relative w-full max-w-md">
          {LOADING_PHRASES.map((p, i) => (
            <p
              key={p}
              className={`absolute inset-0 text-sm sm:text-base tracking-wide text-gold transition-opacity duration-500 ${
                i === phraseIdx ? "opacity-100" : "opacity-0"
              }`}
            >
              {p}
            </p>
          ))}
        </div>

        <div className="w-full max-w-xs h-1.5 rounded-full bg-white/10 overflow-hidden shimmer-bar">
          <div className="h-full w-1/3 bg-gold rounded-full" />
        </div>
      </div>
    </Screen>
  );
}

/* ---------- Step 6: Result + QR ---------- */

function Result({
  movie,
  photoUrl,
  onRestart,
}: {
  movie: Movie;
  photoUrl: string | null;
  onRestart: () => void;
}) {
  return (
    <Screen aurora wedgeColor="#92C37A">
      <Header subtitle="Você entrou em cena" />

      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-2xl py-3 gap-3 sm:gap-4">
        <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl text-white leading-[0.95] animate-fade-up">
          Sua <span className="text-gold">cena</span> está pronta
        </h1>

        <div className="tb-card bg-card w-full max-w-[340px] aspect-[3/4] overflow-hidden mx-auto shadow-2xl animate-pop-in">
          <div className="relative w-full h-full film-grain vignette">
            <img
              src={photoUrl ?? movie.posterUrl}
              alt="Cena gerada"
              className="absolute inset-0 w-full h-full object-cover"
              style={photoUrl ? { transform: "scaleX(-1)" } : undefined}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-3">
              <span className="text-[10px] uppercase tracking-[0.3em] text-gold">
                Inspirado em
              </span>
              <h3 className="font-display text-lg sm:text-xl text-white leading-tight">
                {movie.title}
              </h3>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-white/5 border border-white/15 rounded-xl p-2.5 sm:p-3 w-full max-w-sm animate-fade-up">
          <div className="bg-white p-1.5 sm:p-2 rounded-lg shrink-0">
            <img src={QR_URL} alt="QR Code" className="w-16 h-16 sm:w-20 sm:h-20 object-contain" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-gold">
              Leve sua cena
            </p>
            <p className="text-sm text-white/85 leading-snug">
              Escaneie para baixar e compartilhar.
            </p>
          </div>
        </div>
      </div>

      <div className="relative z-10 shrink-0">
        <PrimaryCta onClick={onRestart}>Nova experiência</PrimaryCta>
      </div>
    </Screen>
  );
}
