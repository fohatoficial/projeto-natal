// Canonical builder for the public visitor result-page URL. Centralised so
// the totem and any server caller agree on a single domain, regardless of
// where the code runs (kiosk Chrome, Preview, local dev). Never trust
// window.location.origin — the totem may boot on a Preview host.
//
// The QR code MUST encode exactly: https://pipocaecena.lovable.app/resultado/<uuid>

export const PIPOCA_PUBLIC_HOST = "https://pipocaecena.lovable.app";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidPublicToken(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function buildPublicResultUrl(publicToken: string): string {
  return `${PIPOCA_PUBLIC_HOST}/resultado/${publicToken.trim()}`;
}

/** Sanity-check a URL meant to be encoded into the totem QR code. */
export function isValidResultPageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v.startsWith(`${PIPOCA_PUBLIC_HOST}/resultado/`)) return false;
  if (v.includes("localhost") || v.includes("supabase.co") || v.includes("lovable-preview")) {
    return false;
  }
  const token = v.split("/resultado/")[1] ?? "";
  return isValidPublicToken(token);
}

/** Preload a poster image so the Story can start its timer immediately. */
export function prefetchImage(url: string | null | undefined): void {
  if (!url || typeof window === "undefined") return;
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    if ("decode" in img) {
      img.decode().catch(() => {});
    }
  } catch {
    /* noop */
  }
}
