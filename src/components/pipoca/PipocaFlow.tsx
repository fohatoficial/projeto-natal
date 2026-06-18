import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import type { Movie } from "@/lib/pipoca/movies";
import { usePipocaFilms } from "@/lib/pipoca/usePipocaFilms";
import { useCamera, type CameraErrorKind } from "@/lib/pipoca/useCamera";
import {
  prewarmCamera,
  releaseSharedCamera,
  getSharedStatus,
  subscribeSharedCamera,
} from "@/lib/pipoca/sharedCamera";
import { supabase } from "@/integrations/supabase/client";
import {
  createPipocaCaptureUpload,
  confirmPipocaCaptureUpload,
} from "@/lib/pipoca/upload.functions";
import {
  createPipocaGeneration,
  getPipocaGenerationStatus,
} from "@/lib/pipoca/generation.functions";
import { createPipocaVisitor } from "@/lib/pipoca/visitors.functions";
import {
  PRIVACY_NOTICE_PARAGRAPHS,
  PRIVACY_NOTICE_TITLE,
  PRIVACY_NOTICE_VERSION,
  PRIVACY_CHECKBOX_LABEL,
} from "@/lib/pipoca/privacy-notice";
import { formatWhatsappMask, isValidBrWhatsapp } from "@/lib/pipoca/whatsapp";



type Step =
  | "choose"
  | "visitor_registration"
  | "stories"
  | "camera_identity"
  | "orient_appearance"
  | "camera_appearance"
  | "confirm"
  | "processing"
  | "result";

type CameraVariant = "identity" | "appearance";

const LOGO_URL =
  "/__l5e/assets-v1/ebc60a74-6a98-4a67-97b1-950064f94104/logo_tela_brasil_light.svg";

const LOADING_PHRASES = [
  "Preparando o cenário...",
  "Ajustando luz e atmosfera...",
  "Colocando você no centro da cena...",
  "Finalizando sua imagem cinematográfica...",
];

const CinemaIconClapper = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M3 9.5 21 7l-.5-2.5L2.5 7 3 9.5Z" />
    <path d="M3 9.5V20a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9.5" />
    <path d="m7 8 1.5-3M12 7.5 13.5 4.5M17 7l1.5-3" />
  </svg>
);
const CinemaIconPopcorn = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M18 8a2 2 0 0 0-2-2 3 3 0 0 0-5.66-1A3 3 0 0 0 6 8a2 2 0 0 0-2 2v1l2 10h12l2-10V10a2 2 0 0 0-2-2Z" />
    <path d="M10 11v9M14 11v9M8 21h8" />
  </svg>
);
const CinemaIconFilm = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M7 3v18M17 3v18M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4" />
  </svg>
);
const CinemaIconStar = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="m12 2 2.9 6.9L22 10l-5.5 4.6L18.2 22 12 18.3 5.8 22l1.7-7.4L2 10l7.1-1.1L12 2Z" />
  </svg>
);
const CinemaIconCamera = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M3 7h3l2-2h8l2 2h3v12H3z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
const CinemaIconSparkles = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);
const CINEMA_ICONS = [
  CinemaIconClapper,
  CinemaIconPopcorn,
  CinemaIconFilm,
  CinemaIconCamera,
  CinemaIconStar,
  CinemaIconSparkles,
];

const PAGE_SIZE = 4;
const COUNTDOWN_SECONDS = 10;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PIPOCA_INACTIVITY_TIMEOUT_MS = 90_000;

const UX = "[PIPOCA_UX]";

/* ---------- Root ---------- */

type Prepared = {
  sessionId: string;
  captureId: string;
  uploads: {
    identity: { path: string; token: string };
    appearance: { path: string; token: string };
  };
};
type UploadStatus = "idle" | "preparing" | "uploading" | "confirming" | "error";
const CAPTURE_LOG = "[PIPOCA_CAPTURE]";
const UPLOAD_LOG = "[PIPOCA_UPLOAD]";

