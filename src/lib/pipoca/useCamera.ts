import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSharedStream,
  getSharedStatus,
  prewarmCamera,
  subscribeSharedCamera,
} from "./sharedCamera";

export type CameraErrorKind = "permission" | "unavailable" | "unsupported" | null;

const LOG = "[PIPOCA_CAMERA]";

/**
 * Acquires (or reuses) the shared MediaStream. Never stops the underlying
 * tracks on unmount — the stream is global and freed via
 * releaseSharedCamera() at the right points in the main flow.
 */
export function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState<boolean>(() => Boolean(getSharedStream()));
  const [errorKind, setErrorKind] = useState<CameraErrorKind>(null);
  const [nonce, setNonce] = useState(0);

  const attachToVideo = useCallback((stream: MediaStream) => {
    const v = videoRef.current;
    if (!v) return;
    if (v.srcObject !== stream) {
      v.srcObject = stream;
      v.muted = true;
      v.playsInline = true;
      v.play().catch(() => {});
    }
    const tracksLive = stream.getTracks().some((t) => t.readyState === "live");
    if (v.videoWidth > 0 && tracksLive) setReady(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setErrorKind(null);

    const tryAttach = () => {
      const s = getSharedStream();
      if (s) {
        attachToVideo(s);
        return true;
      }
      return false;
    };

    if (!tryAttach()) {
      prewarmCamera()
        .then((s) => {
          if (cancelled || !s) return;
          attachToVideo(s);
        })
        .catch(() => {
          if (cancelled) return;
          const status = getSharedStatus();
          if (status === "denied") setErrorKind("permission");
          else if (status === "unsupported") setErrorKind("unsupported");
          else setErrorKind("unavailable");
        });
    }

    const unsub = subscribeSharedCamera(() => {
      if (cancelled) return;
      const status = getSharedStatus();
      if (status === "ready") {
        tryAttach();
      } else if (status === "denied") {
        setErrorKind("permission");
      } else if (status === "unsupported") {
        setErrorKind("unsupported");
      } else if (status === "error") {
        setErrorKind("unavailable");
      }
    });

    const v = videoRef.current;
    const onMeta = () => {
      if (v && v.videoWidth > 0) setReady(true);
    };
    v?.addEventListener("loadedmetadata", onMeta);

    return () => {
      cancelled = true;
      unsub();
      v?.removeEventListener("loadedmetadata", onMeta);
      // Do NOT stop the shared stream here — it is reused across captures.
      if (videoRef.current) videoRef.current.srcObject = null;
      setReady(false);
    };
  }, [active, nonce, attachToVideo]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  const capture = useCallback(async (): Promise<{ blob: Blob; url: string } | null> => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return null;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    console.log(`${LOG} foto capturada`, { size: blob.size });
    return { blob, url };
  }, []);

  return { videoRef, ready, errorKind, retry, capture };
}
