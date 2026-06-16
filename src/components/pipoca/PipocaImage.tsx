import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  wrapperClassName?: string;
  fit?: "cover" | "contain";
  logTag?: string;
  allowRetry?: boolean;
  showStates?: boolean;
  /** Eager + high-priority decode (use for above-the-fold posters). */
  eager?: boolean;
  /** Timeout in ms before forcing a single auto-retry. Default 8000. */
  timeoutMs?: number;
};

const IMG_LOG = "[PIPOCA_IMAGE]";
const POSTER_LOG = "[PIPOCA_POSTER]";

function appendCacheBuster(url: string, token: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}__cb=${token}`;
}

export function PipocaImage({
  src,
  alt,
  className = "",
  style,
  wrapperClassName = "",
  fit = "contain",
  logTag,
  allowRetry = true,
  showStates = true,
  eager = false,
  timeoutMs = 8000,
}: Props) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  // 0 = first try (original URL). 1 = auto-retry with cache-buster. 2+ = manual retries.
  const [attempt, setAttempt] = useState(0);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const isPoster = (logTag ?? "").startsWith("poster");
  const log = isPoster ? POSTER_LOG : IMG_LOG;

  // (Re)start loading state whenever src or attempt changes.
  useEffect(() => {
    setState(src ? "loading" : "error");
    if (src) console.log(`${log} loading`, logTag ?? "", `attempt=${attempt}`);
  }, [src, attempt, log, logTag]);

  // Watchdog timeout: if the image hasn't fired onLoad within timeoutMs,
  // force a single cache-busted retry, then surface an error.
  useEffect(() => {
    if (!src || state !== "loading") return;
    const t = window.setTimeout(() => {
      const img = imgRef.current;
      const complete = !!img?.complete;
      const w = img?.naturalWidth ?? 0;
      const h = img?.naturalHeight ?? 0;
      console.warn(
        `${log} timeout`,
        logTag ?? "",
        `attempt=${attempt} complete=${complete} ${w}x${h}`,
      );
      if (attempt === 0) {
        console.log(`${log} retry`, logTag ?? "", "auto-cache-bust");
        setAttempt(1);
      } else {
        setState("error");
        console.warn(`${log} error`, logTag ?? "", "timeout-after-retry");
      }
    }, timeoutMs);
    return () => window.clearTimeout(t);
  }, [src, state, attempt, timeoutMs, log, logTag]);

  const onLoad = useCallback(() => {
    const img = imgRef.current;
    const w = img?.naturalWidth ?? 0;
    const h = img?.naturalHeight ?? 0;
    if (!w || !h) {
      console.warn(`${log} error`, logTag ?? "", "empty-natural");
      setState("error");
      return;
    }
    console.log(`${log} loaded`, logTag ?? "", `${w}x${h} complete=${img?.complete}`);
    setState("ready");
  }, [log, logTag]);

  const onError = useCallback(() => {
    console.warn(`${log} error`, logTag ?? "", `attempt=${attempt}`);
    if (attempt === 0) {
      console.log(`${log} retry`, logTag ?? "", "auto-cache-bust-on-error");
      setAttempt(1);
    } else {
      setState("error");
    }
  }, [log, logTag, attempt]);

  const manualRetry = useCallback(() => {
    setState("loading");
    setAttempt((a) => a + 1);
  }, []);

  const fitClass = fit === "cover" ? "object-cover" : "object-contain";

  // BUILD_TS is stable per page load — used as the cache-buster token so the
  // totem's HTTP cache can't keep serving a stale/broken response.
  const buildToken =
    typeof window !== "undefined"
      ? (window as unknown as { __PIPOCA_BUILD_TOKEN?: string }).__PIPOCA_BUILD_TOKEN ??
        String(Date.now())
      : "0";

  const finalSrc = src
    ? attempt === 0
      ? src
      : appendCacheBuster(src, `${buildToken}-${attempt}`)
    : undefined;

  return (
    <div
      className={`relative w-full h-full ${wrapperClassName}`}
      data-pipoca-image-state={state}
    >
      {finalSrc ? (
        <img
          ref={imgRef}
          src={finalSrc}
          alt={alt}
          onLoad={onLoad}
          onError={onError}
          decoding="async"
          loading={eager ? "eager" : "lazy"}
          // React supports lower-case fetchpriority on <img>; cast for TS.
          {...({ fetchpriority: eager ? "high" : "auto" } as Record<string, string>)}
          className={`block w-full h-full ${fitClass} ${
            state === "ready" ? "opacity-100" : "opacity-0"
          } transition-opacity duration-300 ${className}`}
          style={style}
        />
      ) : null}

      {showStates && state === "loading" && (
        <div aria-hidden className="absolute inset-0 grid place-items-center bg-white/[0.03]">
          <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-gold border-r-gold/40 animate-spin" />
        </div>
      )}

      {showStates && state === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-black/60 p-4 text-center">
          <div className="flex flex-col items-center gap-3 max-w-[18rem]">
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/55">{alt}</span>
            <p className="font-display text-base sm:text-lg text-white leading-tight">
              NÃO FOI POSSÍVEL CARREGAR A IMAGEM
            </p>
            {allowRetry && src ? (
              <button
                type="button"
                onClick={manualRetry}
                className="mt-1 text-[11px] uppercase tracking-[0.25em] text-gold border border-gold/60 rounded-md px-3 py-1.5 hover:bg-gold/10 active:scale-95 transition"
              >
                TENTAR NOVAMENTE
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