function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.localStorage.getItem("pipoca_device_id");
    if (!id) {
      id = `tb-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
      window.localStorage.setItem("pipoca_device_id", id);
    }
    return id;
  } catch {
    return null;
  }
}

const GEN_LOG = "[PIPOCA_GENERATION]";

export function PipocaFlow() {
  const [step, setStep] = useState<Step>("choose");
  const [selected, setSelected] = useState<Movie | null>(null);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string>("");
  const [identityPhoto, setIdentityPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [appearancePhoto, setAppearancePhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [resultPageUrl, setResultPageUrl] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const identityUploadedRef = useRef(false);
  const appearanceUploadedRef = useRef(false);
  const generationStartedRef = useRef(false);
  const { films, loading, error } = usePipocaFilms();

  const prepareFn = useServerFn(createPipocaCaptureUpload);
  const confirmFn = useServerFn(confirmPipocaCaptureUpload);
  const createGenFn = useServerFn(createPipocaGeneration);
  const statusGenFn = useServerFn(getPipocaGenerationStatus);
  const createVisitorFn = useServerFn(createPipocaVisitor);

  // Keep refs in sync so the unmount cleanup can revoke without re-running
  // the effect (and prematurely revoking) whenever a photo state changes.
  const identityRef = useRef<{ blob: Blob; url: string } | null>(null);
  const appearanceRef = useRef<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    identityRef.current = identityPhoto;
  }, [identityPhoto]);
  useEffect(() => {
    appearanceRef.current = appearancePhoto;
  }, [appearancePhoto]);
  useEffect(() => {
    return () => {
      if (identityRef.current) URL.revokeObjectURL(identityRef.current.url);
      if (appearanceRef.current) URL.revokeObjectURL(appearanceRef.current.url);
      // Encerra a câmera ao desmontar o fluxo principal.
      releaseSharedCamera();
    };
  }, []);

  function transitionTo(swap: () => void) {
    setTransitioning(true);
    window.setTimeout(swap, 450);
    window.setTimeout(() => setTransitioning(false), 950);
  }

  const clearPhotos = () => {
    if (identityPhoto) URL.revokeObjectURL(identityPhoto.url);
    if (appearancePhoto) URL.revokeObjectURL(appearancePhoto.url);
    setIdentityPhoto(null);
    setAppearancePhoto(null);
    identityUploadedRef.current = false;
    appearanceUploadedRef.current = false;
  };

  const reset = () =>
    transitionTo(() => {
      console.log(`${UX} fluxo reiniciado`);
      clearPhotos();
      releaseSharedCamera();
      setSelected(null);
      setVisitorId(null);
      setFirstName("");
      setPrepared(null);
      setUploadStatus("idle");
      setUploadError(null);
      setGenerationId(null);
      setGeneratedUrl(null);
      setPublicToken(null);
      setResultPageUrl(null);
      setGenError(null);
      generationStartedRef.current = false;
      setStep("choose");
    });

  const startGeneration = useCallback(
    async (sessionId: string, captureId: string) => {
      if (generationStartedRef.current) return;
      generationStartedRef.current = true;
      console.log(`${GEN_LOG} usando identidade, aparência e cenário`);
      try {
        const res = await createGenFn({ data: { sessionId, captureId } });
        setGenerationId(res.generationId);
        setGenError(null);
      } catch (e) {
        console.warn(`${GEN_LOG} falhou`, e);
        generationStartedRef.current = false;
        const message = e instanceof Error ? e.message : String(e ?? "");
        setGenError(
          message.includes("CROSS_FILM_PROMPT_CONTAMINATION")
            ? "Não foi possível preparar o estilo deste filme. Tente novamente."
            : "Não conseguimos iniciar sua cena.",
        );
      }
    },
    [createGenFn],
  );

  const runUpload = useCallback(async () => {
    if (!identityPhoto || !appearancePhoto || !selected) return;
    setUploadError(null);
    let current = prepared;
    try {
      if (!current) {
        setUploadStatus("preparing");
        const res = await prepareFn({
          data: {
            filmId: selected.id,
            deviceId: getDeviceId(),
            contentType: "image/jpeg",
            visitorId: visitorId ?? null,
          },
        });
        current = res as Prepared;
        setPrepared(current);
      }

      setUploadStatus("uploading");

      if (!identityUploadedRef.current) {
        const { error: upErr } = await supabase.storage
          .from("pipoca-visitor-originals")
          .uploadToSignedUrl(
            current.uploads.identity.path,
            current.uploads.identity.token,
            identityPhoto.blob,
            { contentType: "image/jpeg" },
          );
        if (upErr) throw upErr;
        identityUploadedRef.current = true;
        console.log(`${UPLOAD_LOG} identidade enviada`);
      }

      if (!appearanceUploadedRef.current) {
        const { error: upErr } = await supabase.storage
          .from("pipoca-visitor-originals")
          .uploadToSignedUrl(
            current.uploads.appearance.path,
            current.uploads.appearance.token,
            appearancePhoto.blob,
            { contentType: "image/jpeg" },
          );
        if (upErr) throw upErr;
        appearanceUploadedRef.current = true;
        console.log(`${UPLOAD_LOG} aparência enviada`);
      }

      setUploadStatus("confirming");
      await confirmFn({
        data: {
          sessionId: current.sessionId,
          captureId: current.captureId,
        },
      });
      setUploadStatus("idle");
      releaseSharedCamera();
      transitionTo(() => setStep("processing"));
      void startGeneration(current.sessionId, current.captureId);
    } catch (err) {
      const stage = !current
        ? "prepare"
        : !identityUploadedRef.current
          ? "upload-identidade"
          : !appearanceUploadedRef.current
            ? "upload-aparencia"
            : "confirm";
      console.warn(`${UPLOAD_LOG} falhou`, { stage });
      setUploadStatus("error");
      setUploadError(stage);
    }
  }, [identityPhoto, appearancePhoto, selected, prepared, prepareFn, confirmFn, startGeneration, visitorId]);

  const retryGeneration = useCallback(() => {
    if (!prepared) return;
    setGenError(null);
    setGenerationId(null);
    setGeneratedUrl(null);
    setPublicToken(null);
    setResultPageUrl(null);
    generationStartedRef.current = false;
    void startGeneration(prepared.sessionId, prepared.captureId);
  }, [prepared, startGeneration]);

  const retakeAll = () =>
    transitionTo(() => {
      console.log(`${UX} fotos descartadas`);
      clearPhotos();
      // New attempt = new session for cleanliness.
      setPrepared(null);
      generationStartedRef.current = false;
      setGenerationId(null);
      setGeneratedUrl(null);
      setPublicToken(null);
      setResultPageUrl(null);
      setGenError(null);
      setUploadStatus("idle");
      setUploadError(null);
      setStep("camera_identity");
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
              setStep("visitor_registration");
            });
          }}
        />
      )}
      {step === "visitor_registration" && selected && (
        <VisitorRegistration
          createVisitorFn={createVisitorFn}
          onDone={(id, name) => {
            console.log(`${UX} visitante registrado`);
            setVisitorId(id);
            setFirstName(name);
            void prewarmCamera().catch(() => {});
            transitionTo(() => setStep("stories"));
          }}
          onBack={() =>
            transitionTo(() => {
              setSelected(null);
              setStep("choose");
            })
          }
        />
      )}
      {step === "stories" && selected && (
        <Stories
          movie={selected}
          firstName={firstName}
          onDone={() => {
            console.log(`${UX} stories concluídos, abrindo câmera`);
            transitionTo(() => setStep("camera_identity"));
          }}
          onChangeFilm={() => {
            releaseSharedCamera();
            transitionTo(() => {
              setSelected(null);
              setStep("choose");
            });
          }}
        />
      )}
      {step === "camera_identity" && (
        <Camera
          variant="identity"
          onCaptured={(p) => {
            console.log(`${CAPTURE_LOG} foto de identidade capturada`);
            setIdentityPhoto(p);
            transitionTo(() => setStep("orient_appearance"));
          }}
          onBack={() =>
            transitionTo(() => {
              setStep("stories");
            })
          }
        />
      )}
      {step === "orient_appearance" && (
        <OrientAppearance
          onNext={() => {
            transitionTo(() => setStep("camera_appearance"));
          }}
        />
      )}
      {step === "camera_appearance" && (
        <Camera
          variant="appearance"
          onCaptured={(p) => {
            console.log(`${CAPTURE_LOG} foto de aparência capturada`);
            setAppearancePhoto(p);
            transitionTo(() => setStep("confirm"));
          }}
          onBack={() =>
            transitionTo(() => {
              setStep("orient_appearance");
            })
          }
        />
      )}
      {step === "confirm" && identityPhoto && appearancePhoto && (
        <Confirm
          identityUrl={identityPhoto.url}
          appearanceUrl={appearancePhoto.url}
          onRetake={retakeAll}
          onUse={() => {
            console.log(`${UX} fotos confirmadas`);
            void runUpload();
          }}
        />
      )}
      {step === "processing" && selected && (
        <Processing
          movie={selected}
          firstName={firstName}
          generationId={generationId}
          errored={Boolean(genError)}
          pollFn={statusGenFn}
          onDone={(imageUrl, token, url) => {
            setGeneratedUrl(imageUrl);
            setPublicToken(token);
            setResultPageUrl(url);
            transitionTo(() => setStep("result"));
          }}
          onError={(msg) => setGenError(msg)}
        />
      )}
      {step === "result" && selected && (
        <Result
          movie={selected}
          firstName={firstName}
          imageUrl={generatedUrl}
          publicToken={publicToken}
          resultPageUrl={resultPageUrl}
          onRestart={reset}
        />
      )}

      {step === "processing" && genError && (
        <GenerationError
          message={genError}
          onRetry={retryGeneration}
          onRestart={reset}
        />
      )}

      {uploadStatus !== "idle" && uploadStatus !== "error" && (
        <UploadOverlay status={uploadStatus} />
      )}

      {uploadStatus === "error" && (
        <UploadError
          stage={uploadError}
          onRetry={() => void runUpload()}
          onRetake={retakeAll}
        />
      )}

      {transitioning && (
        <div
          className="fixed inset-0 z-[60] pointer-events-none overflow-hidden bg-black/30"
          aria-hidden
        />
      )}
    </div>
  );
}


function GenerationError({
  message,
  onRetry,
  onRestart,
}: {
  message: string;
  onRetry: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[58] grid place-items-center bg-black/90 backdrop-blur-sm p-6">
      <div className="max-w-md w-full flex flex-col items-center gap-5 text-center">
        <div className="w-20 h-20 rounded-full bg-red-500/15 border-2 border-red-500/50 grid place-items-center">
          <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="#E0463A" strokeWidth="2.2">
            <path d="M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="font-display text-3xl sm:text-4xl text-white leading-tight">
          NÃO CONSEGUIMOS CRIAR SUA CENA
        </h2>
        <p className="text-white/75 text-sm sm:text-base">
          {message}
        </p>
        <div className="flex flex-col items-center gap-2 pt-2">
          <PrimaryCta onClick={onRetry}>Tentar novamente</PrimaryCta>
          <GhostBtn onClick={onRestart}>Nova experiência</GhostBtn>
        </div>
      </div>
    </div>
  );
}

function UploadOverlay({ status }: { status: UploadStatus }) {
  const label =
    status === "preparing"
      ? "Preparando sua foto..."
      : status === "uploading"
        ? "Enviando sua foto..."
        : "Finalizando envio...";
  return (
    <div className="fixed inset-0 z-[55] grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-5 px-6 text-center">
        <div className="w-20 h-20 rounded-full border-2 border-transparent border-t-gold border-r-gold/40 animate-spin" />
        <p className="font-display text-2xl sm:text-3xl text-white">{label}</p>
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          Não feche esta tela
        </p>
      </div>
    </div>
  );
}

function UploadError({
  stage,
  onRetry,
  onRetake,
}: {
  stage: string | null;
  onRetry: () => void;
  onRetake: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[58] grid place-items-center bg-black/85 backdrop-blur-sm p-6">
      <div className="max-w-md w-full flex flex-col items-center gap-5 text-center">
        <div className="w-20 h-20 rounded-full bg-red-500/15 border-2 border-red-500/50 grid place-items-center">
          <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="#E0463A" strokeWidth="2.2">
            <path d="M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="font-display text-3xl sm:text-4xl text-white leading-tight">
          NÃO CONSEGUIMOS ENVIAR SUA FOTO
        </h2>
        <p className="text-white/75 text-sm sm:text-base">
          Sua foto continua neste dispositivo. Toque para tentar novamente.
        </p>
        {stage ? (
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">
            etapa: {stage}
          </p>
        ) : null}
        <div className="flex flex-col items-center gap-2 pt-2">
          <PrimaryCta onClick={onRetry}>Tentar novamente</PrimaryCta>
          <GhostBtn onClick={onRetake}>Tirar outra foto</GhostBtn>
        </div>
      </div>
    </div>
  );
}


/* ---------- Shared layout pieces ---------- */

function Screen({
  children,
  aurora = false,
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
      className="text-white/70 hover:text-white text-xs sm:text-sm uppercase tracking-[0.3em] py-2 px-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
  const activeFilms = useMemo(
    () => movies.filter((film) => film.active !== false),
    [movies],
  );
  const totalPages = Math.max(1, Math.ceil(activeFilms.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const visibleFilms = activeFilms.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );
  const visibleCount = visibleFilms.length;

  // Only correct the page if it falls out of range (no setState during render).
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  // ---- Adaptive film grid (measure real available area) ----
  // Posters use vertical aspect 2:3 (W:H). We try candidate (cols x rows)
  // layouts and pick the one that maximizes card width within the box.
  const POSTER_ASPECT = 2 / 3; // width / height
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const [gridBox, setGridBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const resizeCountRef = useRef(0);
  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = (w: number, h: number) => {
      setGridBox((prev) => {
        if (
          prev.w > 0 &&
          prev.h > 0 &&
          Math.abs(w - prev.w) <= 2 &&
          Math.abs(h - prev.h) <= 2
        ) {
          return prev;
        }
        resizeCountRef.current += 1;
        return { w, h };
      });
    };
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        apply(cr.width, cr.height);
      }
    });
    ro.observe(el);
    const onChange = () => {
      const r = el.getBoundingClientRect();
      apply(r.width, r.height);
    };
    window.addEventListener("orientationchange", onChange);
    window.addEventListener("fullscreenchange", onChange);
    if (document.fonts?.ready) document.fonts.ready.then(onChange).catch(() => {});
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", onChange);
      window.removeEventListener("fullscreenchange", onChange);
    };
  }, []);

  const layout = useMemo(() => {
    const count = Math.max(1, visibleCount);

    // Fallback dims until first measurement returns: assume portrait 2x2.
    const w = gridBox.w > 0 ? gridBox.w : 360;
    const h = gridBox.h > 0 ? gridBox.h : 560;
    const isPortrait = h >= w;

    // Candidate (cols, rows) per count.
    let candidates: Array<{ cols: number; rows: number }>;
    if (count === 1) candidates = [{ cols: 1, rows: 1 }];
    else if (count === 2) {
      candidates = isPortrait
        ? [{ cols: 2, rows: 1 }, { cols: 1, rows: 2 }]
        : [{ cols: 2, rows: 1 }];
    } else if (count === 3) {
      candidates = [{ cols: 2, rows: 2 }];
    } else {
      // 4: portrait → only 2x2; landscape → pick best of 2x2 / 4x1.
      candidates = isPortrait
        ? [{ cols: 2, rows: 2 }]
        : [{ cols: 4, rows: 1 }, { cols: 2, rows: 2 }];
    }

    const gap = Math.max(6, Math.min(20, Math.floor(Math.min(w, h) * 0.018)));

    let best = { cols: candidates[0].cols, rows: candidates[0].rows, cardW: 0, cardH: 0, gap };
    for (const c of candidates) {
      const cardW_byW = (w - gap * (c.cols - 1)) / c.cols;
      const cardH_byH = (h - gap * (c.rows - 1)) / c.rows;
      const cardW_byH = cardH_byH * POSTER_ASPECT;
      const cardW = Math.max(100, Math.floor(Math.min(cardW_byW, cardW_byH)));
      const cardH = Math.floor(cardW / POSTER_ASPECT);
      if (cardW > best.cardW) best = { cols: c.cols, rows: c.rows, cardW, cardH, gap };
    }
    return best;
  }, [gridBox.w, gridBox.h, visibleCount]);

  // Temporary diagnostic log — no PII.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const displayMode =
      document.documentElement.dataset.displayMode || "default";
    console.log("[PIPOCA_STATIC_FILM_GRID]", {
      display_mode: displayMode,
      portrait_mode: vh > vw,
      viewport_width: vw,
      viewport_height: vh,
      container_width: Math.round(gridBox.w),
      container_height: Math.round(gridBox.h),
      card_width: layout.cardW,
      card_height: layout.cardH,
      columns: layout.cols,
      rows: layout.rows,
      gap: layout.gap,
      resize_update_count: resizeCountRef.current,
      layout_stable: gridBox.w > 0 && gridBox.h > 0,
    });
  }, [gridBox.w, gridBox.h, visibleCount, layout]);

  return (
    <Screen aurora className="pipoca-film-choose-screen">
      <Header />

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
        <div ref={gridWrapRef} className="pipoca-film-grid-wrap mt-4 sm:mt-5 lg:mt-6">
          {loading ? (
            <p className="text-base text-white/70 tracking-wide animate-pulse-soft">
              Carregando filmes…
            </p>
          ) : error ? (
            <p className="text-base text-white/85 max-w-md">{error}</p>
          ) : activeFilms.length === 0 ? (
            <p className="text-base text-white/70">Nenhum filme disponível.</p>
          ) : (
            <div
              className="pipoca-film-grid"
              data-count={visibleCount}
              style={{
                gridTemplateColumns: `repeat(${layout.cols}, ${layout.cardW}px)`,
                gap: `${layout.gap}px`,
              }}
            >
              {visibleFilms.map((m, i) => {
                const isThirdOfThree = visibleCount === 3 && i === 2;
                return (
                  <div
                    key={m.id}
                    className="pipoca-film-card"
                    style={{
                      width: layout.cardW,
                      ...(isThirdOfThree
                        ? { gridColumn: "1 / -1", justifySelf: "center" }
                        : null),
                    }}
                  >
                    <PosterCard
                      movie={m}
                      onPick={onPick}
                      cardHeight={layout.cardH}
                    />
                  </div>
                );
              })}
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
              disabled={safePage === 0}
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
                    i === safePage ? "w-8 bg-gold" : "w-2 bg-white/25"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-white/60 tracking-wider ml-1">
              {safePage + 1} de {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
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
  cardHeight,
}: {
  movie: Movie;
  onPick: (m: Movie) => void;
  cardHeight?: number;
}) {
  return (
    <button
      onClick={() => onPick(movie)}
      className="bg-card text-left active:scale-[0.98] hover:scale-[1.02] transition-transform shadow-2xl group border border-white/10 pipoca-film-card-btn"
    >
      <div
        className="pipoca-film-cover-wrap"
        style={cardHeight ? { height: cardHeight } : undefined}
      >
        <img
          src={movie.posterUrl}
          alt={movie.title}
          className="pipoca-film-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 p-2 sm:p-3 z-10">
          <h3 className="font-display text-base sm:text-lg md:text-xl leading-tight text-white drop-shadow-lg">
            {movie.title}
          </h3>
        </div>
      </div>
    </button>
  );
}

/* ---------- Step 2: Stories (after film pick, prewarms camera) ---------- */

const STORY_DURATIONS_MS = [3000, 4500, 2000];

function Stories({
  movie,
  firstName,
  onDone,
  onChangeFilm,
}: {
  movie: Movie;
  firstName?: string;
  onDone: () => void;
  onChangeFilm: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [cameraStatus, setCameraStatus] = useState(getSharedStatus());
  const advanceLockRef = useRef(false);

  useEffect(() => {
    const unsub = subscribeSharedCamera(() => setCameraStatus(getSharedStatus()));
    return unsub;
  }, []);

  // Reset advance lock + progress whenever the story index changes.
  useEffect(() => {
    advanceLockRef.current = false;
    setProgress(0);
    const duration = STORY_DURATIONS_MS[idx];
    if (duration === undefined) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const pct = Math.min(1, (now - start) / duration);
      setProgress(pct);
      if (pct < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const t = window.setTimeout(() => advance(), duration);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  function advance() {
    if (advanceLockRef.current) return;
    advanceLockRef.current = true;
    if (idx >= STORY_DURATIONS_MS.length - 1) {
      onDone();
    } else {
      setIdx((i) => i + 1);
    }
  }

  return (
    <Screen aurora>
      {/* Progress bars */}
      <div className="relative z-20 w-full max-w-2xl flex gap-1.5 px-1">
        {STORY_DURATIONS_MS.map((_, i) => {
          const pct = i < idx ? 1 : i === idx ? progress : 0;
          return (
            <div
              key={i}
              className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden"
            >
              <div
                className="h-full bg-gold transition-[width] duration-75 ease-linear"
                style={{ width: `${pct * 100}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Tap-to-advance area */}
      <button
        type="button"
        onClick={advance}
        aria-label="Próximo"
        className="absolute inset-0 z-10 cursor-pointer"
      />

      <div className="relative z-20 flex-1 min-h-0 w-full flex flex-col items-center justify-center max-w-2xl py-3 pointer-events-none">
        {idx === 0 && <StoryFilm movie={movie} firstName={firstName} />}
        {idx === 1 && <StoryTwoPhotos firstName={firstName} />}
        {idx === 2 && <StoryPrepare cameraStatus={cameraStatus} firstName={firstName} />}
      </div>

      <div className="relative z-30 shrink-0">
        {idx === 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeFilm();
            }}
            className="text-xs uppercase tracking-[0.3em] text-white/65 hover:text-white underline underline-offset-4 py-2 px-3"
          >
            Trocar filme
          </button>
        ) : (
          <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">
            toque para avançar
          </span>
        )}
      </div>
    </Screen>
  );
}

