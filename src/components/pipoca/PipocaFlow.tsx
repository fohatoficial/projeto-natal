import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PipocaImage } from "@/components/pipoca/PipocaImage";
import {
  useFaceGuidance,
  FACE_GUIDE_STABLE_MS,
  type Guidance,
} from "@/lib/pipoca/faceGuidance";
import {
  buildPublicResultUrl,
  isValidPublicToken,
  isValidResultPageUrl,
  prefetchImage,
} from "@/lib/pipoca/publicResultUrl";



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
const BUILD_ID = "pipoca-flow-2026-06-16-face-guide-qr-1";
if (typeof window !== "undefined") {
  (window as unknown as { __PIPOCA_BUILD_TOKEN?: string }).__PIPOCA_BUILD_TOKEN = BUILD_ID;
}

function useViewportHeightVar(stepName: string) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    console.log(`[PIPOCA_BUILD] ${BUILD_ID}`);
    let logged = false;
    const apply = () => {
      const vv = window.visualViewport;
      const h = Math.round(vv?.height ?? window.innerHeight);
      const w = Math.round(vv?.width ?? window.innerWidth);
      document.documentElement.style.setProperty("--pipoca-app-height", `${h}px`);
      if (!logged) {
        logged = true;
        const orient =
          (screen.orientation && screen.orientation.type) ||
          (h >= w ? "portrait" : "landscape");
        console.log(
          `[PIPOCA_VIEWPORT_DEBUG] inner=${window.innerWidth}x${window.innerHeight} ` +
            `client=${document.documentElement.clientWidth}x${document.documentElement.clientHeight} ` +
            `vv=${w}x${h} dpr=${window.devicePixelRatio} orient=${orient} step=${stepName}`,
        );
      }
    };
    apply();
    const onResize = () => apply();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
    document.addEventListener("fullscreenchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
      document.removeEventListener("fullscreenchange", onResize);
    };
  }, [stepName]);
}

