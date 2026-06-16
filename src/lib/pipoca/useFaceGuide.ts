/**
 * Local face guidance for the identity camera. Uses MediaPipe Tasks Vision
 * (FaceDetector) loaded lazily from a public CDN. No frames leave the
 * device, no embeddings, no landmarks stored, no biometric persistence.
 * Only a single bounding-box per frame, used to coach framing.
 *
 * If the CDN is unreachable, the hook surfaces `detectorError` and the
 * camera screen falls back to a manual "TIRAR FOTO MANUALMENTE" button.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const LOG = "[PIPOCA_FACE_GUIDE]";

// Single canonical CDN. If it fails we surface an error and the UI falls
// back to a manual capture button — we do not silently keep retrying.
const VISION_BUNDLE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35";
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

export type GuideStatus =
  | "no_face"
  | "multi_face"
  | "too_far"
  | "too_close"
  | "off_left"
  | "off_right"
  | "off_high"
  | "off_low"
  | "head_turned"
  | "ok";

export type GuideMode = "identity" | "appearance";

export type FaceBox = {
  /** Normalized (0..1) relative to preview width/height. */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type GuideState = {
  status: GuideStatus;
  box: FaceBox | null;
  stableMs: number;
};

const HINTS: Record<GuideMode, Record<GuideStatus, string>> = {
  identity: {
    no_face: "POSICIONE SEU ROSTO",
    multi_face: "APENAS UMA PESSOA NA FOTO",
    too_far: "APROXIME-SE UM POUCO",
    too_close: "AFASTE-SE UM POUCO",
    off_left: "CENTRALIZE SEU ROSTO",
    off_right: "CENTRALIZE SEU ROSTO",
    off_high: "ABAIXE UM POUCO",
    off_low: "SUBA UM POUCO",
    head_turned: "OLHE DIRETAMENTE PARA A CÂMERA",
    ok: "PERFEITO, FIQUE PARADO",
  },
  appearance: {
    no_face: "POSICIONE-SE DIANTE DA CÂMERA",
    multi_face: "APENAS UMA PESSOA NA FOTO",
    too_far: "APROXIME-SE UM POUCO",
    too_close: "AFASTE-SE UM POUCO",
    off_left: "CENTRALIZE-SE",
    off_right: "CENTRALIZE-SE",
    off_high: "ABAIXE UM POUCO",
    off_low: "SUBA UM POUCO",
    head_turned: "OLHE DIRETAMENTE PARA A CÂMERA",
    ok: "PERFEITO, FIQUE PARADO",
  },
};

export function getGuideHint(status: GuideStatus, mode: GuideMode = "identity"): string {
  return HINTS[mode][status];
}

type Thresholds = {
  wMin: number;
  wMax: number;
  cxMin: number;
  cxMax: number;
  cyMin: number;
  cyMax: number;
  stableMs: number;
};

const THRESHOLDS: Record<GuideMode, Thresholds> = {
  // Close-up: face fills frame.
  identity: {
    wMin: 0.24,
    wMax: 0.46,
    cxMin: 0.42,
    cxMax: 0.58,
    cyMin: 0.42,
    cyMax: 0.62,
    stableMs: 1200,
  },
  // Medium shot: head + shoulders + torso to waist.
  // Face is smaller and sits higher in the frame.
  appearance: {
    wMin: 0.12,
    wMax: 0.24,
    cxMin: 0.4,
    cxMax: 0.6,
    cyMin: 0.26,
    cyMax: 0.44,
    stableMs: 1400,
  },
};

export function getStableMs(mode: GuideMode): number {
  return THRESHOLDS[mode].stableMs;
}

type DetectorAny = {
  detectForVideo: (
    v: HTMLVideoElement,
    ts: number,
  ) => {
    detections: Array<{
      boundingBox?: { originX: number; originY: number; width: number; height: number };
      keypoints?: Array<{ x: number; y: number }>;
    }>;
  };
  close?: () => void;
};

