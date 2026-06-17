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
    multi_face: "DEIXE APENAS UMA PESSOA NA ÁREA DA FOTO",
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
    multi_face: "DEIXE APENAS UMA PESSOA NA ÁREA DA FOTO",
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
  const lastOkSinceRef = useRef<number | null>(null);
  const ambiguousSinceRef = useRef<number | null>(null);
  const readyLoggedRef = useRef(false);

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
        if (!readyLoggedRef.current) {
          readyLoggedRef.current = true;
          console.log("[PIPOCA_FACE_DEBUG] detector-ready");
        }
      } catch (err) {
        if (cancelled) return;
        console.warn(`${LOG} detector falhou`, err);
        setDetectorError(err instanceof Error ? err.message : "load_failed");
      }
    })();

    return () => {
      cancelled = true;
      try {
        detectorRef.current?.close?.();
      } catch {
        /* noop */
      }
      detectorRef.current = null;
      setDetectorReady(false);
    };
  }, [enabled]);

  // ---- Simple rAF loop, throttled to ~180ms, one inference at a time. ----
  useEffect(() => {
    if (!enabled || !detectorReady) return;
    let cancelled = false;
    let raf = 0;
    let inflight = false;
    let lastRun = 0;
    let logCounter = 0;

    const loop = (now: number) => {
      if (cancelled) return;
      raf = requestAnimationFrame(loop);
      if (inflight) return;
      if (now - lastRun < 180) return;
      const v = videoRef.current;
      const det = detectorRef.current;
      if (!v || !det || v.videoWidth === 0 || v.videoHeight === 0 || v.paused || v.ended) return;
      lastRun = now;
      inflight = true;
      try {
        let nextStatus: GuideStatus = "no_face";
        let nextBox: FaceBox | null = null;
        const result = det.detectForVideo(v, now);
        const rawDets = result?.detections ?? [];
        const vw = v.videoWidth;
        const vh = v.videoHeight;

        // Normalize detections into mirrored-preview space with area/center/score.
        type Cand = {
          x: number; y: number; w: number; h: number;
          cx: number; cy: number; area: number; score: number;
          keypoints: Array<{ x: number; y: number }>;
        };
        const cands: Cand[] = [];
        for (const d of rawDets) {
          const bb = d.boundingBox;
          if (!bb) continue;
          const x = bb.originX / vw;
          const y = bb.originY / vh;
          const w = bb.width / vw;
          const h = bb.height / vh;
          const mx = 1 - (x + w);
          const cx = mx + w / 2;
          const cy = y + h / 2;
          const score =
            (d as unknown as { categories?: Array<{ score?: number }> })
              .categories?.[0]?.score ?? 1;
          cands.push({
            x: mx, y, w, h, cx, cy, area: w * h, score,
            keypoints: d.keypoints ?? [],
          });
        }

        // Deduplicate overlapping boxes (IoU > 0.35) — keep higher confidence.
        const iou = (a: Cand, b: Cand) => {
          const ix1 = Math.max(a.x, b.x);
          const iy1 = Math.max(a.y, b.y);
          const ix2 = Math.min(a.x + a.w, b.x + b.w);
          const iy2 = Math.min(a.y + a.h, b.y + b.h);
          const iw = Math.max(0, ix2 - ix1);
          const ih = Math.max(0, iy2 - iy1);
          const inter = iw * ih;
          const uni = a.area + b.area - inter;
          return uni > 0 ? inter / uni : 0;
        };
        const deduped: Cand[] = [];
        const sortedByScore = [...cands].sort((a, b) => b.score - a.score);
        for (const c of sortedByScore) {
          if (deduped.some((k) => iou(c, k) > 0.35)) continue;
          deduped.push(c);
        }

        // Select primary face: area (0.70) + center proximity (0.25) + confidence (0.05).
        let primary: Cand | null = null;
        let secondaryAreaRatio = 0;
        let ambiguousForeground = 0;
        if (deduped.length > 0) {
          const maxArea = Math.max(...deduped.map((c) => c.area));
          const scored = deduped.map((c) => {
            const areaScore = c.area / maxArea;
            const dist = Math.hypot(c.cx - 0.5, c.cy - 0.5);
            const centerScore = Math.max(0, 1 - dist / 0.7071);
            const confidenceScore = Math.min(1, Math.max(0, c.score));
            return {
              c,
              primaryScore: areaScore * 0.7 + centerScore * 0.25 + confidenceScore * 0.05,
            };
          });
          scored.sort((a, b) => b.primaryScore - a.primaryScore);
          primary = scored[0].c;

          // Count foreground faces that could be ambiguous with primary.
          for (const c of deduped) {
            if (c === primary) continue;
            const ratio = c.area / primary.area;
            const inCenter =
              c.cx >= 0.25 && c.cx <= 0.75 && c.cy >= 0.2 && c.cy <= 0.8;
            if (ratio >= 0.7 && inCenter) ambiguousForeground++;
            if (c === scored[1]?.c) secondaryAreaRatio = ratio;
          }
        }

        // Ambiguity requires sustained presence (>=600ms).
        const tNow = performance.now();
        let ambiguous = false;
        if (ambiguousForeground > 0) {
          if (ambiguousSinceRef.current === null) ambiguousSinceRef.current = tNow;
          if (tNow - ambiguousSinceRef.current >= 600) ambiguous = true;
        } else {
          ambiguousSinceRef.current = null;
        }

        if (ambiguous) {
          nextStatus = "multi_face";
          if (primary) nextBox = { x: primary.x, y: primary.y, w: primary.w, h: primary.h };
        } else if (primary) {
          const { w, cx, cy, keypoints: kp } = primary;
          nextBox = { x: primary.x, y: primary.y, w, h: primary.h };
          let turned = false;
          if (kp.length >= 3) {
            const lex = 1 - kp[0].x;
            const rex = 1 - kp[1].x;
            const nx = 1 - kp[2].x;
            const eyeCx = (lex + rex) / 2;
            if (Math.abs(nx - eyeCx) > 0.05) turned = true;
          }
          if (w < th.wMin) nextStatus = "too_far";
          else if (w > th.wMax) nextStatus = "too_close";
          else if (cx < th.cxMin) nextStatus = "off_left";
          else if (cx > th.cxMax) nextStatus = "off_right";
          else if (cy < th.cyMin) nextStatus = "off_high";
          else if (cy > th.cyMax) nextStatus = "off_low";
          else if (turned) nextStatus = "head_turned";
          else nextStatus = "ok";
        }

        const t = tNow;
        if (nextStatus === "ok") {
          if (lastOkSinceRef.current === null) lastOkSinceRef.current = t;
        } else {
          lastOkSinceRef.current = null;
        }
        const stableMs =
          nextStatus === "ok" && lastOkSinceRef.current !== null
            ? Math.round(t - lastOkSinceRef.current)
            : 0;

        const s: GuideState = { status: nextStatus, box: nextBox, stableMs };
        setGuide(s);
        onTick?.(s);

        if (++logCounter % 20 === 0) {
          console.log(
            `[PIPOCA_FACE_PRIMARY] rawFaceCount=${rawDets.length} dedupedFaceCount=${deduped.length} primaryArea=${primary ? primary.area.toFixed(3) : "0"} secondaryAreaRatio=${secondaryAreaRatio.toFixed(2)} primarySelected=${primary ? "yes" : "no"} ambiguousForegroundFaces=${ambiguousForeground} status=${nextStatus}`,
          );
        }
      } catch (err) {
        console.warn(`${LOG} detect erro`, err);
      } finally {
        inflight = false;
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      lastOkSinceRef.current = null;
      setGuide({ status: "no_face", box: null, stableMs: 0 });
    };
  }, [enabled, detectorReady, videoRef, onTick, th]);

  return { detectorReady, detectorError, guide };
}