function StoryFilm({ movie, firstName }: { movie: Movie; firstName?: string }) {
  const prefix = firstName ? `${firstName.toUpperCase()}, você escolheu` : "Você escolheu";
  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4 animate-fade-up w-full">
      <span className="text-[10px] sm:text-xs uppercase tracking-[0.35em] text-gold">
        {prefix}
      </span>
      <div className="relative w-[78vw] max-w-[360px] sm:max-w-[420px] aspect-[3/4] rounded-2xl overflow-hidden border border-white/15 shadow-[0_30px_80px_-10px_rgba(0,0,0,0.7)]">
        <img
          src={movie.posterUrl}
          alt={movie.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/95 via-black/55 to-transparent pointer-events-none" />
        <div className="absolute top-3 left-3">
          <span className="inline-block bg-gold text-cinema text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 rounded">
            Tela Brasil
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <h1 className="font-display text-3xl sm:text-4xl text-white leading-[0.95]">
            {movie.title}
          </h1>
        </div>
      </div>
    </div>
  );
}

function StoryTwoPhotos({ firstName }: { firstName?: string }) {
  return (
    <div className="flex flex-col items-center gap-6 sm:gap-7 animate-fade-up max-w-md">
      <h1 className="font-display text-3xl sm:text-5xl text-white leading-[0.95]">
        {firstName ? `${firstName}, vamos` : "Vamos"} tirar <span className="text-gold">duas fotos</span>
      </h1>
      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="flex flex-col items-center gap-2 rounded-xl border border-white/15 bg-white/5 p-4">
          <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="#F8BA32" strokeWidth="1.8">
            <circle cx="12" cy="9" r="3.5" />
            <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" strokeLinecap="round" />
          </svg>
          <p className="text-xs sm:text-sm text-white/85 leading-snug">
            Uma foto <span className="text-gold">de perto</span> para reconhecer seu rosto
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 rounded-xl border border-white/15 bg-white/5 p-4">
          <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="#2E5BE5" strokeWidth="1.8">
            <circle cx="12" cy="6" r="2.5" />
            <path d="M8 22v-7l-2-4h12l-2 4v7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-xs sm:text-sm text-white/85 leading-snug">
            Uma foto <span className="text-gold">mais distante</span> para registrar sua postura
          </p>
        </div>
      </div>
    </div>
  );
}

