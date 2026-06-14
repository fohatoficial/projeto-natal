import { useEffect, useState } from "react";
import { StageShell } from "@/components/pipoca/StageShell";
import { MovieCard } from "@/components/pipoca/MovieCard";
import type { Movie } from "@/lib/pipoca/movies";
import { usePipocaFilms } from "@/lib/pipoca/usePipocaFilms";

type Step =
  | "intro"
  | "choose"
  | "chosen"
  | "orient"
  | "camera"
  | "confirm"
  | "processing"
  | "result"
  | "qrcode";

// Placeholder de "foto do visitante" — simulação (sem câmera real).
const VISITOR_PLACEHOLDER =
  "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=900&q=80";

const QR_URL =
  "/__l5e/assets-v1/7c617a7d-82ed-49d3-85ec-96e912161a48/qr-code.png";

const LOADING_PHRASES = [
  "Preparando o cenário...",
  "Ajustando luz, contraste e atmosfera...",
  "Colocando você no centro da cena...",
  "Finalizando sua imagem cinematográfica...",
];

export function PipocaFlow() {
  const [step, setStep] = useState<Step>("intro");
  const [selected, setSelected] = useState<Movie | null>(null);
  const { films: movies, loading, error } = usePipocaFilms();

  const reset = () => {
    setSelected(null);
    setStep("intro");
  };

  return (
    <StageShell>
      <div key={step} className="flex-1 flex flex-col animate-fade-in">
        {step === "intro" && <Intro onStart={() => setStep("choose")} />}
        {step === "choose" && (
          <Choose
            movies={movies}
            loading={loading}
            error={error}
            onPick={(m) => {
              setSelected(m);
              setStep("chosen");
            }}
          />
        )}
        {step === "chosen" && selected && (
          <Chosen movie={selected} onNext={() => setStep("orient")} />
        )}
        {step === "orient" && <Orient onNext={() => setStep("camera")} />}
        {step === "camera" && <Camera onShoot={() => setStep("confirm")} />}
        {step === "confirm" && (
          <Confirm
            onRetake={() => setStep("camera")}
            onUse={() => setStep("processing")}
          />
        )}
        {step === "processing" && selected && (
          <Processing movie={selected} onDone={() => setStep("result")} />
        )}
        {step === "result" && selected && (
          <Result
            movie={selected}
            onQr={() => setStep("qrcode")}
            onRestart={reset}
          />
        )}
        {step === "qrcode" && selected && (
          <QrCode movie={selected} onRestart={reset} />
        )}
      </div>
    </StageShell>
  );
}

/* ---------- Screens ---------- */

