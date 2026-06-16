import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  src: string | null | undefined;
  alt: string;
  /** className applied to the <img> element. */
  className?: string;
  /** Inline style forwarded to the <img>. */
  style?: React.CSSProperties;
  /** Wrapper className (used for the placeholder/error overlay area). */
  wrapperClassName?: string;
  /** "cover" or "contain" → maps to object-fit. */
  fit?: "cover" | "contain";
  /** Label used in diagnostic logs (no PII). */
  logTag?: string;
  /** Whether to show a compact "Tentar novamente" button on error. Default true. */
  allowRetry?: boolean;
  /** If false, only render the <img> (no overlay/placeholder). */
  showStates?: boolean;
};

const IMG_LOG = "[PIPOCA_IMAGE]";

/**
 * Image with loading placeholder, error fallback, retry, and diagnostic logs.
 * Use for every image that MUST appear whole on the totem (poster, generated
 * photo, QR-adjacent assets, etc.). Decorative backgrounds can keep <img>.
 */
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
}: Props) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [bust, setBust] = useState(0);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setState(src ? "loading" : "error");
  }, [src, bust]);

  const onLoad = useCallback(() => {
    const w = imgRef.current?.naturalWidth ?? 0;
    const h = imgRef.current?.naturalHeight ?? 0;
    if (!w || !h) {
      console.warn(`${IMG_LOG} load error (empty)`, logTag ?? "");
      setState("error");
      return;
    }
    console.log(`${IMG_LOG} loaded ${w}x${h}`, logTag ?? "");
    setState("ready");
  }, [logTag]);

  const onError = useCallback(() => {
    console.warn(`${IMG_LOG} load error`, logTag ?? "");
    setState("error");
  }, [logTag]);

  const retry = useCallback(() => {
    setState("loading");
    setBust((b) => b + 1);
  }, []);

  const fitClass = fit === "cover" ? "object-cover" : "object-contain";

  return (
    <div
      className={`relative w-full h-full ${wrapperClassName}`}
      data-pipoca-image-state={state}
    >
      {src ? (
        <img
          ref={imgRef}
          // Bust forces a fresh fetch on retry without changing the canonical URL.
          src={bust > 0 ? `${src}${src.includes("?") ? "&" : "?"}__r=${bust}` : src}
          alt={alt}
          onLoad={onLoad}
          onError={onError}
          decoding="async"
          className={`block w-full h-full ${fitClass} ${
            state === "ready" ? "opacity-100" : "opacity-0"
          } transition-opacity duration-300 ${className}`}
          style={style}
        />
      ) : null}

      {showStates && state === "loading" && (
        <div
          aria-hidden
          className="absolute inset-0 grid place-items-center bg-white/[0.03]"
        >
          <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-gold border-r-gold/40 animate-spin" />
        </div>
      )}

      {showStates && state === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-black/60 p-4 text-center">
          <div className="flex flex-col items-center gap-3 max-w-[18rem]">
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/55">
              {alt}
            </span>
            <p className="font-display text-base sm:text-lg text-white leading-tight">
              NÃO FOI POSSÍVEL CARREGAR A IMAGEM
            </p>
            {allowRetry && src ? (
              <button
                type="button"
                onClick={retry}
                className="mt-1 text-[11px] uppercase tracking-[0.25em] text-gold border border-gold/60 rounded-md px-3 py-1.5 hover:bg-gold/10 active:scale-95 transition"
              >
                Tentar novamente
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
