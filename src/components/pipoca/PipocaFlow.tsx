import { useEffect, useMemo, useRef, useState } from "react";
import { StageShell } from "@/components/pipoca/StageShell";
import type { Movie } from "@/lib/pipoca/movies";
import { usePipocaFilms } from "@/lib/pipoca/usePipocaFilms";
import { useCamera, type CameraErrorKind } from "@/lib/pipoca/useCamera";

type Step =
  | "choose"
  | "orient"
  | "camera"
  | "confirm"
  | "processing"
  | "result";

const QR_URL =
  "/__l5e/assets-v1/c736c04b-4813-43bc-80b0-1d6742d491a3/qr-code.png";

const LOADING_PHRASES = [
  "Preparando o cenário...",
  "Ajustando luz, contraste e atmosfera...",
  "Colocando você no centro da cena...",
  "Finalizando sua imagem cinematográfica...",
];

const PAGE_SIZE = 4;
const COUNTDOWN_SECONDS = 10;

// Constante de inatividade preparada para uso futuro (não ativa nesta etapa).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PIPOCA_INACTIVITY_TIMEOUT_MS = 90_000;

const UX = "[PIPOCA_UX]";

export function PipocaFlow() {
  const [step, setStep] = useState<Step>("choose");
  const [selected, setSelected] = useState<Movie | null>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const { films, loading, error } = usePipocaFilms();

  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.url);
    };
  }, [photo]);

  const reset = () => {
    console.log(`${UX} fluxo reiniciado`);
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setSelected(null);
    setStep("choose");
  };

  return (
    <StageShell>
      <div
        key={step}
        className="flex-1 flex flex-col min-h-0 animate-fade-in w-full mx-auto"
        style={{ maxWidth: 820 }}
      >
        {step === "choose" && (
          <Choose
            movies={films}
            loading={loading}
            error={error}
            onPick={(m) => {
              console.log(`${UX} filme selecionado`, { id: m.id, title: m.title });
              setSelected(m);
              setStep("orient");
            }}
          />
        )}
        {step === "orient" && selected && (
          <Orient
            movie={selected}
            onNext={() => {
              console.log(`${UX} pronto para câmera`);
              setStep("camera");
            }}
            onBack={() => {
              console.log(`${UX} voltar para escolha de filme`);
              setSelected(null);
              setStep("choose");
            }}
          />
        )}
        {step === "camera" && (
          <Camera
            onCaptured={(p) => {
              console.log(`${UX} foto capturada`);
              setPhoto(p);
              setStep("confirm");
            }}
            onBack={() => {
              console.log(`${UX} câmera cancelada`);
              setStep("orient");
            }}
          />
        )}
        {step === "confirm" && photo && (
          <Confirm
            photoUrl={photo.url}
            onRetake={() => {
              console.log(`${UX} foto descartada`);
              URL.revokeObjectURL(photo.url);
              setPhoto(null);
              setStep("camera");
            }}
            onUse={() => {
              console.log(`${UX} foto confirmada`);
              setStep("processing");
            }}
          />
        )}
        {step === "processing" && selected && (
          <Processing movie={selected} onDone={() => setStep("result")} />
        )}
        {step === "result" && selected && (
          <Result
            movie={selected}
            photoUrl={photo?.url ?? null}
            onRestart={reset}
          />
        )}
      </div>
    </StageShell>
  );
}

