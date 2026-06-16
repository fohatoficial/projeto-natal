// Lightweight face *guidance* (NOT recognition) for the totem's first photo.
//
// - Uses MediaPipe Tasks Vision FaceDetector (BlazeFace short-range).
// - Model + WASM are loaded from jsDelivr CDN with the version pinned to the
//   installed @mediapipe/tasks-vision package. No model is shipped in the
//   repo to keep the build small; if the CDN is unreachable the camera
//   falls back to the fixed mask and the manual capture button.
// - Local-only inference, ~5 fps. No frame, landmark or bbox is ever saved,
//   uploaded, hashed or used for identification — everything lives in the
//   browser tab and is discarded when the screen unmounts.
//
// Returns coarse geometric *suggestions* (too far, too close, off-center,
// head turned, etc.). It deliberately avoids gaze / biometric estimation.

import { useEffect, useRef, useState } from "react";

const LOG = "[PIPOCA_FACE_GUIDE]";

// Pinned to the installed package version — keep in sync with package.json.
const TASKS_VERSION = "0.10.35";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

export type GuidanceKind =
  | "loading"
  | "no_face"
  | "small"
  | "big"
  | "left"
  | "right"
  | "high"
  | "low"
  | "multi"
  | "turned"
  | "glasses_glare"
  | "perfect"
  | "unavailable";

export type Guidance = {
  kind: GuidanceKind;
  message: string;
  hint?: string;
  /** Mirrored normalized box [0..1] in preview space. null when no face. */
  box: { x: number; y: number; w: number; h: number } | null;
  /** ms the geometry has continuously been "perfect". */
  stableMs: number;
};

const MESSAGES: Record<GuidanceKind, { message: string; hint?: string }> = {
  loading:    { message: "INICIANDO GUIA DE ENQUADRAMENTO" },
  unavailable:{ message: "USE A MARCAÇÃO E O BOTÃO ABAIXO", hint: "Detecção indisponível agora." },
  no_face:    { message: "POSICIONE SEU ROSTO" },
  small:      { message: "APROXIME-SE UM POUCO" },
  big:        { message: "AFASTE-SE UM POUCO" },
  left:       { message: "CENTRALIZE SEU ROSTO" },
  right:      { message: "CENTRALIZE SEU ROSTO" },
  high:       { message: "ABAIXE UM POUCO" },
  low:        { message: "SUBA UM POUCO" },
  multi:      { message: "APENAS UMA PESSOA NA FOTO" },
  turned:     { message: "OLHE DIRETAMENTE PARA A CÂMERA" },
  glasses_glare: { message: "EVITE O REFLEXO NOS ÓCULOS", hint: "Incline o rosto ou retire os óculos por um instante." },
  perfect:    { message: "PERFEITO, FIQUE PARADO" },
};

// Tolerances tuned for camera at the TOP of a 1080×1920 totem.
const T = {
  minW: 0.24,   // face width >= 24% of preview
  maxW: 0.46,   // <= 46%
  cxMin: 0.40,  // horizontal center within [0.40, 0.60]
  cxMax: 0.60,
  cyMin: 0.58,  // vertical center within [0.58, 0.68] — bottom half (camera is top)
  cyMax: 0.68,
  hysteresis: 0.04,
  stableMsRequired: 900,
};

type FaceDetectorLike = {
  detectForVideo: (
    v: HTMLVideoElement,
    ts: number,
  ) => {
    detections: Array<{
      boundingBox?: { originX: number; originY: number; width: number; height: number };
      categories?: Array<{ score: number }>;
      keypoints?: Array<{ x: number; y: number; label?: string }>;
    }>;
  };
  close?: () => void;
};

let detectorPromise: Promise<FaceDetectorLike | null> | null = null;

async function loadDetector(): Promise<FaceDetectorLike | null> {
  if (detectorPromise) return detectorPromise;
  detectorPromise = (async () => {
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
      const det = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.5,
      });
      console.log(`${LOG} detector pronto (modelo CDN)`);
      return det as unknown as FaceDetectorLike;
    } catch (e) {
      console.warn(`${LOG} falhou ao carregar`, e);
      return null;
    }
  })();
  return detectorPromise;
}

