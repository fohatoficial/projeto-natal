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
import {
  preparePipocaPostcardUpload,
  confirmPipocaPostcard,
} from "@/lib/pipoca/postcard.functions";
import {
  renderPostcard,
  type PostcardRender,
} from "@/lib/pipoca/postcard-template";
import type { PostcardSelection } from "@/lib/pipoca/postcard-messages";
import { SCENARIOS } from "@/lib/pipoca/scenarios";
import { deriveIdentityFaceCrop } from "@/lib/pipoca/faceCrop";
import { EXPERIENCE_NAME, SPONSOR } from "@/lib/pipoca/branding";
import { PostcardComposer } from "@/components/pipoca/PostcardComposer";



type Step =
  | "choose"
  | "participants"
  | "stories"
  | "camera_identity"
  | "orient_appearance"
  | "camera_appearance"
  | "confirm"
  | "postcard"
  | "postcard_wait"
  | "postcard_preview"
  | "postcard_error"
  | "result";

type CameraVariant = "identity" | "appearance";

/** Quem participa da foto — adapta as orientações de captura. */
type PartySize = "solo" | "couple" | "family";

const PARTY_COPY: Record<
  PartySize,
  {
    identityTitle: string;
    identityHint: string;
    appearanceTitle: string;
    appearanceHint: string;
    still: string;
    orientTitle: string;
    orientBody: string;
    photosTail: string;
    photosNote: string;
  }
> = {
  solo: {
    identityTitle: "Olhe para a câmera",
    identityHint: "Posicione-se de frente e mantenha o rosto bem visível.",
    appearanceTitle: "Dê um passo para trás",
    appearanceHint: "Fique bem no centro, da cabeça até a cintura.",
    still: "Não se mova",
    orientTitle: "dê um passo para trás",
    orientBody: "Vamos registrar você da cintura para cima.",
    photosTail: "suas",
    photosNote: "As duas fotos são só suas.",
  },
  couple: {
    identityTitle: "Olhem para a câmera",
    identityHint: "Aproximem-se e mantenham os dois rostos bem visíveis.",
    appearanceTitle: "Deem um passo para trás",
    appearanceHint: "Os dois bem juntinhos, da cabeça até a cintura.",
    still: "Não se movam",
    orientTitle: "deem um passo para trás",
    orientBody: "Vamos registrar vocês dois da cintura para cima.",
    photosTail: "de vocês",
    photosNote: "Os dois aparecem nas duas fotos.",
  },
  family: {
    identityTitle: "Olhem para a câmera",
    identityHint: "Garanta que todos os rostos estejam bem visíveis.",
    appearanceTitle: "Deem um passo para trás",
    appearanceHint:
      "Garanta que todos estejam dentro do enquadramento, da cabeça até a cintura.",
    still: "Não se movam",
    orientTitle: "deem um passo para trás",
    orientBody: "Vamos registrar todos da cintura para cima.",
    photosTail: "de todos",
    photosNote: "Todos aparecem nas duas fotos.",
  },
};