/* ---------- Shared UI ---------- */

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full mx-auto bg-gold text-cinema font-semibold tracking-wider uppercase rounded-md py-6 text-base hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full mx-auto border border-white/25 text-white/90 font-medium tracking-wider uppercase rounded-md py-5 text-sm hover:bg-white/5 active:scale-[0.99] transition"
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
    <div className="flex-1 flex flex-col min-h-0 gap-4 pt-2">
      <div className="text-center shrink-0">
        <span className="text-[12px] uppercase tracking-[0.3em] text-gold">
          Pipoca &amp; Cena
        </span>
        <h1 className="font-display text-5xl md:text-6xl text-white mt-2 leading-[0.95]">
          Escolha seu filme
        </h1>
        <p className="mt-3 text-base text-white/75 max-w-xl mx-auto">
          Toque em uma obra do catálogo Tela Brasil para entrar em cena.
        </p>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center">
        {loading ? (
          <p className="text-base text-white/60 tracking-wide">
            Carregando filmes…
          </p>
        ) : error ? (
          <p className="text-base text-white/85 text-center max-w-md">{error}</p>
        ) : movies.length === 0 ? (
          <p className="text-base text-white/70">Nenhum filme disponível.</p>
        ) : onlyOne ? (
          <div className="h-full flex items-center justify-center w-full">
            <div className="h-full max-h-full aspect-[3/4]">
              <PosterCard movie={slice[0]} onPick={onPick} />
            </div>
          </div>
        ) : (
          <div className="h-full w-full grid grid-cols-2 grid-rows-2 gap-4">
            {slice.map((m) => (
              <PosterCard key={m.id} movie={m} onPick={onPick} />
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-4 shrink-0 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="w-20 h-20 rounded-full border border-white/25 grid place-items-center text-white text-3xl disabled:opacity-30 active:scale-95"
            aria-label="Página anterior"
          >
            ‹
          </button>
          <span className="text-sm uppercase tracking-[0.3em] text-white/70">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="w-20 h-20 rounded-full border border-white/25 grid place-items-center text-white text-3xl disabled:opacity-30 active:scale-95"
            aria-label="Próxima página"
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
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
      className="tb-card bg-card relative overflow-hidden text-left active:scale-[0.99] transition shadow-2xl w-full h-full"
    >
      <div className="absolute inset-0 film-grain vignette">
        <img
          src={movie.posterUrl}
          alt={movie.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/95 via-black/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <span className="text-[10px] uppercase tracking-[0.3em] text-gold">
            Catálogo Tela Brasil
          </span>
          <h3 className="font-display text-2xl md:text-3xl leading-tight mt-1 text-white">
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

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-5 pt-2">
      <div className="flex items-center gap-4 shrink-0 bg-white/5 border border-white/10 rounded-xl p-3">
        <div className="w-16 h-20 rounded overflow-hidden flex-shrink-0">
          <img
            src={movie.posterUrl}
            alt={movie.title}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold">
            Filme escolhido
          </p>
          <p className="text-base text-white truncate">{movie.title}</p>
          <p className="text-xs text-white/60 truncate">
            Sua cena será inspirada nesta obra.
          </p>
        </div>
      </div>

      <div className="text-center shrink-0">
        <h1 className="font-display text-5xl text-white leading-[0.95]">
          Prepare-se para entrar em cena
        </h1>
      </div>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-6">
        <div className="relative w-52 h-52">
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-gold/60 animate-pulse-soft" />
          <div className="absolute inset-6 rounded-full border border-white/15" />
          <div className="absolute inset-0 grid place-items-center text-gold">
            <svg viewBox="0 0 24 24" className="w-20 h-20" fill="currentColor">
              <path d="M12 12.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM4 20c0-3.314 3.582-6 8-6s8 2.686 8 6v.5H4V20z" />
            </svg>
          </div>
        </div>

        <div className="text-center max-w-xl space-y-3 px-2">
          <p className="text-lg text-white">
            Fique em frente à câmera, com o rosto visível e bem iluminado.
          </p>
          <p className="text-base text-white/65">
            Mantenha uma expressão natural e olhe diretamente para a câmera.
          </p>
          <p className="mt-4 inline-block text-sm uppercase tracking-[0.25em] text-gold border border-gold/40 rounded-md px-4 py-2">
            Experiência individual — apenas uma pessoa na foto
          </p>
        </div>
      </div>

      <div className="space-y-3 shrink-0">
        <PrimaryButton onClick={onNext}>Estou pronto</PrimaryButton>
        <GhostButton onClick={onBack}>Escolher outro filme</GhostButton>
      </div>
    </div>
  );
}

/* ---------- Step 3: Camera (real, auto-countdown) ---------- */

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

  // Start countdown automatically when camera is ready
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
    <div className="flex-1 flex flex-col min-h-0 gap-4 pt-2">
      <div className="text-center shrink-0">
        <h1 className="font-display text-4xl md:text-5xl text-white leading-[0.95]">
          Olhe para a câmera
        </h1>
        <p className="mt-2 text-sm text-white/70">
          A foto será tirada automaticamente.
        </p>
      </div>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4">
        <div className="relative h-full max-h-full aspect-[4/5] rounded-2xl overflow-hidden border border-white/15 bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />

          {!ready && !errorKind ? (
            <div className="absolute inset-0 grid place-items-center text-white/70 text-sm tracking-wide">
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
            <div className="absolute inset-0 grid place-items-center bg-black/30 backdrop-blur-[1px]">
              <span className="font-display text-white text-[200px] leading-none">
                {count}
              </span>
            </div>
          ) : null}
          {count === 0 ? (
            <div className="absolute inset-0 bg-white animate-fade-in" />
          ) : null}
        </div>

        <p className="text-base text-white/80 text-center max-w-md">
          Permaneça na marcação até a contagem terminar.
        </p>
      </div>

      <div className="shrink-0">
        <GhostButton onClick={onBack}>Voltar</GhostButton>
      </div>
    </div>
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
        title: "Não conseguimos acessar a câmera",
        body: "Autorize o uso da câmera nas configurações do navegador e tente novamente.",
        canRetry: true,
      };
    if (kind === "unsupported")
      return {
        title: "Este navegador não oferece suporte à câmera",
        body: "Abra a experiência em um navegador atualizado.",
        canRetry: false,
      };
    return {
      title: "Câmera indisponível",
      body: "Não foi possível iniciar a câmera neste dispositivo.",
      canRetry: true,
    };
  }, [kind]);

  return (
    <div className="flex-1 flex flex-col min-h-0 items-center justify-center text-center gap-6 px-4">
      <h2 className="font-display text-5xl text-white max-w-xl leading-tight">
        {copy.title}
      </h2>
      <p className="text-white/75 max-w-md text-base">{copy.body}</p>
      <div className="w-full max-w-md space-y-3">
        {copy.canRetry ? (
          <PrimaryButton onClick={onRetry}>Tentar novamente</PrimaryButton>
        ) : null}
        <GhostButton onClick={onBack}>Voltar para os filmes</GhostButton>
      </div>
    </div>
  );
}