function StoryPrepare({ cameraStatus, firstName }: { cameraStatus: ReturnType<typeof getSharedStatus>; firstName?: string }) {
  const camHint =
    cameraStatus === "ready"
      ? "Câmera pronta"
      : cameraStatus === "denied"
        ? "Autorize a câmera no navegador"
        : "Ativando câmera...";
  return (
    <div className="flex flex-col items-center gap-5 animate-fade-up">
      <div className="w-24 h-24 rounded-full border-2 border-gold/60 grid place-items-center animate-badge-in">
        <svg viewBox="0 0 24 24" className="w-12 h-12" fill="none" stroke="#F8BA32" strokeWidth="1.8">
          <rect x="3" y="7" width="14" height="11" rx="2" />
          <path d="M21 9l-4 3 4 3V9z" />
        </svg>
      </div>
      <h1 className="font-display text-4xl sm:text-6xl text-white leading-[0.95]">
        {firstName ? `${firstName}, ` : ""}<span className="text-gold">prepare-se</span>
      </h1>
      <p className="text-sm sm:text-base text-white/75 max-w-sm">
        A câmera será aberta agora.
      </p>
      <span className="text-[10px] uppercase tracking-[0.3em] text-white/50">
        {camHint}
      </span>
    </div>
  );
}


/* ---------- Step 2b: Orient appearance (between identity and appearance captures) ---------- */