function Title({ kicker, title }: { kicker?: string; title: string }) {
  return (
    <div className="text-center">
      {kicker ? (
        <span className="text-[11px] uppercase tracking-[0.3em] text-gold">{kicker}</span>
      ) : null}
      <h1 className="font-display text-5xl md:text-6xl text-white mt-2 leading-[0.95]">
        {title}
      </h1>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full max-w-md mx-auto bg-gold text-cinema font-semibold tracking-wider uppercase rounded-md py-5 text-sm hover:brightness-110 active:scale-[0.99] transition glow-pulse"
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
      className="w-full max-w-md mx-auto border border-white/25 text-white/90 font-medium tracking-wider uppercase rounded-md py-5 text-sm hover:bg-white/5 active:scale-[0.99] transition"
    >
      {children}
    </button>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex-1 flex flex-col justify-center items-center text-center gap-10 max-w-xl mx-auto">
      <div className="animate-fade-up">
        <span className="text-[11px] uppercase tracking-[0.4em] text-gold">
          Experiência interativa
        </span>
        <h1 className="font-display text-7xl md:text-8xl text-white mt-3 leading-[0.9]">
          Pipoca
          <span className="text-gold"> &amp; </span>
          Cena
        </h1>
        <p className="mt-6 text-lg text-white/85 font-medium">
          Escolha um filme brasileiro. Tire sua foto. Entre em cena.
        </p>
      </div>

      <p className="text-white/65 text-base leading-relaxed animate-fade-up max-w-md">
        Escolha uma obra do catálogo Tela Brasil, tire sua foto e veja a IA
        transformar você em personagem de uma cena inspirada no filme escolhido.
      </p>

      <div className="w-full pt-4 animate-fade-up">
        <PrimaryButton onClick={onStart}>Começar</PrimaryButton>
      </div>
    </div>
  );
}

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
  return (
    <div className="flex-1 flex flex-col gap-8 pt-4">
      <Title kicker="Passo 1 de 4" title="Escolha seu filme" />
      <p className="text-center text-white/70 max-w-md mx-auto">
        Selecione uma obra do catálogo Tela Brasil para inspirar sua cena
        personalizada.
      </p>
      <div className="flex-1 flex items-center justify-center">
        {loading ? (
          <p className="text-sm text-white/60 tracking-wide">Carregando filmes...</p>
        ) : error ? (
          <p className="text-sm text-white/80 text-center max-w-sm">{error}</p>
        ) : (
          <div className="grid gap-6 w-full">
            {movies.map((m) => (
              <MovieCard key={m.id} movie={m} onChoose={onPick} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Chosen({ movie, onNext }: { movie: Movie; onNext: () => void }) {
  return (
    <div className="flex-1 flex flex-col gap-8">
      <Title kicker="Filme escolhido" title="Filme escolhido" />
      <p className="text-center text-white/70 max-w-md mx-auto">
        Agora vamos criar uma cena personalizada inspirada no universo visual
        desta obra.
      </p>

      <div className="flex-1 flex items-center justify-center">
        <div className="tb-card bg-card w-full max-w-sm overflow-hidden">
          <div className="relative aspect-[3/4] film-grain vignette">
            <img
              src={movie.posterUrl}
              alt={movie.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-5">
              <span className="text-[10px] uppercase tracking-[0.3em] text-gold">
                Inspirado em
              </span>
              <h3 className="font-display text-2xl leading-tight text-white mt-1">
                {movie.title}
              </h3>
            </div>
          </div>
        </div>
      </div>

      <PrimaryButton onClick={onNext}>Continuar</PrimaryButton>
    </div>
  );
}

function Orient({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex-1 flex flex-col gap-8">
      <Title kicker="Passo 2 de 4" title="Prepare sua cena" />

      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <div className="relative w-56 h-56">
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-gold/60 animate-pulse-soft" />
          <div className="absolute inset-6 rounded-full border border-white/15" />
          <div className="absolute inset-0 grid place-items-center text-gold">
            <svg viewBox="0 0 24 24" className="w-20 h-20" fill="currentColor">
              <path d="M12 12.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM4 20c0-3.314 3.582-6 8-6s8 2.686 8 6v.5H4V20z" />
            </svg>
          </div>
        </div>

        <div className="text-center max-w-md space-y-4">
          <p className="text-lg text-white">
            Fique em pé, no centro da marcação, com o rosto visível e bem
            iluminado.
          </p>
          <p className="text-sm text-white/65">
            Mantenha uma expressão natural. A IA usará sua foto para criar uma
            imagem inspirada no filme escolhido.
          </p>
        </div>
      </div>

      <PrimaryButton onClick={onNext}>Abrir câmera</PrimaryButton>
    </div>
  );
}

function Camera({ onShoot }: { onShoot: () => void }) {
  const [count, setCount] = useState<number | null>(null);

  const triggerShoot = () => {
    setCount(3);
  };

  useEffect(() => {
    if (count === null) return;
    if (count === 0) {
      const t = setTimeout(onShoot, 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 700);
    return () => clearTimeout(t);
  }, [count, onShoot]);

  return (
    <div className="flex-1 flex flex-col gap-6">
      <Title title="Câmera" />

      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className="relative w-full max-w-sm aspect-[3/4] rounded-2xl overflow-hidden border border-white/15 bg-black">
          {/* simulated viewfinder */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(40,40,40,1)_0%,_rgba(0,0,0,1)_80%)]" />

          {/* face marker */}
          <div className="absolute inset-0 grid place-items-center">
            <div className="w-44 h-56 rounded-[45%] border-2 border-gold/80 animate-pulse-soft" />
          </div>

          {/* corner frame brackets */}
          {(["tl", "tr", "bl", "br"] as const).map((p) => (
            <span
              key={p}
              className={`absolute w-6 h-6 border-gold/90 ${
                p === "tl" ? "top-3 left-3 border-l-2 border-t-2" : ""
              } ${p === "tr" ? "top-3 right-3 border-r-2 border-t-2" : ""} ${
                p === "bl" ? "bottom-3 left-3 border-l-2 border-b-2" : ""
              } ${p === "br" ? "bottom-3 right-3 border-r-2 border-b-2" : ""}`}
            />
          ))}

          {/* scan line */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-x-0 h-px bg-gold/60 animate-scan" />
          </div>

          {/* REC */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse-soft" />
            <span className="text-[10px] tracking-[0.3em] uppercase">Live</span>
          </div>

          {/* countdown overlay */}
          {count !== null && count > 0 ? (
            <div className="absolute inset-0 grid place-items-center bg-black/30 backdrop-blur-[1px]">
              <span className="font-display text-white text-[140px] leading-none">
                {count}
              </span>
            </div>
          ) : null}
          {count === 0 ? (
            <div className="absolute inset-0 bg-white animate-fade-in" />
          ) : null}
        </div>

        <div className="text-center space-y-2 max-w-md">
          <p className="text-white">Posicione seu rosto dentro da marcação.</p>
          <p className="text-sm text-white/60">
            Evite cobrir o rosto e mantenha-se parado por alguns segundos.
          </p>
        </div>
      </div>

      <button
        onClick={triggerShoot}
        disabled={count !== null}
        className="mx-auto w-20 h-20 rounded-full bg-white grid place-items-center shadow-2xl disabled:opacity-50 active:scale-95 transition"
        aria-label="Tirar foto"
      >
        <span className="w-16 h-16 rounded-full border-4 border-cinema" />
      </button>
      <p className="text-center text-xs uppercase tracking-[0.3em] text-white/60">
        Tirar foto
      </p>
    </div>
  );
}

function Confirm({
  onRetake,
  onUse,
}: {
  onRetake: () => void;
  onUse: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col gap-8">
      <Title title="Gostou da sua foto?" />
      <p className="text-center text-white/70 max-w-md mx-auto">
        Essa será a imagem usada para criar sua cena personalizada.
      </p>

      <div className="flex-1 flex items-center justify-center">
        <div className="tb-card bg-card w-full max-w-sm overflow-hidden">
          <div className="relative aspect-[3/4]">
            <img
              src={VISITOR_PLACEHOLDER}
              alt="Foto do visitante (simulada)"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute top-3 right-3 bg-black/70 text-[10px] uppercase tracking-[0.25em] text-white/90 px-2 py-1 rounded">
              Prévia
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <PrimaryButton onClick={onUse}>Usar esta foto</PrimaryButton>
        <GhostButton onClick={onRetake}>Tirar novamente</GhostButton>
      </div>
    </div>
  );
}

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
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-10">
      <div className="relative">
        <div className="w-40 h-40 rounded-full border border-gold/20 grid place-items-center relative">
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gold animate-spin [animation-duration:1.8s]" />
          <div className="absolute inset-3 rounded-full border border-gold/10" />
          <span className="font-display text-3xl text-gold">P&amp;C</span>
        </div>
      </div>

      <div className="space-y-4 max-w-md">
        <h1 className="font-display text-5xl text-white leading-none">
          Luzes, câmera, ação...
        </h1>
        <p className="text-white/70">
          Estamos criando sua cena personalizada inspirada no filme escolhido.
        </p>
      </div>

      <div className="h-6 relative w-full max-w-md">
        {LOADING_PHRASES.map((p, i) => (
          <p
            key={p}
            className={`absolute inset-0 text-sm tracking-wide text-gold transition-opacity duration-500 ${
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

function Result({
  movie,
  onQr,
  onRestart,
}: {
  movie: Movie;
  onQr: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col gap-7">
      <Title kicker="Sua cena" title="Você entrou em cena" />
      <p className="text-center text-white/70 max-w-md mx-auto">
        Sua imagem foi recriada em um universo inspirado no cinema brasileiro.
      </p>

      <div className="flex-1 flex items-center justify-center">
        <div className="tb-card bg-card w-full max-w-md overflow-hidden">
          <div className="relative aspect-[3/4] film-grain vignette">
            <img
              src={movie.posterUrl}
              alt="Cena gerada"
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
      </div>

      <div className="space-y-3">
        <PrimaryButton onClick={onQr}>Gerar QR Code</PrimaryButton>
        <GhostButton onClick={onRestart}>Refazer experiência</GhostButton>
      </div>
    </div>
  );
}

function QrCode({ movie, onRestart }: { movie: Movie; onRestart: () => void }) {
  return (
    <div className="flex-1 flex flex-col gap-7">
      <Title kicker="Pronto!" title="Baixe e compartilhe sua cena" />
      <p className="text-center text-white/70 max-w-md mx-auto">
        Escaneie o QR Code para acessar sua imagem personalizada.
      </p>

      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <div className="bg-white p-5 rounded-2xl shadow-2xl">
          <img src={QR_URL} alt="QR Code" className="w-56 h-56 object-contain" />
        </div>

        <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-3 max-w-sm w-full">
          <div className="w-16 h-20 rounded overflow-hidden flex-shrink-0">
            <img
              src={movie.posterUrl}
              alt={movie.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-gold">
              Sua cena
            </p>
            <p className="text-sm text-white truncate">{movie.title}</p>
          </div>
        </div>

        <p className="text-xs text-white/55 text-center max-w-sm">
          Depois, conheça também o filme que inspirou sua cena no catálogo Tela
          Brasil.
        </p>
      </div>

      <PrimaryButton onClick={onRestart}>Nova experiência</PrimaryButton>
    </div>
  );
}
