// Shared MediaStream singleton so the camera can be pre-warmed while the
// Stories play. Reused across the two captures so the preview opens
// without a perceptible delay.

const LOG = "[PIPOCA_CAMERA_SHARED]";

type Status = "idle" | "pending" | "ready" | "denied" | "error" | "unsupported";

type Listener = () => void;

const state: {
  stream: MediaStream | null;
  status: Status;
  pendingPromise: Promise<MediaStream> | null;
} = {
  stream: null,
  status: "idle",
  pendingPromise: null,
};

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* noop */
    }
  });
}

export function getSharedStream(): MediaStream | null {
  // If tracks were stopped externally, treat as gone.
  if (state.stream && state.stream.getTracks().every((t) => t.readyState === "ended")) {
    state.stream = null;
    state.status = "idle";
  }
  return state.stream;
}

export function getSharedStatus(): Status {
  return state.status;
}

export function subscribeSharedCamera(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export async function prewarmCamera(): Promise<MediaStream | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    state.status = "unsupported";
    notify();
    return null;
  }
  const existing = getSharedStream();
  if (existing) return existing;
  if (state.pendingPromise) return state.pendingPromise;

  state.status = "pending";
  notify();
  console.log(`${LOG} solicitando permissão`);

  const p = navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1080 },
        height: { ideal: 1350 },
      },
    })
    .then((stream) => {
      state.stream = stream;
      state.status = "ready";
      state.pendingPromise = null;
      console.log(`${LOG} pronta`);
      notify();
      return stream;
    })
    .catch((err: unknown) => {
      const name = (err as { name?: string })?.name ?? "";
      state.pendingPromise = null;
      state.status =
        name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error";
      console.warn(`${LOG} falhou`, name);
      notify();
      throw err;
    });

  state.pendingPromise = p;
  return p.catch(() => null);
}

export function releaseSharedCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    console.log(`${LOG} encerrada`);
  }
  state.stream = null;
  state.status = "idle";
  state.pendingPromise = null;
  notify();
}