function OrientAppearance({
  onNext,
}: {
  onNext: () => void;
}) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    const t = window.setTimeout(() => {
      firedRef.current = true;
      onNext();
    }, 2000);
    return () => window.clearTimeout(t);
  }, [onNext]);

  return (
    <Screen aurora>
      <Header subtitle="Segunda foto" />
      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-2xl py-3 gap-5 sm:gap-6">
        <div
          className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full border-2 border-gold/60 grid place-items-center"
          style={{ animation: "step-back-pulse 1.4s ease-in-out infinite" }}
        >
          <svg viewBox="0 0 24 24" className="w-14 h-14 sm:w-20 sm:h-20" fill="none" stroke="#F8BA32" strokeWidth="2">
            <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl text-white leading-[0.95] animate-fade-up text-center">
          Agora, <span className="text-gold">dê um passo para trás</span>
        </h1>
        <p className="text-base sm:text-lg text-white/80 max-w-md animate-fade-up text-center">
          Vamos registrar seu corpo da cintura para cima.
        </p>
      </div>
      <div className="relative z-10 shrink-0">
        <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">
          Preparando câmera…
        </p>
      </div>
      <style>{`
        @keyframes step-back-pulse {
          0%, 100% { transform: translateY(0) scale(1); box-shadow: 0 0 0 0 rgba(248,186,50,0.6); }
          50% { transform: translateY(-14px) scale(1.06); box-shadow: 0 14px 36px 0 rgba(248,186,50,0.15); }
        }
      `}</style>
    </Screen>
  );
}

