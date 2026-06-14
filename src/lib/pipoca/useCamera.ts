import { useCallback, useEffect, useRef, useState } from "react";

export type CameraErrorKind = "permission" | "unavailable" | "unsupported" | null;

const LOG = "[PIPOCA_CAMERA]";

export function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [errorKind, setErrorKind] = useState<CameraErrorKind>(null);
  const [nonce, setNonce] = useState(0);

  const stop = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      // eslint-disable-next-line no-console
      console.log(`${LOG} câmera encerrada`);
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setErrorKind(null);
    setReady(false);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      console.warn(`${LOG} navegador incompatível`);
      setErrorKind("unsupported");
      return;
    }

    console.log(`${LOG} permissão solicitada`);
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1080 },
          height: { ideal: 1350 },
        },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.muted = true;
          v.playsInline = true;
          v.play().catch(() => {});
        }
        setReady(true);
        console.log(`${LOG} câmera iniciada`);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = (err as { name?: string })?.name ?? "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          console.warn(`${LOG} erro de permissão`, err);
          setErrorKind("permission");
        } else {
          console.warn(`${LOG} erro ao iniciar câmera`, err);
          setErrorKind("unavailable");
        }
      });

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, nonce, stop]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  const capture = useCallback(async (): Promise<{ blob: Blob; url: string } | null> => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Draw as-is (no mirror) so the saved image is not inverted.
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    console.log(`${LOG} foto capturada`, { size: blob.size });
    return { blob, url };
  }, []);

  return { videoRef, ready, errorKind, retry, stop, capture };
}