const IconSnowflake = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19" />
    <path d="M12 6l-2.2 2.2M12 6l2.2 2.2M12 18l-2.2-2.2M12 18l2.2-2.2M6 12l2.2-2.2M6 12l2.2 2.2M18 12l-2.2-2.2M18 12l-2.2 2.2" />
  </svg>
);
const IconPine = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M12 3 7 10h3l-4 6h5v5h2v-5h5l-4-6h3L12 3Z" />
  </svg>
);
const IconGift = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <rect x="3" y="9" width="18" height="12" rx="1.5" />
    <path d="M3 13h18M12 9v12M12 9s-1.5-5-4.5-5S6 9 12 9Zm0 0s1.5-5 4.5-5S18 9 12 9Z" />
  </svg>
);
const IconPostcard = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <rect x="2.5" y="5" width="19" height="14" rx="2" />
    <path d="M14 9h5M14 12h5M14 15h3" />
    <circle cx="8" cy="11" r="2" />
    <path d="M4.5 16c1-2 2-3 3.5-3s2.5 1 3.5 3" />
  </svg>
);
const IconStar = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="m12 2 2.9 6.9L22 10l-5.5 4.6L18.2 22 12 18.3 5.8 22l1.7-7.4L2 10l7.1-1.1L12 2Z" />
  </svg>
);
const IconSparkles = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);
const WINTER_ICONS = [
  IconSnowflake,
  IconPine,
  IconPostcard,
  IconGift,
  IconStar,
  IconSparkles,
];

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
  const [party, setParty] = useState<PartySize | null>(null);
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
  const [postcardUrl, setPostcardUrl] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [selection, setSelection] = useState<PostcardSelection | null>(null);
  const [postcardRender, setPostcardRender] = useState<PostcardRender | null>(null);
  const [postcardSaveError, setPostcardSaveError] = useState<string | null>(null);
  const [savingPostcard, setSavingPostcard] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  const identityUploadedRef = useRef(false);
  const appearanceUploadedRef = useRef(false);
  const generationStartedRef = useRef(false);
  const postcardRenderRef = useRef<PostcardRender | null>(null);
  const renderingCardRef = useRef(false);
  const { films, loading, error } = usePipocaFilms();

  const prepareFn = useServerFn(createPipocaCaptureUpload);
  const confirmFn = useServerFn(confirmPipocaCaptureUpload);
  const createGenFn = useServerFn(createPipocaGeneration);
  const statusGenFn = useServerFn(getPipocaGenerationStatus);
  const preparePostcardFn = useServerFn(preparePipocaPostcardUpload);
  const confirmPostcardFn = useServerFn(confirmPipocaPostcard);
  

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
      if (postcardRenderRef.current) URL.revokeObjectURL(postcardRenderRef.current.objectUrl);
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
      setParty(null);
      setPrepared(null);
      setUploadStatus("idle");
      setUploadError(null);
      setGenerationId(null);
      setGeneratedUrl(null);
      setPublicToken(null);
      setResultPageUrl(null);
      setPostcardUrl(null);
      setGenError(null);
      setSelection(null);
      if (postcardRenderRef.current) URL.revokeObjectURL(postcardRenderRef.current.objectUrl);
      postcardRenderRef.current = null;
      setPostcardRender(null);
      setPostcardSaveError(null);
      setSavingPostcard(false);
      setRenderFailed(false);
      renderingCardRef.current = false;
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
            ? "Não foi possível preparar este cenário. Tente novamente."
            : "Não conseguimos criar seu cartão-postal.",
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
            visitorId: null,
            partySize: party,
          },
        });
        current = res as Prepared;
        setPrepared(current);
      }

      setUploadStatus("uploading");

      if (!identityUploadedRef.current) {
        const faceCrop = await deriveIdentityFaceCrop(identityPhoto.blob);
        console.log(`${UPLOAD_LOG} face crop derivado`, {
          face_crop_used: faceCrop.used,
          face_crop_width: faceCrop.width,
          face_crop_height: faceCrop.height,
          original_identity_width: faceCrop.originalWidth,
          original_identity_height: faceCrop.originalHeight,
        });
        const { error: upErr } = await supabase.storage
          .from("pipoca-visitor-originals")
          .uploadToSignedUrl(
            current.uploads.identity.path,
            current.uploads.identity.token,
            faceCrop.blob,
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
      // A geração da fotografia começa IMEDIATAMENTE em background; o
      // visitante segue direto para a mensagem, sem tela de loading.
      transitionTo(() => setStep("postcard"));
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
  }, [identityPhoto, appearancePhoto, selected, prepared, prepareFn, confirmFn, startGeneration, party]);

  const retryGeneration = useCallback(() => {
    if (!prepared) return;
    setGenError(null);
    setRenderFailed(false);
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
      setRenderFailed(false);
      setUploadStatus("idle");
      setUploadError(null);
      setStep("camera_identity");
    });

  /* ----- Geração em background: polling silencioso durante a mensagem ----- */

  useEffect(() => {
    if (!generationId || generatedUrl || genError) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        console.log(`${GEN_LOG} polling (background)`, { generationId });
        const res = await statusGenFn({ data: { generationId } });
        if (cancelled) return;
        if (res.status === "completed") {
          console.log(`${GEN_LOG} concluída em background`);
          setGeneratedUrl(res.imageUrl);
          setPublicToken(res.publicToken);
          setResultPageUrl(res.resultPageUrl);
          return;
        }
        if (res.status === "failed") {
          // NÃO interrompe a personalização — o erro só aparece ao pedir o cartão.
          console.warn(`${GEN_LOG} falhou em background`);
          setGenError(res.error || "Falha na geração");
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
  }, [generationId, generatedUrl, genError, statusGenFn]);

  /** Monta o cartão-postal no template-mestre e abre a prévia. */
  const renderAndShow = useCallback(
    async (sel: PostcardSelection, imageUrl: string) => {
      if (renderingCardRef.current) return;
      renderingCardRef.current = true;
      try {
        const out = await renderPostcard(imageUrl, {
          message: sel.message,
          fontStyle: sel.fontStyle,
          dividerStyle: sel.dividerStyle,
        });
        if (postcardRenderRef.current) URL.revokeObjectURL(postcardRenderRef.current.objectUrl);
        postcardRenderRef.current = out;
        setPostcardRender(out);
        setPostcardSaveError(null);
        setRenderFailed(false);
        transitionTo(() => setStep("postcard_preview"));
      } catch (e) {
        console.warn(`${GEN_LOG} falha ao montar cartão-postal`, e);
        setRenderFailed(true);
        transitionTo(() => setStep("postcard_error"));
      } finally {
        renderingCardRef.current = false;
      }
    },
    [],
  );

  // Espera elegante: assim que a geração conclui, monta e avança sem novo clique.
  useEffect(() => {
    if (step !== "postcard_wait") return;
    if (genError) {
      transitionTo(() => setStep("postcard_error"));
      return;
    }
    if (generatedUrl && selection) void renderAndShow(selection, generatedUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, genError, generatedUrl, selection, renderAndShow]);

  /** "Ver meu cartão-postal": verifica o status da geração e decide o caminho. */
  const handlePostcardReady = useCallback(
    (sel: PostcardSelection) => {
      console.log(`${UX} mensagem concluída, verificando geração`, {
        type: sel.messageType,
        chars: sel.message.length,
      });
      setSelection(sel);
      if (genError) {
        transitionTo(() => setStep("postcard_error"));
      } else if (generatedUrl) {
        // CASO A — geração já concluída durante a personalização.
        void renderAndShow(sel, generatedUrl);
      } else {
        // CASO B — ainda processando: tela elegante de espera com polling.
        transitionTo(() => setStep("postcard_wait"));
      }
    },
    [genError, generatedUrl, renderAndShow],
  );

  const finalizePostcard = useCallback(async () => {
    const render = postcardRenderRef.current;
    if (!render || !generationId || !selection || savingPostcard) return;
    setSavingPostcard(true);
    setPostcardSaveError(null);
    try {
      const { path, token } = await preparePostcardFn({ data: { generationId } });
      const { error: upErr } = await supabase.storage
        .from("pipoca-generated-scenes")
        .uploadToSignedUrl(path, token, render.blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const res = await confirmPostcardFn({
        data: {
          generationId,
          path,
          messageType: selection.messageType,
          messageText: selection.message,
          fontStyle: selection.fontStyle,
          dividerStyle: selection.dividerStyle,
        },
      });
      console.log(`${GEN_LOG} cartão-postal finalizado`);
      setPostcardUrl(res.postcardUrl);
      transitionTo(() => setStep("result"));
    } catch (e) {
      console.warn(`${GEN_LOG} falha ao finalizar cartão-postal`, e);
      setPostcardSaveError("Não conseguimos salvar seu cartão-postal. Tente novamente.");
    } finally {
      setSavingPostcard(false);
    }
  }, [generationId, selection, savingPostcard, preparePostcardFn, confirmPostcardFn]);

  return (
    <div className="bg-cinema text-white relative">
      {step === "choose" && (
        <ScenarioHome
          films={films}
          loading={loading}
          error={error}
          onStart={(m) => {
            console.log(`${UX} cenário selecionado`, { id: m.id, title: m.title });
            transitionTo(() => {
              setSelected(m);
              setStep("participants");
            });
          }}
        />
      )}
      {step === "participants" && selected && (
        <PartySelect
          onSelect={(p) => {
            console.log(`${UX} participantes escolhidos`, { party: p });
            setParty(p);
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
      {step === "stories" && selected && party && (
        <Stories
          movie={selected}
          party={party}
          onDone={() => {
            console.log(`${UX} stories concluídos, abrindo câmera`);
            transitionTo(() => setStep("camera_identity"));
          }}
          onRestart={() => {
            releaseSharedCamera();
            transitionTo(() => {
              setSelected(null);
              setStep("choose");
            });
          }}
        />
      )}
      {step === "camera_identity" && party && (
        <Camera
          variant="identity"
          party={party}
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
      {step === "orient_appearance" && party && (
        <OrientAppearance
          party={party}
          onNext={() => {
            transitionTo(() => setStep("camera_appearance"));
          }}
        />
      )}
      {step === "camera_appearance" && party && (
        <Camera
          variant="appearance"
          party={party}
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
      {step === "postcard" && (
        <Screen aurora>
          <Header subtitle="Sua mensagem de Natal" />
          <div className="relative z-10 flex-1 min-h-0 w-full overflow-y-auto flex items-center">
            <PostcardComposer initial={selection} onReady={handlePostcardReady} />
          </div>
        </Screen>
      )}
      {step === "postcard_wait" && <PostcardWaiting />}
      {step === "postcard_preview" && postcardRender && (
        <PostcardPreview
          imageUrl={postcardRender.objectUrl}
          saving={savingPostcard}
          error={postcardSaveError}
          onEdit={() => transitionTo(() => setStep("postcard"))}
          onFinalize={() => void finalizePostcard()}
        />
      )}
      {step === "result" && selected && (
        <Result
          movie={selected}
          imageUrl={postcardUrl ?? generatedUrl}
          publicToken={publicToken}
          resultPageUrl={resultPageUrl}
          onRestart={reset}
        />
      )}

      {step === "postcard_error" && (
        <GenerationError
          message={
            genError ??
            "Não conseguimos montar seu cartão-postal. Toque para tentar novamente."
          }
          onRetry={() => {
            if (genError) {
              // Nova tentativa preserva cenário, participantes, mensagem e estilo.
              retryGeneration();
              transitionTo(() => setStep("postcard_wait"));
            } else if (generatedUrl && selection) {
              setRenderFailed(false);
              void renderAndShow(selection, generatedUrl);
            }
          }}
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
          Não conseguimos criar seu cartão-postal
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
          Não conseguimos enviar sua foto
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

/**
 * Assinatura da experiência. A área do patrocinador já existe aqui —
 * quando SPONSOR.sponsorLogoUrl/actionName forem definidos, aparecem
 * automaticamente, sem redesenho.
 */
function Header({ subtitle }: { subtitle?: string }) {
  return (
    <div className="relative z-10 flex flex-col items-center gap-1.5 shrink-0">
      {SPONSOR.sponsorLogoUrl ? (
        <img
          src={SPONSOR.sponsorLogoUrl}
          alt={SPONSOR.sponsorName ?? "Patrocinador"}
          className="h-7 sm:h-9 w-auto opacity-95"
        />
      ) : null}
      <span className="font-display text-xl sm:text-2xl lg:text-3xl text-snow tracking-wide">
        {SPONSOR.actionName ?? EXPERIENCE_NAME}
      </span>
      <div className="brand-stripe w-24 sm:w-32 lg:w-44 rounded-full opacity-90" />
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

/* ---------- Step 1: Home nacional — escolha do cenário ---------- */

/**
 * A home representa a EXPERIÊNCIA NACIONAL do Projeto Natal. Brasília é
 * apenas um dos cenários: os quatro cards são os próprios CTAs e avançam
 * imediatamente ao toque. Cenários sem scene pack funcional aparecem como
 * "Em breve" e não iniciam geração. Isto é escolha de CENÁRIO — nada de
 * capital, cidade ou localização do visitante.
 */
function ScenarioHome({
  films,
  loading,
  error,
  onStart,
}: {
  films: Movie[];
  loading: boolean;
  error: string | null;
  onStart: (m: Movie) => void;
}) {
  const bySlug = new Map(films.map((f) => [f.slug, f]));
  const brasilia = bySlug.get("natal-em-brasilia") ?? null;
  return (
    <Screen aurora>
      <Header />

      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-4xl py-4 gap-6 sm:gap-8">
        <div className="flex flex-col items-center gap-3 animate-fade-up">
          <span className="text-[10px] sm:text-xs uppercase tracking-[0.4em] text-gold/85">
            Experiência de Natal
          </span>
          <h1 className="font-display text-[2.4rem] leading-[1.05] sm:text-6xl lg:text-7xl text-snow max-w-3xl">
            Neste Natal, escolha onde a{" "}
            <span className="text-gold italic">magia</span> vai acontecer.
          </h1>
          <p className="text-base sm:text-lg lg:text-xl text-white/75 max-w-xl leading-relaxed">
            Transforme sua foto em um cartão-postal natalino coberto de neve,
            tendo como cenário lugares icônicos do Brasil.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-5 w-full animate-fade-up">
          {SCENARIOS.map((s) => {
            const film = bySlug.get(s.slug) ?? null;
            const enabled = s.available && !loading && !!film;
            const poster =
              film && film.posterUrl.startsWith("https://") ? film.posterUrl : null;
            return (
              <button
                key={s.slug}
                type="button"
                disabled={!enabled}
                onClick={() => film && onStart(film)}
                className="natal-card group relative overflow-hidden min-h-[150px] sm:min-h-[220px] flex flex-col items-center justify-center gap-1.5 p-5 text-center disabled:cursor-not-allowed"
              >
                {poster ? (
                  <>
                    <img
                      src={poster}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15" />
                  </>
                ) : (
                  <span className="w-9 h-9 sm:w-11 sm:h-11 text-gold/50 mb-1">
                    <IconSnowflake />
                  </span>
                )}
                <span className="relative font-display text-2xl sm:text-4xl text-snow uppercase tracking-wide">
                  {s.city}
                </span>
                <span className="relative natal-eyebrow">{s.landmark}</span>
                {!s.available ? (
                  <span className="relative mt-2 inline-block border border-gold/40 text-gold/90 text-[9px] sm:text-[10px] uppercase tracking-[0.3em] px-3 py-1 rounded-full">
                    Em breve
                  </span>
                ) : null}
                {s.available && loading ? (
                  <span className="relative mt-2 text-[10px] uppercase tracking-[0.3em] text-white/50 animate-pulse-soft">
                    Preparando…
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {error ? (
          <p className="text-sm text-white/85 max-w-md">{error}</p>
        ) : null}
        {!loading && !error && !brasilia ? (
          <p className="text-sm text-white/70 max-w-md">
            O cenário de Brasília ainda não está disponível.
          </p>
        ) : null}
      </div>

      <div className="relative z-10 shrink-0 h-8 flex items-center justify-center">
        {SPONSOR.sponsorName ? (
          <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">
            Oferecido por {SPONSOR.sponsorName}
          </span>
        ) : null}
      </div>
    </Screen>
  );
}

/* ---------- Step 1b: Quem vai participar ---------- */

const IconPerson = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-full h-full">
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
  </svg>
);
const IconCouple = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-full h-full">
    <circle cx="8.5" cy="8.5" r="3" />
    <circle cx="15.5" cy="8.5" r="3" />
    <path d="M3 20c0-3 2.4-5 5.5-5 1.2 0 2.3.3 3.2 1 .9-.7 2-1 3.3-1 3.1 0 5.5 2 5.5 5" />
  </svg>
);
const IconFamily = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-full h-full">
    <circle cx="6" cy="9" r="2.6" />
    <circle cx="18" cy="9" r="2.6" />
    <circle cx="12" cy="7.4" r="2" />
    <path d="M2.2 20c0-2.8 1.7-4.6 3.8-4.6 1 0 1.8.3 2.5.9" />
    <path d="M21.8 20c0-2.8-1.7-4.6-3.8-4.6-1 0-1.8.3-2.5.9" />
    <path d="M8.6 20c0-2.6 1.5-4.3 3.4-4.3s3.4 1.7 3.4 4.3" />
  </svg>
);

/**
 * Etapa imersiva "Quem vai participar?". Substitui o cadastro na jornada
 * pública atual: a resposta (solo/couple/family) adapta as orientações de
 * captura e é persistida na captura quando a coluna existir.
 */
function PartySelect({
  onSelect,
  onBack,
}: {
  onSelect: (p: PartySize) => void;
  onBack: () => void;
}) {
  const options: { id: PartySize; label: string; hint: string; icon: React.ReactNode }[] = [
    { id: "solo", label: "Só eu", hint: "Um protagonista", icon: <IconPerson /> },
    { id: "couple", label: "Casal", hint: "Dois na neve", icon: <IconCouple /> },
    { id: "family", label: "Família", hint: "Todo mundo junto", icon: <IconFamily /> },
  ];
  return (
    <Screen aurora>
      <Header subtitle="Antes da foto" />
      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-4xl py-4 gap-7 sm:gap-9">
        <div className="flex flex-col items-center gap-3 animate-fade-up">
          <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl text-snow leading-[1.05] max-w-2xl">
            Quem vai entrar neste{" "}
            <span className="font-script text-gold text-[1.2em] leading-none">cartão-postal</span>?
          </h1>
          <p className="text-sm sm:text-base text-white/70 max-w-md">
            Toque em uma opção — as orientações da foto se ajustam para você.
          </p>
        </div>
        <div className="grid gap-4 sm:gap-5 sm:grid-cols-3 w-full animate-fade-up">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(o.id)}
              className="natal-card px-6 py-8 sm:py-10 min-h-[170px] sm:min-h-[220px] flex flex-col items-center justify-center gap-3 text-center"
            >
              <span className="w-14 h-14 sm:w-16 sm:h-16 text-gold">{o.icon}</span>
              <span className="font-display text-2xl sm:text-3xl text-snow uppercase tracking-wide">
                {o.label}
              </span>
              <span className="natal-eyebrow">{o.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="relative z-10 shrink-0">
        <GhostBtn onClick={onBack}>Voltar</GhostBtn>
      </div>
    </Screen>
  );
}

/* ---------- Step 2: Stories (after film pick, prewarms camera) ---------- */

const STORY_DURATIONS_MS = [3000, 4500, 2000];

function Stories({
  movie,
  party,
  onDone,
  onRestart,
}: {
  movie: Movie;
  party: PartySize;
  onDone: () => void;
  onRestart: () => void;
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
        {idx === 0 && <StoryScene movie={movie} />}
        {idx === 1 && <StoryTwoPhotos party={party} />}
        {idx === 2 && <StoryPrepare cameraStatus={cameraStatus} />}
      </div>

      <div className="relative z-30 shrink-0">
        {idx === 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRestart();
            }}
            className="text-xs uppercase tracking-[0.3em] text-white/65 hover:text-white underline underline-offset-4 py-2 px-3"
          >
            Voltar ao início
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

function StoryScene({ movie }: { movie: Movie }) {
  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4 animate-fade-up w-full">
      <span className="text-[10px] sm:text-xs uppercase tracking-[0.35em] text-gold">
        Seu cenário é
      </span>
      <div className="relative w-[78vw] max-w-[360px] sm:max-w-[420px] aspect-[4/5] rounded-2xl overflow-hidden border border-white/12 shadow-[0_30px_80px_-10px_rgba(0,0,0,0.7)] bg-white/5">
        {movie.posterUrl ? (
          <img
            src={movie.posterUrl}
            alt={movie.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : null}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/95 via-black/50 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <h1 className="font-display text-3xl sm:text-4xl text-snow leading-[1.05]">
            {movie.title}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-white/70">
            Neve suave, luzes de Natal e clima abaixo de zero.
          </p>
        </div>
      </div>
    </div>
  );
}

function StoryTwoPhotos({ party }: { party: PartySize }) {
  const copy = PARTY_COPY[party];
  return (
    <div className="flex flex-col items-center gap-6 sm:gap-7 animate-fade-up max-w-md">
      <h1 className="font-display text-3xl sm:text-5xl text-white leading-[0.95]">
        Vamos tirar <span className="text-gold">duas fotos</span> {copy.photosTail}
      </h1>
      <p className="text-sm sm:text-base text-white/75 -mt-2">
        {copy.photosNote}
      </p>
      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="flex flex-col items-center gap-2 rounded-xl border border-white/15 bg-white/5 p-4">
          <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="#F8BA32" strokeWidth="1.8">
            <circle cx="12" cy="9" r="3.5" />
            <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" strokeLinecap="round" />
          </svg>
          <p className="text-xs sm:text-sm text-white/85 leading-snug">
            Uma foto <span className="text-gold">de perto</span> para reconhecer os rostos
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 rounded-xl border border-white/15 bg-white/5 p-4">
          <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="#2E5BE5" strokeWidth="1.8">
            <circle cx="12" cy="6" r="2.5" />
            <path d="M8 22v-7l-2-4h12l-2 4v7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-xs sm:text-sm text-white/85 leading-snug">
            Uma foto <span className="text-gold">mais distante</span> para registrar todo mundo
          </p>
        </div>
      </div>
    </div>
  );
}

function StoryPrepare({ cameraStatus }: { cameraStatus: ReturnType<typeof getSharedStatus> }) {
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
        <span className="text-gold">Prepare-se</span>
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
  party,
  onNext,
}: {
  party: PartySize;
  onNext: () => void;
}) {
  const copy = PARTY_COPY[party];
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
            <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl text-white leading-[0.95] animate-fade-up text-center">
          Agora, <span className="text-gold">{copy.orientTitle}</span>
        </h1>
        <p className="text-base sm:text-lg text-white/80 max-w-md animate-fade-up text-center">
          {copy.orientBody}
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
  party,
  onCaptured,
  onBack,
}: {
  variant: CameraVariant;
  party: PartySize;
  onCaptured: (p: { blob: Blob; url: string }) => void;
  onBack: () => void;
}) {
  const copy = PARTY_COPY[party];
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
    variant === "identity" ? copy.identityTitle : copy.appearanceTitle;
  const hint =
    variant === "identity" ? copy.identityHint : copy.appearanceHint;
  const subtitle = variant === "identity" ? "Foto 1 de 2" : "Foto 2 de 2";
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
            {copy.still.toUpperCase()}
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
        <GhostBtn onClick={onBack}>Voltar ao início</GhostBtn>
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


/* ---------- Espera elegante (só se a geração ainda não terminou) ---------- */

/**
 * Exibida SOMENTE quando o visitante termina a personalização antes da IA.
 * O polling em background continua ativo no fluxo principal; esta tela é
 * puramente apresentacional e avança sozinha quando a foto fica pronta.
 */
function PostcardWaiting() {
  const [iconIdx, setIconIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIconIdx((i) => (i + 1) % WINTER_ICONS.length);
    }, 1400);
    return () => clearInterval(interval);
  }, []);

  return (
    <Screen aurora>
      <Header subtitle="Quase lá" />

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
          {/* Rotating winter icon */}
          <div className="relative w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 grid place-items-center">
            {WINTER_ICONS.map((Icon, i) => (
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

        <div className="space-y-3">
          <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl text-snow leading-tight">
            Seu cartão está <span className="text-gold">quase pronto</span>.
          </h1>
          <p className="text-white/70 text-sm sm:text-base">
            Estamos dando os últimos toques no seu Natal.
          </p>
        </div>

        <div className="w-full max-w-xs h-1.5 rounded-full bg-white/10 overflow-hidden shimmer-bar">
          <div className="h-full w-1/3 bg-gold rounded-full" />
        </div>
      </div>
    </Screen>
  );
}

/* ---------- Prévia do cartão-postal montado ---------- */

/**
 * O cartão completo só aparece aqui, já renderizado pelo template-mestre.
 * "Trocar mensagem" volta à jornada da mensagem SEM gerar a foto novamente
 * (a seleção anterior é restaurada no compositor).
 */
function PostcardPreview({
  imageUrl,
  saving,
  error,
  onEdit,
  onFinalize,
}: {
  imageUrl: string;
  saving: boolean;
  error: string | null;
  onEdit: () => void;
  onFinalize: () => void;
}) {
  return (
    <Screen aurora>
      <Header subtitle="Seu cartão-postal" />
      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-3xl py-3 gap-4 sm:gap-5 overflow-y-auto">
        <h1 className="font-display text-3xl sm:text-5xl text-snow leading-[1.05] animate-fade-up shrink-0">
          Confira seu{" "}
          <span className="font-script text-gold text-[1.2em] leading-none">cartão-postal</span>
        </h1>
        <div className="w-full max-w-2xl rounded-2xl overflow-hidden border border-gold/35 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] animate-fade-up shrink-0">
          <img
            src={imageUrl}
            alt="Cartão-postal natalino montado"
            className="block w-full h-auto"
          />
        </div>
        <div className="flex flex-col items-center gap-3 shrink-0">
          <PrimaryCta onClick={onFinalize} disabled={saving}>
            {saving ? "Finalizando…" : "Finalizar meu cartão-postal"}
          </PrimaryCta>
          <GhostBtn onClick={onEdit} disabled={saving}>
            Trocar mensagem
          </GhostBtn>
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/45">
            Trocar a mensagem não gera a fotografia novamente
          </p>
          {error ? (
            <p className="text-sm text-red-200 max-w-md">{error}</p>
          ) : null}
        </div>
      </div>
    </Screen>
  );
}


/* ---------- Step 6: Result (photo first, QR on demand) ---------- */

function Result({
  movie,
  imageUrl,
  publicToken,
  resultPageUrl,
  onRestart,
}: {
  movie: Movie;
  imageUrl: string | null;
  publicToken: string | null;
  resultPageUrl: string | null;
  onRestart: () => void;
}) {
  const SLIDE_0_MS = 10000;
  const SLIDE_1_MS = 30000;
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

  const bgUrl = imageUrl ?? (movie.posterUrl || null);

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
              Seu <span className="text-gold">cartão-postal</span> está pronto
            </h1>

            <div className="relative w-full flex-1 min-h-0 max-w-[560px] mx-auto flex items-center justify-center">
              <img
                src={imageUrl ?? movie.posterUrl}
                alt="Cartão-postal natalino gerado"
                className="max-w-full max-h-full object-contain rounded-2xl border border-white/10 shadow-[0_30px_80px_-10px_rgba(0,0,0,0.7)]"
              />
            </div>

            <span className="text-[10px] uppercase tracking-[0.3em] text-white/60">
              {movie.title}
            </span>
            {SPONSOR.institutionalMessage ? (
              <span className="text-[11px] text-white/70 text-center max-w-md">
                {SPONSOR.institutionalMessage}
              </span>
            ) : null}
          </div>
        )}

        {slide === 1 && (
          <div className="flex flex-col items-center gap-4 sm:gap-5 w-full animate-fade-up">
            <h1 className="font-display text-2xl sm:text-4xl lg:text-5xl text-white leading-[0.95] text-center">
              Seu cartão-postal já foi enviado para <span className="text-gold">impressão</span>
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