/* ---------- Step 3 / 5: Camera (variant-aware) ---------- */

function Camera({
  variant,
  onCaptured,
  onBack,
}: {
  variant: CameraVariant;
  onCaptured: (p: { blob: Blob; url: string }) => void;
  onBack: () => void;
}) {
  const { videoRef, ready, errorKind, retry, capture } = useCamera(true);
  const [count, setCount] = useState<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (ready && count === null && !startedRef.current) {
      console.log(`${UX} contagem iniciada`, { variant });
      setCount(COUNTDOWN_SECONDS);
    }
  }, [ready, count, variant]);

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

  const title =
    variant === "identity" ? "OLHE PARA A CÂMERA" : "DÊ UM PASSO PARA TRÁS";
  const hint =
    variant === "identity"
      ? "APROXIME-SE ATÉ APARECER O ROSTO, O CABELO E OS OMBROS"
      : "APAREÇA DA CABEÇA ATÉ A CINTURA";
  const subtitle = variant === "identity" ? "FOTO 1 DE 2" : "FOTO 2 DE 2";
  const countingDown = count !== null && count > 0;

  return (
    <Screen>
      <Header subtitle={subtitle} />

      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-3xl py-3 gap-3 sm:gap-4">
        <h1
          className="font-display text-white animate-fade-up"
          style={{
            fontSize: "clamp(36px, 6vw, 96px)",
            fontWeight: 900,
            lineHeight: 1,
            textAlign: "center",
            maxWidth: "94vw",
          }}
        >
          {title}
        </h1>
        <p
          className="text-white/80"
          style={{
            fontSize: "clamp(18px, 2.4vw, 40px)",
            fontWeight: 700,
            lineHeight: 1.15,
            textAlign: "center",
            maxWidth: "92vw",
          }}
        >
          {hint}
        </p>
        {countingDown ? (
          <p
            className="text-gold font-display animate-pulse-soft"
            style={{
              fontSize: "clamp(16px, 2vw, 28px)",
              letterSpacing: "0.2em",
            }}
          >
            FIQUE PARADO
          </p>
        ) : null}

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

          {countingDown ? (
            <div className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-[1px]">
              <span
                key={count}
                className="font-display text-white animate-pop-in"
                style={{
                  fontSize: "clamp(120px, 16vw, 280px)",
                  fontWeight: 900,
                  lineHeight: 0.8,
                  textShadow: "0 6px 30px rgba(0,0,0,0.6)",
                }}
              >
                {count}
              </span>
            </div>
          ) : null}
          {count === 0 ? (
            <div className="absolute inset-0 bg-white animate-fade-in" />
          ) : null}
        </div>

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
    <Screen aurora>
{/* error variant */}
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
  identityUrl,
  appearanceUrl,
  onRetake,
  onUse,
}: {
  identityUrl: string;
  appearanceUrl: string;
  onRetake: () => void;
  onUse: () => void;
}) {
  const [remaining, setRemaining] = useState(5);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (remaining <= 0) {
      firedRef.current = true;
      onUse();
      return;
    }
    const t = window.setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => window.clearTimeout(t);
  }, [remaining, onUse]);

  return (
    <Screen aurora>
      <Header subtitle="Pré-visualização" />

      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-3xl py-3 gap-3 sm:gap-4">
        <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl text-white leading-[0.95] animate-fade-up">
          Confira suas <span className="text-gold">fotos</span>
        </h1>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-[520px]">
          <div className="flex flex-col items-center gap-1.5 animate-pop-in">
            <div className="bg-card w-full aspect-[4/5] overflow-hidden shadow-2xl rounded-xl border border-white/10">
              <img
                src={identityUrl}
                alt="Foto de rosto"
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
            </div>
            <span className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-gold">
              Foto de rosto
            </span>
          </div>
          <div className="flex flex-col items-center gap-1.5 animate-pop-in">
            <div className="bg-card w-full aspect-[4/5] overflow-hidden shadow-2xl rounded-xl border border-white/10">
              <img
                src={appearanceUrl}
                alt="Foto de corpo"
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
            </div>
            <span className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-gold">
              Foto de corpo
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 pt-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border-2 border-gold grid place-items-center">
              <span className="font-display text-2xl text-gold leading-none">
                {Math.max(remaining, 0)}
              </span>
            </div>
            <p className="text-sm sm:text-base text-white/80 max-w-[18rem] text-left">
              Se estiver tudo certo, vamos continuar automaticamente.
            </p>
          </div>
        </div>
      </div>

      <div className="relative z-10 shrink-0">
        <button
          type="button"
          onClick={() => {
            firedRef.current = true;
            onRetake();
          }}
          className="text-xs uppercase tracking-[0.3em] text-white/55 hover:text-white/85 underline underline-offset-4 py-2 px-3"
        >
          Tirar fotos novamente
        </button>
      </div>
    </Screen>
  );
}


/* ---------- Step 5: Processing ---------- */

type StatusFn = (args: { data: { generationId: string } }) => Promise<
  | { status: "queued" | "processing" }
  | { status: "failed"; error: string }
  | {
      status: "completed";
      generationId: string;
      imageUrl: string;
      publicToken: string;
      resultPageUrl: string;
    }
>;