/* ---------- Step 4: Confirm photo ---------- */

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
    <div className="flex-1 flex flex-col min-h-0 gap-4 pt-2">
      <div className="text-center shrink-0">
        <h1 className="font-display text-5xl text-white leading-[0.95]">
          Gostou da sua foto?
        </h1>
        <p className="mt-3 text-base text-white/70 max-w-xl mx-auto">
          Essa será a imagem usada para criar sua cena personalizada.
        </p>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="tb-card bg-card h-full max-h-full aspect-[4/5] overflow-hidden">
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

      <div className="space-y-3 shrink-0">
        <PrimaryButton onClick={onUse}>Usar esta foto</PrimaryButton>
        <GhostButton onClick={onRetake}>Tirar novamente</GhostButton>
      </div>
    </div>
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
    <div className="flex-1 flex flex-col min-h-0 items-center justify-center text-center gap-8">
      <div className="w-40 h-40 rounded-full border border-gold/20 grid place-items-center relative">
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gold animate-spin [animation-duration:1.8s]" />
        <span className="font-display text-3xl text-gold">P&amp;C</span>
      </div>

      <div className="space-y-4 max-w-xl">
        <h1 className="font-display text-5xl text-white leading-none">
          Luzes, câmera, ação...
        </h1>
        <p className="text-white/70 text-base">
          Estamos criando sua cena inspirada no filme escolhido.
        </p>
      </div>

      <div className="h-6 relative w-full max-w-md">
        {LOADING_PHRASES.map((p, i) => (
          <p
            key={p}
            className={`absolute inset-0 text-base tracking-wide text-gold transition-opacity duration-500 ${
              i === phraseIdx ? "opacity-100" : "opacity-0"
            }`}
          >
            {p}
          </p>
        ))}
      </div>

      <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">
        Inspirado em: {movie.title}
      </p>
    </div>
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
    <div className="flex-1 flex flex-col min-h-0 gap-4 pt-2">
      <div className="text-center shrink-0">
        <span className="text-[12px] uppercase tracking-[0.3em] text-gold">
          Sua cena
        </span>
        <h1 className="font-display text-5xl text-white mt-2 leading-[0.95]">
          Você entrou em cena
        </h1>
        <p className="mt-2 text-sm text-white/65">
          Inspirado em <span className="text-white">{movie.title}</span>
        </p>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 gap-4 items-center">
        <div className="h-full min-h-0 flex items-center justify-center">
          <div className="tb-card bg-card h-full max-h-full aspect-[3/4] overflow-hidden">
            <div className="relative w-full h-full film-grain vignette">
              <img
                src={photoUrl ?? movie.posterUrl}
                alt="Cena gerada"
                className="absolute inset-0 w-full h-full object-cover"
                style={photoUrl ? { transform: "scaleX(-1)" } : undefined}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4">
                <span className="text-[10px] uppercase tracking-[0.3em] text-gold">
                  Inspirado em
                </span>
                <h3 className="font-display text-xl text-white mt-1 leading-tight">
                  {movie.title}
                </h3>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 shrink-0">
          <div className="bg-white p-3 rounded-xl shadow-2xl">
            <img src={QR_URL} alt="QR Code" className="w-32 h-32 object-contain" />
          </div>
          <p className="text-sm text-white/80 max-w-[12rem] leading-snug">
            Escaneie para baixar e compartilhar sua imagem.
          </p>
        </div>
      </div>

      <div className="shrink-0">
        <PrimaryButton onClick={onRestart}>Nova experiência</PrimaryButton>
      </div>
    </div>
  );
}
