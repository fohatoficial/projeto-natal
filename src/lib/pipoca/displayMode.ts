// Explicit display mode controller for Pipoca & Cena.
//
// Activated via URL: ?display=totem  → adds data-display-mode="totem" on <html>
// Cleared via:       ?display=default
// Persisted in sessionStorage so the mode survives in-app navigation.
//
// Does NOT auto-detect by viewport, orientation or user-agent.

const STORAGE_KEY = "pipoca:display-mode";

export type DisplayMode = "totem" | "default";

function readStored(): DisplayMode | null {
  try {
    const v = window.sessionStorage.getItem(STORAGE_KEY);
    if (v === "totem" || v === "default") return v;
  } catch {}
  return null;
}

function writeStored(mode: DisplayMode | null) {
  try {
    if (mode === null) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, mode);
  } catch {}
}

function apply(mode: DisplayMode) {
  const root = document.documentElement;
  if (mode === "totem") root.setAttribute("data-display-mode", "totem");
  else root.removeAttribute("data-display-mode");
}

export function initDisplayMode(): DisplayMode {
  if (typeof window === "undefined") return "default";
  const params = new URLSearchParams(window.location.search);
  const urlMode = params.get("display");

  let mode: DisplayMode = "default";
  if (urlMode === "totem") {
    mode = "totem";
    writeStored("totem");
  } else if (urlMode === "default") {
    writeStored(null);
    mode = "default";
  } else {
    mode = readStored() ?? "default";
  }
  apply(mode);

  // Diagnostic log — no PII.
  try {
    const vv = window.visualViewport;
    // eslint-disable-next-line no-console
    console.log("[PIPOCA_DISPLAY_MODE]", {
      display_mode: mode,
      window_inner_width: window.innerWidth,
      window_inner_height: window.innerHeight,
      visual_viewport_width: vv?.width ?? null,
      visual_viewport_height: vv?.height ?? null,
      screen_width: window.screen?.width ?? null,
      screen_height: window.screen?.height ?? null,
    });
  } catch {}

  return mode;
}

export function isTotemDebug(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("display") === "totem" && params.get("debugViewport") === "1";
}

export function getDisplayMode(): DisplayMode {
  if (typeof document === "undefined") return "default";
  return document.documentElement.getAttribute("data-display-mode") === "totem"
    ? "totem"
    : "default";
}