function Processing({
  movie,
  firstName,
  generationId,
  errored,
  pollFn,
  onDone,
  onError,
}: {
  movie: Movie;
  firstName?: string;
  generationId: string | null;
  errored: boolean;
  pollFn: StatusFn;
  onDone: (imageUrl: string, publicToken: string, resultPageUrl: string) => void;
  onError: (msg: string) => void;
}) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [iconIdx, setIconIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIdx((i) => (i + 1) % LOADING_PHRASES.length);
    }, 1600);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setIconIdx((i) => (i + 1) % CINEMA_ICONS.length);
    }, 1400);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!generationId || errored) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        console.log(`${GEN_LOG} polling`, { generationId });
        const res = await pollFn({ data: { generationId } });
        if (cancelled) return;
        if (res.status === "completed") {
          console.log(`${GEN_LOG} concluída`);
          onDone(res.imageUrl, res.publicToken, res.resultPageUrl);
          return;
        }
        if (res.status === "failed") {
          console.warn(`${GEN_LOG} falhou`);
          onError(res.error || "Falha na geração");
          return;
        }
        timer = setTimeout(tick, 2500);
      } catch (e) {
        if (cancelled) return;
        console.warn(`${GEN_LOG} erro ao consultar`, e);
        timer = setTimeout(tick, 4000);
      }
    };
    timer = setTimeout(tick, 1500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [generationId, errored, pollFn, onDone, onError]);

  return (
    <Screen aurora>
      <Header subtitle="Criando sua cena" />

      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-6 sm:gap-8 max-w-xl">
        <div className="w-28 h-28 sm:w-36 sm:h-36 lg:w-44 lg:h-44 rounded-full border border-gold/20 grid place-items-center relative animate-badge-in">
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gold animate-spin [animation-duration:1.8s]" />
          <div className="absolute inset-2 rounded-full border border-transparent border-t-brand-blue animate-spin [animation-duration:2.6s] [animation-direction:reverse]" />
          {/* Orbiting dots around the ring */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 -ml-1 -mt-1 w-2 h-2 rounded-full bg-gold/80"
              style={{
                ["--r" as string]: `${i * 60}deg`,
                animation: `orbit-pulse 1.6s ease-in-out ${i * 0.18}s infinite`,
              } as React.CSSProperties}
            />
          ))}
          {/* Rotating cinema icon */}
          <div className="relative w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 grid place-items-center">
            {CINEMA_ICONS.map((Icon, i) => (
              <div
                key={i}
                className={`absolute inset-0 grid place-items-center text-gold transition-all duration-500 ${
                  i === iconIdx
                    ? "opacity-100 scale-100 rotate-0"
                    : "opacity-0 scale-50 -rotate-12"
                }`}
              >
                <Icon />
              </div>
            ))}
          </div>
        </div>



        <div className="space-y-2">
          <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl text-white leading-none">
            {firstName ? `${firstName}, aguarde...` : <>Luzes, câmera, <span className="text-gold">ação</span>...</>}
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


/* ---------- Step 6: Result (photo first, QR on demand) ---------- */