export function useFaceGuidance(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
): Guidance {
  const [state, setState] = useState<Guidance>({
    kind: "loading",
    message: MESSAGES.loading.message,
    box: null,
    stableMs: 0,
  });
  const stableSinceRef = useRef<number | null>(null);
  const lastKindRef = useRef<GuidanceKind>("loading");

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let raf = 0;
    let intervalId: number | null = null;
    let det: FaceDetectorLike | null = null;

    loadDetector().then((d) => {
      if (cancelled) return;
      if (!d) {
        setState((s) => ({ ...s, kind: "unavailable", message: MESSAGES.unavailable.message, hint: MESSAGES.unavailable.hint }));
        return;
      }
      det = d;
      // Tick every ~180ms instead of per-frame.
      intervalId = window.setInterval(step, 180);
    });

    function classify(
      v: HTMLVideoElement,
      detections: ReturnType<FaceDetectorLike["detectForVideo"]>["detections"],
    ): GuidanceKind {
      if (!detections || detections.length === 0) return "no_face";
      if (detections.length > 1) return "multi";
      const d = detections[0];
      const bb = d.boundingBox;
      if (!bb || !v.videoWidth) return "no_face";
      const W = v.videoWidth;
      const H = v.videoHeight;
      // The preview is mirrored (scaleX(-1)); convert bbox to mirrored coords.
      const wRel = bb.width / W;
      // x center in *un-mirrored* video space, then flip
      const cxRaw = (bb.originX + bb.width / 2) / W;
      const cx = 1 - cxRaw;
      const cy = (bb.originY + bb.height / 2) / H;

      // Head pose heuristic from keypoints (eye + ear symmetry).
      if (d.keypoints && d.keypoints.length >= 6) {
        const re = d.keypoints[0];
        const le = d.keypoints[1];
        // ear keypoints are indices 4 (right) and 5 (left) on BlazeFace short
        const rEar = d.keypoints[4];
        const lEar = d.keypoints[5];
        if (re && le && rEar && lEar) {
          const eyeMid = (re.x + le.x) / 2;
          // distance from each ear to eye midpoint — symmetry ~ frontal
          const dR = Math.abs(rEar.x - eyeMid);
          const dL = Math.abs(lEar.x - eyeMid);
          const sym = Math.min(dR, dL) / Math.max(dR, dL || 1e-6);
          if (sym < 0.55) return "turned";
        }
      }

      if (wRel < T.minW) return "small";
      if (wRel > T.maxW) return "big";
      if (cx < T.cxMin) return "left";
      if (cx > T.cxMax) return "right";
      if (cy < T.cyMin) return "high";
      if (cy > T.cyMax) return "low";
      return "perfect";
    }

    function step() {
      if (cancelled || !det) return;
      const v = videoRef.current;
      if (!v || !v.videoWidth || v.readyState < 2) return;
      let result;
      try {
        result = det.detectForVideo(v, performance.now());
      } catch {
        return;
      }
      const kind = classify(v, result.detections);

      // Hysteresis: small fluctuations near borders shouldn't flip the label.
      const prev = lastKindRef.current;
      const stickyOk =
        kind === "perfect" || prev !== "perfect" ? kind : kind;
      lastKindRef.current = stickyOk;

      // Temporal smoothing of "perfect"
      const now = performance.now();
      if (stickyOk === "perfect") {
        if (stableSinceRef.current === null) stableSinceRef.current = now;
      } else {
        stableSinceRef.current = null;
      }
      const stableMs =
        stableSinceRef.current === null ? 0 : now - stableSinceRef.current;

      // Compute mirrored box for drawing in the preview.
      const det0 = result.detections[0];
      let box: Guidance["box"] = null;
      if (det0?.boundingBox && v.videoWidth) {
        const W = v.videoWidth;
        const H = v.videoHeight;
        const bb = det0.boundingBox;
        box = {
          x: 1 - (bb.originX + bb.width) / W,
          y: bb.originY / H,
          w: bb.width / W,
          h: bb.height / H,
        };
      }

      const m = MESSAGES[stickyOk] ?? MESSAGES.no_face;
      setState({ kind: stickyOk, message: m.message, hint: m.hint, box, stableMs });
    }

    return () => {
      cancelled = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      if (raf) cancelAnimationFrame(raf);
      // Do NOT close the detector — kept warm for retries within the session.
    };
  }, [active, videoRef]);

  return state;
}

export const FACE_GUIDE_STABLE_MS = T.stableMsRequired;