export function useFaceGuide(opts: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  mode?: GuideMode;
  /** Called with the most recent guide state on every detection tick. */
  onTick?: (s: GuideState) => void;
}) {
  const { videoRef, enabled, mode = "identity", onTick } = opts;
  const th = THRESHOLDS[mode];
  const [detectorReady, setDetectorReady] = useState(false);
  const [detectorError, setDetectorError] = useState<string | null>(null);
  const [guide, setGuide] = useState<GuideState>({
    status: "no_face",
    box: null,
    stableMs: 0,
  });
  const detectorRef = useRef<DetectorAny | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastOkSinceRef = useRef<number | null>(null);
  const lastStatusRef = useRef<GuideStatus>("no_face");
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        const mod = await import(/* @vite-ignore */ `${VISION_BUNDLE_CDN}/vision_bundle.mjs`);
        if (cancelled) return;
        const fileset = await mod.FilesetResolver.forVisionTasks(`${VISION_BUNDLE_CDN}/wasm`);
        if (cancelled) return;
        const det = await mod.FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL_URL },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.5,
        });
        if (cancelled) {
          det.close?.();
          return;
        }
        detectorRef.current = det as DetectorAny;
        setDetectorReady(true);
        console.log(`${LOG} detector pronto (CDN)`);
      } catch (err) {
        if (cancelled) return;
        console.warn(`${LOG} detector falhou`, err);
        setDetectorError(err instanceof Error ? err.message : "load_failed");
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        detectorRef.current?.close?.();
      } catch {
        /* noop */
      }
      detectorRef.current = null;
      setDetectorReady(false);
    };
  }, [enabled]);

  const evalFrame = useCallback(
    (now: number) => {
      const v = videoRef.current;
      const det = detectorRef.current;
      if (!enabled || !v || !det || v.videoWidth === 0 || v.videoHeight === 0) {
        rafRef.current = requestAnimationFrame(evalFrame);
        return;
      }
      // Throttle to ~5 fps.
      if (now - lastTickRef.current < 180) {
        rafRef.current = requestAnimationFrame(evalFrame);
        return;
      }
      lastTickRef.current = now;

      let nextStatus: GuideStatus = "no_face";
      let nextBox: FaceBox | null = null;
      try {
        const result = det.detectForVideo(v, now);
        const dets = result?.detections ?? [];
        if (dets.length > 1) {
          nextStatus = "multi_face";
        } else if (dets.length === 1) {
          const d = dets[0];
          const bb = d.boundingBox;
          if (bb) {
            const vw = v.videoWidth;
            const vh = v.videoHeight;
            const x = bb.originX / vw;
            const y = bb.originY / vh;
            const w = bb.width / vw;
            const h = bb.height / vh;
            // Mirror X for the user-facing camera that we render with scaleX(-1).
            const mx = 1 - (x + w);
            nextBox = { x: mx, y, w, h };
            const cx = mx + w / 2;
            const cy = y + h / 2;

            // Head pose via keypoint asymmetry: eyes-to-nose horizontal balance.
            // Keypoints: 0,1 = eyes, 2 = nose tip (per blaze_face short range).
            const kp = d.keypoints ?? [];
            let turned = false;
            if (kp.length >= 3) {
              const lex = 1 - kp[0].x; // mirror to match preview
              const rex = 1 - kp[1].x;
              const nx = 1 - kp[2].x;
              const eyeCx = (lex + rex) / 2;
              if (Math.abs(nx - eyeCx) > 0.05) turned = true;
            }

            if (w < W_MIN) nextStatus = "too_far";
            else if (w > W_MAX) nextStatus = "too_close";
            else if (cx < CX_MIN) nextStatus = "off_left";
            else if (cx > CX_MAX) nextStatus = "off_right";
            else if (cy < CY_MIN) nextStatus = "off_high";
            else if (cy > CY_MAX) nextStatus = "off_low";
            else if (turned) nextStatus = "head_turned";
            else nextStatus = "ok";
          }
        }
      } catch (err) {
        console.warn(`${LOG} detect erro`, err);
      }

      const t = performance.now();
      if (nextStatus === "ok") {
        if (lastOkSinceRef.current === null) lastOkSinceRef.current = t;
      } else {
        lastOkSinceRef.current = null;
      }
      const stableMs =
        nextStatus === "ok" && lastOkSinceRef.current !== null
          ? Math.round(t - lastOkSinceRef.current)
          : 0;

      // Hysteresis: only update text if status actually changed, or to refresh stableMs / box.
      const changed = nextStatus !== lastStatusRef.current;
      lastStatusRef.current = nextStatus;
      const s: GuideState = { status: nextStatus, box: nextBox, stableMs };
      setGuide(s);
      onTick?.(s);
      void changed; // (kept for future debouncing)

      rafRef.current = requestAnimationFrame(evalFrame);
    },
    [enabled, videoRef, onTick],
  );

  useEffect(() => {
    if (!enabled || !detectorReady) return;
    rafRef.current = requestAnimationFrame(evalFrame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastOkSinceRef.current = null;
      lastStatusRef.current = "no_face";
      setGuide({ status: "no_face", box: null, stableMs: 0 });
    };
  }, [enabled, detectorReady, evalFrame]);

  return { detectorReady, detectorError, guide };
}