function Result({
  movie,
  firstName,
  imageUrl,
  publicToken,
  resultPageUrl,
  onRestart,
}: {
  movie: Movie;
  firstName?: string;
  imageUrl: string | null;
  publicToken: string | null;
  resultPageUrl: string | null;
  onRestart: () => void;
}) {
  const SLIDE_0_MS = 10000;
  const SLIDE_1_MS = 20000;
  const [slide, setSlide] = useState(0);
  const [progress, setProgress] = useState(0);

  const tokenReady = Boolean(
    publicToken &&
      publicToken !== "undefined" &&
      publicToken !== "null" &&
      resultPageUrl &&
      /^https:\/\//i.test(resultPageUrl),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    let hostname = "";
    let pathname = "";
    try {
      if (resultPageUrl) {
        const u = new URL(resultPageUrl);
        hostname = u.hostname;
        pathname = u.pathname;
      }
    } catch {/* noop */}
    console.log("[PIPOCA_QR_DEBUG]", {
      publicTokenAvailable: Boolean(publicToken),
      resultUrl: resultPageUrl,
      hostname,
      pathname,
      qrRendered: tokenReady && slide === 1,
    });
  }, [publicToken, resultPageUrl, tokenReady, slide]);

  // Auto-advance slide 0 -> slide 1 over 10s with progress bar,
  // then return to the start after 30s total on the result screen.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let advanceTimer: number | undefined;
    let restartTimer: number | undefined;

    if (slide === 0) {
      setProgress(0);
      const start = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const pct = Math.min(1, (now - start) / SLIDE_0_MS);
        setProgress(pct);
        if (pct < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      advanceTimer = window.setTimeout(() => setSlide(1), SLIDE_0_MS);
      return () => {
        window.clearTimeout(advanceTimer);
        cancelAnimationFrame(raf);
      };
    }

    if (slide === 1) {
      setProgress(1);
      restartTimer = window.setTimeout(() => {
        console.log("[PIPOCA_RESULT] tempo esgotado (30s), reiniciando fluxo");
        onRestart();
      }, SLIDE_1_MS);
      return () => {
        window.clearTimeout(restartTimer);
      };
    }
  }, [slide, onRestart]);

  const bgUrl = imageUrl ?? movie.posterUrl;

  return (
    <Screen aurora>
      {/* Blurred backdrop of the generated photo */}
      {bgUrl && (
        <div
          aria-hidden
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(40px) brightness(0.45)",
            transform: "scale(1.15)",
          }}
        />
      )}
      <div aria-hidden className="absolute inset-0 z-0 bg-black/55 pointer-events-none" />

      {/* Progress bars */}
      <div className="relative z-20 w-full max-w-2xl flex gap-1.5 px-1 pt-1">
        {[0, 1].map((i) => {
          const pct = i < slide ? 1 : i === slide ? progress : 0;
          return (
            <div key={i} className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full bg-gold transition-[width] duration-75 ease-linear"
                style={{ width: `${pct * 100}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="relative z-20 flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-3xl py-2 gap-3 sm:gap-4 pointer-events-none">
        {slide === 0 && (
          <div className="flex flex-col items-center gap-3 sm:gap-4 w-full h-full animate-fade-up">
            <h1 className="font-display text-2xl sm:text-4xl lg:text-5xl text-white leading-[0.95]">
              {firstName ? `${firstName}, sua ` : "Sua "}<span className="text-gold">cena</span> está pronta
            </h1>

            <div className="relative w-full flex-1 min-h-0 max-w-[560px] mx-auto flex items-center justify-center">
              <img
                src={imageUrl ?? movie.posterUrl}
                alt="Cena gerada"
                className="max-w-full max-h-full object-contain rounded-2xl border border-white/10 shadow-[0_30px_80px_-10px_rgba(0,0,0,0.7)]"
              />
            </div>

            <span className="text-[10px] uppercase tracking-[0.3em] text-white/60">
              Inspirado em {movie.title}
            </span>
          </div>
        )}

        {slide === 1 && (
          <div className="flex flex-col items-center gap-4 sm:gap-5 w-full animate-fade-up">
            <h1 className="font-display text-2xl sm:text-4xl lg:text-5xl text-white leading-[0.95] text-center">
              SUA FOTO JÁ FOI ENVIADA PARA <span className="text-gold">IMPRESSÃO</span>
            </h1>
            <p className="text-sm sm:text-base text-white/80 text-center">
              Dirija-se ao balcão para retirar sua foto.
            </p>

            <div className="flex flex-col items-center gap-3 bg-white/5 border border-white/15 rounded-xl p-4 sm:p-5 w-full max-w-md">
              <div className="bg-white p-3 rounded-lg grid place-items-center">
                {tokenReady && resultPageUrl ? (
                  <QRCodeSVG
                    value={resultPageUrl}
                    size={280}
                    level="M"
                    marginSize={4}
                    bgColor="#FFFFFF"
                    fgColor="#000000"
                  />
                ) : (
                  <div
                    className="grid place-items-center text-[#000C20] font-display uppercase tracking-wider text-center px-4"
                    style={{ width: 280, height: 280 }}
                  >
                    PREPARANDO SEU QR CODE...
                  </div>
                )}
              </div>
              <p className="text-sm sm:text-base text-white/85 leading-snug text-center uppercase tracking-wider font-semibold">
                Aponte a câmera do celular para baixar sua foto
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="relative z-30 shrink-0 pointer-events-auto">
        {slide === 1 ? (
          <GhostBtn onClick={onRestart}>Nova experiência</GhostBtn>
        ) : null}
      </div>
    </Screen>
  );
}

/* ---------- Visitor registration ---------- */

function VisitorRegistration({
  createVisitorFn,
  onDone,
  onBack,
}: {
  createVisitorFn: (args: { data: { fullName: string; whatsapp: string; experienceConsent: true; privacyNoticeVersion: string } }) => Promise<{ visitorId: string; firstName: string }>;
  onDone: (id: string, firstName: string) => void;
  onBack: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [showNotice, setShowNotice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOk = fullName.replace(/\s+/g, " ").trim().length >= 2 && !/^\d+$/.test(fullName.trim());
  const phoneOk = isValidBrWhatsapp(whatsapp);
  const canSubmit = nameOk && phoneOk && !loading;

  async function submit() {
    if (!canSubmit) return;
    console.log("[PIPOCA_CONSENT]", {
      consentClicked: true,
      acceptedAtAvailable: true,
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      visitorCreationStarted: true,
    });
    setLoading(true);
    setError(null);
    try {
      const res = await createVisitorFn({
        data: {
          fullName: fullName.replace(/\s+/g, " ").trim(),
          whatsapp,
          experienceConsent: true,
          privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
        },
      });
      if (!res?.visitorId || !res?.firstName) {
        throw new Error("Resposta inválida do servidor");
      }
      console.log("[PIPOCA_CONSENT]", {
        visitorCreationCompleted: true,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      });
      onDone(res.visitorId, res.firstName);
    } catch (e) {
      console.warn("[PIPOCA_CONSENT]", {
        visitorCreationCompleted: false,
        errorCode: e instanceof Error ? e.message.slice(0, 80) : "unknown",
      });
      setError(e instanceof Error ? e.message : "Falha ao cadastrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen aurora>
      <Header />
      <div className="relative z-10 flex-1 min-h-0 w-full max-w-md mx-auto flex flex-col items-stretch justify-center gap-4 py-3">
        <h1 className="font-display text-3xl sm:text-4xl text-white text-center leading-[0.95]">
          Antes de entrar em <span className="text-gold">cena</span>
        </h1>
        <label className="flex flex-col gap-1 text-left">
          <span className="text-xs uppercase tracking-[0.25em] text-white/70">Nome</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nome completo"
            maxLength={120}
            disabled={loading}
            className="bg-black/40 border border-white/25 rounded-md px-3 py-3 text-base disabled:opacity-60"
          />
        </label>
        <label className="flex flex-col gap-1 text-left">
          <span className="text-xs uppercase tracking-[0.25em] text-white/70">WhatsApp</span>
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(formatWhatsappMask(e.target.value))}
            placeholder="(00) 00000-0000"
            inputMode="numeric"
            disabled={loading}
            className="bg-black/40 border border-white/25 rounded-md px-3 py-3 text-base disabled:opacity-60"
          />
        </label>
        <p className="text-left text-sm text-white/85 leading-snug">
          Li o{" "}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowNotice(true);
            }}
            className="text-gold underline underline-offset-2 hover:text-gold/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-gold rounded-sm"
          >
            Aviso de Privacidade
          </button>{" "}
          e autorizo o tratamento do meu nome, WhatsApp e imagens para criar, disponibilizar e produzir minha foto personalizada.
        </p>
        {error && (
          <div className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-center">
            <p className="text-sm font-semibold text-red-200 uppercase tracking-wide">
              Não conseguimos registrar seus dados
            </p>
            <p className="text-xs text-red-200/80 mt-1">
              Seu nome e WhatsApp continuam preenchidos. Tente novamente.
            </p>
            <p className="text-[10px] text-red-200/50 mt-2 break-words">{error}</p>
          </div>
        )}
        <div className="flex flex-col items-center gap-2 pt-2">
          <PrimaryCta onClick={submit} disabled={!canSubmit}>
            {loading ? "Cadastrando…" : error ? "Tentar novamente" : "Li e autorizo. Continuar"}
          </PrimaryCta>
          <GhostBtn onClick={onBack} disabled={loading}>Voltar</GhostBtn>
        </div>
      </div>

      {showNotice && (
        <div
          className="fixed inset-0 z-[70] bg-black/85 grid place-items-center px-5"
          onClick={() => setShowNotice(false)}
        >
          <div
            className="bg-[#0A1730] border border-white/15 rounded-2xl p-6 max-w-md w-full max-h-[80dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-2xl text-gold">{PRIVACY_NOTICE_TITLE}</h2>
            <div className="mt-3 space-y-3 text-sm text-white/85">
              {PRIVACY_NOTICE_PARAGRAPHS.map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <button
              type="button"
              onClick={() => setShowNotice(false)}
              className="mt-5 text-xs uppercase tracking-[0.3em] text-white/70 underline underline-offset-4 hover:text-white"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </Screen>
  );
}