function DebugViewportPanel({ step }: { step: string }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tick = () => force((n) => n + 1);
    window.addEventListener("resize", tick);
    window.addEventListener("orientationchange", tick);
    window.visualViewport?.addEventListener("resize", tick);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.removeEventListener("resize", tick);
      window.removeEventListener("orientationchange", tick);
      window.visualViewport?.removeEventListener("resize", tick);
      window.clearInterval(id);
    };
  }, []);
  if (typeof window === "undefined") return null;
  const vv = window.visualViewport;
  const cssH = getComputedStyle(document.documentElement).getPropertyValue("--pipoca-app-height").trim() || "—";
  const zoom = vv ? Math.round((window.innerWidth / vv.width) * 100) / 100 : 1;
  const ua = navigator.userAgent.length > 80 ? navigator.userAgent.slice(0, 80) + "…" : navigator.userAgent;
  const rows: Array<[string, string | number]> = [
    ["step", step],
    ["window.inner", `${window.innerWidth} × ${window.innerHeight}`],
    ["doc.client", `${document.documentElement.clientWidth} × ${document.documentElement.clientHeight}`],
    ["visualViewport", vv ? `${Math.round(vv.width)} × ${Math.round(vv.height)}` : "n/a"],
    ["--pipoca-app-height", cssH],
    ["dpr", window.devicePixelRatio],
    ["orientation", (screen.orientation && screen.orientation.type) || "—"],
    ["zoom est.", zoom],
    ["UA", ua],
  ];
  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        right: 8,
        zIndex: 99999,
        background: "rgba(0,0,0,0.82)",
        color: "#7CFC9B",
        font: "11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid #1f8a4d",
        maxWidth: 360,
        pointerEvents: "none",
      }}
    >
      <div style={{ color: "#F8BA32", marginBottom: 4 }}>PIPOCA viewport debug</div>
      {rows.map(([k, v]) => (
        <div key={k}>
          <span style={{ color: "#9aa" }}>{k}:</span> {String(v)}
        </div>
      ))}
    </div>
  );
}

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
  useViewportHeightVar(step);
  useEffect(() => {
    return () => {
      if (identityRef.current) URL.revokeObjectURL(identityRef.current.url);
      if (appearanceRef.current) URL.revokeObjectURL(appearanceRef.current.url);
      // Encerra a câmera ao desmontar o fluxo principal.
      releaseSharedCamera();
    };
  }, []);

  const debugViewport =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debugViewport") === "1";

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
        setGenError("Não conseguimos iniciar sua cena.");
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
      {debugViewport && <DebugViewportPanel step={step} />}
      {step === "choose" && (
        <Choose
          movies={films}
          loading={loading}
          error={error}
          onPick={(m) => {
            console.log(`${UX} filme selecionado`, { id: m.id, title: m.title });
            // Prefetch poster immediately so the Story can render without delay.
            prefetchImage(m.posterUrl);
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
  onRetry,
  onRestart,
}: {
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
          Tivemos um problema ao gerar sua imagem. Você pode tentar novamente.
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
      className={`pipoca-stage-dvh relative film-grain vignette flex flex-col items-center px-4 sm:px-6 lg:px-10 pt-5 pb-4 sm:pt-7 sm:pb-5 lg:pt-8 lg:pb-6 text-center box-border ${
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
      className="bg-card relative overflow-hidden text-left active:scale-[0.98] hover:scale-[1.02] transition-transform shadow-2xl w-full h-full group rounded-2xl border border-white/10"
    >
      <PipocaImage
        src={movie.posterUrl}
        alt={movie.title}
        fit="cover"
        eager
        logTag={`poster:${movie.id}`}
        className="transition-transform duration-700 group-hover:scale-110"
      />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/95 via-black/55 to-transparent pointer-events-none" />
      <div className="absolute top-3 left-4 z-10">
        <span className="inline-block bg-gold text-cinema text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 rounded">
          Tela Brasil
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 z-10">
        <h3 className="font-display text-xl sm:text-2xl md:text-3xl leading-tight text-white">
          {movie.title}
        </h3>
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

  // Poster state: the first story can NOT start its timer until the poster
  // is fully decoded and visible. Without this gate the slide auto-advances
  // before the visitor sees the film they picked.
  type PosterState = "pending" | "loading" | "ready" | "error";
  const [posterState, setPosterState] = useState<PosterState>("pending");
  const [posterAttempt, setPosterAttempt] = useState(0);

  useEffect(() => {
    const unsub = subscribeSharedCamera(() => setCameraStatus(getSharedStatus()));
    return unsub;
  }, []);

  // Decode poster off-DOM so we know the exact moment it's visually ready.
  useEffect(() => {
    if (!movie.posterUrl) {
      setPosterState("error");
      return;
    }
    let cancelled = false;
    setPosterState("loading");
    console.log("[PIPOCA_STORY_POSTER] loading", { attempt: posterAttempt });
    const img = new Image();
    img.decoding = "async";
    img.src =
      posterAttempt === 0
        ? movie.posterUrl
        : `${movie.posterUrl}${movie.posterUrl.includes("?") ? "&" : "?"}__cb=${BUILD_ID}-${posterAttempt}`;
    const done = () => {
      if (cancelled) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        console.log("[PIPOCA_STORY_POSTER] ready", `${img.naturalWidth}x${img.naturalHeight}`);
        setPosterState("ready");
      } else {
        console.warn("[PIPOCA_STORY_POSTER] empty-natural");
        setPosterState("error");
      }
    };
    img.onload = done;
    img.onerror = () => {
      if (cancelled) return;
      console.warn("[PIPOCA_STORY_POSTER] error");
      setPosterState("error");
    };
    if (typeof img.decode === "function") {
      img.decode().then(done).catch(() => {
        if (cancelled) return;
        console.warn("[PIPOCA_STORY_POSTER] decode-failed");
        // onload may still fire — keep loading state.
      });
    }
    return () => {
      cancelled = true;
    };
  }, [movie.posterUrl, posterAttempt]);

  // Reset advance lock + progress whenever the story index changes.
  useEffect(() => {
    advanceLockRef.current = false;
    setProgress(0);

    // Slide 0 (film poster): wait until the poster is decoded + a small
    // settle window so the visitor actually sees it before the bar moves.
    if (idx === 0 && posterState !== "ready") return;

    const baseDuration = STORY_DURATIONS_MS[idx];
    if (baseDuration === undefined) return;
    const startDelay = idx === 0 ? 400 : 0;

    let raf = 0;
    let timeoutId = 0;
    const begin = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const pct = Math.min(1, (now - start) / baseDuration);
        setProgress(pct);
        if (pct < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      timeoutId = window.setTimeout(() => advance(), baseDuration);
    };
    const startId = window.setTimeout(begin, startDelay);
    return () => {
      window.clearTimeout(startId);
      window.clearTimeout(timeoutId);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, posterState]);

  function advance() {
    if (advanceLockRef.current) return;
    // Tap-to-advance during slide 0 is allowed even if the poster errored,
    // so the visitor isn't stuck. Auto-advance never fires on error.
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
        {idx === 0 && (
          <StoryFilm
            movie={movie}
            firstName={firstName}
            posterState={posterState}
            onRetryPoster={() => setPosterAttempt((n) => n + 1)}
          />
        )}
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

function StoryFilm({
  movie,
  firstName,
  posterState,
  onRetryPoster,
}: {
  movie: Movie;
  firstName?: string;
  posterState: "pending" | "loading" | "ready" | "error";
  onRetryPoster: () => void;
}) {
  const prefix = firstName ? `${firstName.toUpperCase()}, você escolheu` : "Você escolheu";
  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4 animate-fade-up w-full">
      <span className="text-[10px] sm:text-xs uppercase tracking-[0.35em] text-gold">
        {prefix}
      </span>
      <div className="relative w-[78vw] max-w-[360px] sm:max-w-[420px] pipoca-kiosk-poster aspect-[3/4] rounded-2xl overflow-hidden border border-white/15 shadow-[0_30px_80px_-10px_rgba(0,0,0,0.7)] bg-black/30">
        {posterState === "ready" && (
          <PipocaImage
            src={movie.posterUrl}
            alt={movie.title}
            fit="cover"
            eager
            logTag={`story-poster:${movie.id}`}
          />
        )}
        {(posterState === "pending" || posterState === "loading") && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-gold border-r-gold/40 animate-spin" />
          </div>
        )}
        {posterState === "error" && (
          <div className="absolute inset-0 grid place-items-center text-center p-5 pointer-events-auto">
            <div className="flex flex-col items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.25em] text-white/60">{movie.title}</span>
              <p className="font-display text-base text-white">NÃO CARREGOU O CARTAZ</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetryPoster();
                }}
                className="mt-1 text-[11px] uppercase tracking-[0.25em] text-gold border border-gold/60 rounded-md px-3 py-1.5"
              >
                TENTAR NOVAMENTE
              </button>
            </div>
          </div>
        )}
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
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 border-gold/60 grid place-items-center animate-badge-in">
          <svg viewBox="0 0 24 24" className="w-10 h-10 sm:w-12 sm:h-12" fill="none" stroke="#F8BA32" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl text-white leading-[0.95] animate-fade-up">
          Agora, <span className="text-gold">dê um passo para trás</span>
        </h1>
        <p className="text-base sm:text-lg text-white/80 max-w-md animate-fade-up">
          Vamos registrar seu corpo da cintura para cima.
        </p>
      </div>
      <div className="relative z-10 shrink-0">
        <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">
          Preparando câmera…
        </p>
      </div>
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
  // Identity variant uses face-guided countdown. Appearance variant keeps
  // the simple ready-then-count flow that already works well for body shots.
  const isIdentity = variant === "identity";
  const guidance: Guidance = useFaceGuidance(videoRef, isIdentity && ready);
  const [count, setCount] = useState<number | null>(null);
  const startedRef = useRef(false);
  const [manualStart, setManualStart] = useState(false);

  // Appearance: start countdown as soon as camera is ready (legacy behaviour).
  useEffect(() => {
    if (isIdentity) return;
    if (ready && count === null && !startedRef.current) {
      console.log(`${UX} contagem iniciada`, { variant });
      setCount(COUNTDOWN_SECONDS);
    }
  }, [ready, count, variant, isIdentity]);

  // Identity: start when guidance has been "perfect" long enough, OR when
  // the user taps the manual fallback (detector unavailable / never settles).
  useEffect(() => {
    if (!isIdentity) return;
    if (!ready || count !== null || startedRef.current) return;
    const canManual = manualStart || guidance.kind === "unavailable";
    const guidedOk =
      guidance.kind === "perfect" && guidance.stableMs >= FACE_GUIDE_STABLE_MS;
    if (canManual || guidedOk) {
      console.log(`${UX} contagem iniciada (identity)`, {
        reason: guidedOk ? "guided" : "manual",
      });
      setCount(3); // shorter countdown after guided framing
    }
  }, [isIdentity, ready, count, guidance, manualStart]);

  // Cancel countdown if framing degrades during the count.
  useEffect(() => {
    if (!isIdentity || count === null || count <= 0 || startedRef.current) return;
    if (manualStart) return; // user opted out of guidance
    if (
      guidance.kind !== "perfect" &&
      guidance.kind !== "loading" &&
      guidance.kind !== "unavailable"
    ) {
      console.log(`${UX} contagem cancelada — framing perdido`, guidance.kind);
      setCount(null);
    }
  }, [isIdentity, count, guidance, manualStart]);

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

  const title = isIdentity ? "Foto de rosto" : "Encaixe o rosto e o corpo na marcação";
  const subtitle = isIdentity ? "Foto de rosto" : "Foto de corpo";
  const previewSrc = videoRef.current?.srcObject ? "" : "";
  void previewSrc;

  // Status text shown BELOW the preview (never over the face).
  let statusMessage: string;
  let statusHint: string | undefined;
  if (isIdentity) {
    statusMessage = guidance.message;
    statusHint = guidance.hint ?? "Olhe para a câmera no topo do totem e evite reflexos no rosto.";
  } else {
    statusMessage = "Encaixe o rosto e o corpo na marcação.";
    statusHint = "Mantenha a cabeça no topo e o corpo dentro do contorno.";
  }

  const isCountdownActive = count !== null && count > 0;
  const isGuidedPerfect = isIdentity && guidance.kind === "perfect";

  return (
    <Screen>
      <Header subtitle={subtitle} />

      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-2xl py-3 gap-3 sm:gap-4">
        <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-white leading-[0.95] animate-fade-up">
          {title}
        </h1>

        {/* Camera frame — no black background. A blurred mirror of the live
            stream fills any letterbox area so the preview never shows bars. */}
        <div className="relative w-full max-w-[420px] pipoca-kiosk-camera-frame aspect-[4/5] rounded-2xl overflow-hidden border border-white/15 shadow-2xl">
          {/* Blurred underlay = same video, scaled up, blurred. */}
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              transform: "scaleX(-1) scale(1.2)",
              filter: "blur(28px) brightness(0.55)",
            }}
          />
          {/* Main preview — same MediaStream is auto-shared because srcObject
              on the ref above is the singleton. Render a second <video>
              element here that mirrors the live stream via the same ref
              would not work; instead we layer a sibling video with the same
              srcObject mounted by a tiny effect. */}
          <PreviewMirror videoRef={videoRef} />

          {!ready && !errorKind ? (
            <div className="absolute inset-0 grid place-items-center text-white/85 text-sm tracking-wide animate-pulse-soft bg-black/30">
              Iniciando câmera…
            </div>
          ) : null}

          {/* Fallback geometric mask (always rendered, dimmed once a real
              face is detected so it isn't redundant with the live frame). */}
          <svg
            viewBox="0 0 100 125"
            preserveAspectRatio="none"
            className={`pointer-events-none absolute inset-0 w-full h-full transition-opacity duration-300 ${
              isIdentity && guidance.box ? "opacity-30" : "opacity-100 animate-pulse-soft"
            }`}
            aria-hidden
          >
            {isIdentity ? (
              <ellipse
                className="pipoca-identity-mask-ellipse"
                cx="50"
                cy="45"
                rx="22"
                ry="30"
                fill="none"
                stroke="#F8BA32"
                strokeWidth="0.6"
                strokeDasharray="1.5 1.2"
              />
            ) : (
              <>
                <ellipse
                  cx="50"
                  cy="35"
                  rx="11"
                  ry="14"
                  fill="none"
                  stroke="#F8BA32"
                  strokeWidth="0.6"
                  strokeDasharray="1.5 1.2"
                />
                <path
                  d="M22 102 C 24 78, 32 60, 50 60 C 68 60, 76 78, 78 102"
                  fill="none"
                  stroke="#F8BA32"
                  strokeWidth="0.6"
                  strokeDasharray="1.5 1.2"
                  strokeLinecap="round"
                />
              </>
            )}
          </svg>

          {/* Live scanning frame around detected face. */}
          {isIdentity && guidance.box && (
            <FaceScanOverlay box={guidance.box} good={isGuidedPerfect} />
          )}
        </div>

        {/* STATUS AREA — always below the preview. Contains the orientation
            message, the countdown number and the secondary hint. Never
            overlays the face. */}
        <div className="w-full max-w-md flex flex-col items-center gap-2 min-h-[120px]">
          <p
            className={`font-display text-2xl sm:text-3xl leading-tight transition-colors ${
              isGuidedPerfect || !isIdentity ? "text-gold" : "text-white"
            }`}
          >
            {statusMessage}
          </p>
          {isCountdownActive ? (
            <div className="flex items-baseline gap-3">
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/55">
                Capturando em
              </span>
              <span
                key={count}
                className="font-display text-gold text-6xl sm:text-7xl leading-none animate-pop-in"
              >
                {count}
              </span>
            </div>
          ) : statusHint ? (
            <p className="text-xs sm:text-sm text-white/70 max-w-md">{statusHint}</p>
          ) : null}
          {isIdentity && !isCountdownActive && !manualStart && guidance.kind !== "perfect" && (
            <button
              type="button"
              onClick={() => setManualStart(true)}
              className="mt-1 text-[11px] uppercase tracking-[0.25em] text-white/70 border border-white/30 rounded-md px-3 py-1.5 hover:text-white"
            >
              Tirar foto agora
            </button>
          )}
        </div>

        {count === 0 ? (
          <div className="fixed inset-0 z-30 bg-white animate-fade-in pointer-events-none" />
        ) : null}
      </div>


      <div className="relative z-10 shrink-0">
        <GhostBtn onClick={onBack}>Voltar</GhostBtn>
      </div>
    </Screen>
  );
}

// Renders a second <video> element pointing at the same MediaStream as the
// blurred backdrop, so the live preview shows on top WITHOUT a black box.
function PreviewMirror({
  videoRef,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const mirrorRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const main = videoRef.current;
    const mirror = mirrorRef.current;
    if (!main || !mirror) return;
    const sync = () => {
      if (main.srcObject && mirror.srcObject !== main.srcObject) {
        mirror.srcObject = main.srcObject;
        mirror.play().catch(() => {});
      }
    };
    sync();
    const id = window.setInterval(sync, 250);
    return () => window.clearInterval(id);
  }, [videoRef]);
  return (
    <video
      ref={mirrorRef}
      autoPlay
      muted
      playsInline
      className="absolute inset-0 w-full h-full object-contain"
      style={{ transform: "scaleX(-1)" }}
    />
  );
}

function FaceScanOverlay({
  box,
  good,
}: {
  box: { x: number; y: number; w: number; h: number };
  good: boolean;
}) {
  const color = good ? "#92C37A" : "#F8BA32";
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 w-full h-full"
      aria-hidden
    >
      {/* Corner brackets around the detected face. */}
      {(() => {
        const x = box.x * 100;
        const y = box.y * 100;
        const w = box.w * 100;
        const h = box.h * 100;
        const c = 4; // corner length
        const lines = [
          [x, y, x + c, y],          [x, y, x, y + c],
          [x + w - c, y, x + w, y],  [x + w, y, x + w, y + c],
          [x, y + h - c, x, y + h],  [x, y + h, x + c, y + h],
          [x + w, y + h - c, x + w, y + h], [x + w - c, y + h, x + w, y + h],
        ];
        return lines.map((l, i) => (
          <line
            key={i}
            x1={l[0]}
            y1={l[1]}
            x2={l[2]}
            y2={l[3]}
            stroke={color}
            strokeWidth="0.6"
            strokeLinecap="round"
          />
        ));
      })()}
      {/* Animated scan line inside the bbox. */}
      <defs>
        <clipPath id="face-clip">
          <rect
            x={box.x * 100}
            y={box.y * 100}
            width={box.w * 100}
            height={box.h * 100}
          />
        </clipPath>
      </defs>
      <g clipPath="url(#face-clip)">
        <line
          x1={box.x * 100}
          x2={(box.x + box.w) * 100}
          y1={(box.y + box.h * 0.5) * 100}
          y2={(box.y + box.h * 0.5) * 100}
          stroke={color}
          strokeWidth="0.35"
          opacity="0.85"
        >
          <animate
            attributeName="y1"
            from={box.y * 100}
            to={(box.y + box.h) * 100}
            dur="2.2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="y2"
            from={box.y * 100}
            to={(box.y + box.h) * 100}
            dur="2.2s"
            repeatCount="indefinite"
          />
        </line>
      </g>
    </svg>
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
          <ConfirmPhoto url={identityUrl} label="Foto de rosto" tag="confirm-identity" />
          <ConfirmPhoto url={appearanceUrl} label="Foto de corpo" tag="confirm-appearance" />
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


function ConfirmPhoto({ url, label, tag }: { url: string; label: string; tag: string }) {
  // Show the full captured photo (contain) over a blurred copy of itself so
  // there are no black bars even when the photo's aspect doesn't match 4:5.
  // The mirroring (scaleX(-1)) matches what the visitor saw in the preview.
  return (
    <div className="flex flex-col items-center gap-1.5 animate-pop-in">
      <div className="relative w-full aspect-[4/5] overflow-hidden shadow-2xl rounded-xl border border-white/10 bg-black/30">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${url})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(28px) brightness(0.55)",
            transform: "scaleX(-1) scale(1.15)",
          }}
        />
        <div className="absolute inset-0">
          <PipocaImage
            src={url}
            alt={label}
            fit="contain"
            logTag={tag}
            style={{ transform: "scaleX(-1)" }}
          />
        </div>
      </div>
      <span className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-gold">
        {label}
      </span>
    </div>
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

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIdx((i) => (i + 1) % LOADING_PHRASES.length);
    }, 1600);
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
          <span className="font-display text-2xl sm:text-3xl lg:text-4xl text-gold">P&amp;C</span>
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
  const [slide, setSlide] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (publicToken && resultPageUrl) {
      console.log("[PIPOCA_QR] result page URL pronta", resultPageUrl);
    }
  }, [publicToken, resultPageUrl]);

  // Auto-advance slide 0 -> slide 1 over 10s with progress bar
  useEffect(() => {
    if (slide !== 0) {
      setProgress(1);
      return;
    }
    setProgress(0);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const pct = Math.min(1, (now - start) / SLIDE_0_MS);
      setProgress(pct);
      if (pct < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const t = window.setTimeout(() => setSlide(1), SLIDE_0_MS);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [slide]);

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

            <div className="relative w-full flex-1 min-h-0 max-w-[560px] pipoca-kiosk-result-frame mx-auto flex items-center justify-center aspect-[4/5]">
              <PipocaImage
                src={imageUrl ?? movie.posterUrl}
                alt="Cena gerada"
                fit="contain"
                logTag="result-final"
                wrapperClassName="rounded-2xl border border-white/10 shadow-[0_30px_80px_-10px_rgba(0,0,0,0.7)] overflow-hidden"
              />
            </div>

            <span className="text-[10px] uppercase tracking-[0.3em] text-white/60">
              Inspirado em {movie.title}
            </span>
          </div>
        )}

        {slide === 1 && (
          <div className="flex flex-col items-center gap-4 sm:gap-5 w-full animate-fade-up">
            <h1 className="font-display text-2xl sm:text-4xl lg:text-5xl text-white leading-[0.95]">
              Leve sua <span className="text-gold">cena</span>
            </h1>

            <div className="flex items-center gap-3 bg-white/5 border border-white/15 rounded-xl p-3 sm:p-4 w-full max-w-sm">
              <div className="bg-white p-2 rounded-lg shrink-0 grid place-items-center pipoca-kiosk-qr">
                {resultPageUrl ? (
                  <QRCodeSVG
                    value={resultPageUrl}
                    size={110}
                    level="M"
                    marginSize={2}
                    bgColor="#FFFFFF"
                    fgColor="#000000"
                  />
                ) : (
                  <div className="w-28 h-28 bg-white/40 animate-pulse rounded" />
                )}
              </div>
              <div className="text-left min-w-0">
                <p className="text-[10px] uppercase tracking-[0.25em] text-gold">
                  Escaneie para baixar
                </p>
                <p className="text-sm text-white/85 leading-snug">
                  Salve e compartilhe sua imagem cinematográfica.
                </p>
              </div>
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
  const [consent, setConsent] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOk = fullName.replace(/\s+/g, " ").trim().length >= 2 && !/^\d+$/.test(fullName.trim());
  const phoneOk = isValidBrWhatsapp(whatsapp);
  const canSubmit = nameOk && phoneOk && consent && !loading;

  async function submit() {
    if (!canSubmit) return;
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
      onDone(res.visitorId, res.firstName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao cadastrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen aurora>
      <Header subtitle="Cadastro" />
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
        <label className="flex items-start gap-2 text-left text-sm text-white/85">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={loading}
            className="mt-1 w-4 h-4 accent-gold flex-shrink-0"
          />
          <span>
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
            e autorizo o tratamento do meu nome, WhatsApp e imagens para criar e disponibilizar minha cena personalizada e, caso eu solicite, identificar e imprimir minha foto.
          </span>
        </label>
        {error && (
          <div className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-center">
            <p className="text-sm font-semibold text-red-200 uppercase tracking-wide">
              Não conseguimos registrar seus dados
            </p>
            <p className="text-xs text-red-200/80 mt-1">
              Confira as informações e tente novamente.
            </p>
            <p className="text-[10px] text-red-200/50 mt-2 break-words">{error}</p>
          </div>
        )}
        <div className="flex flex-col items-center gap-2 pt-2">
          <PrimaryCta onClick={submit} disabled={!canSubmit}>
            {loading ? "Cadastrando…" : error ? "Tentar novamente" : "Continuar"}
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

