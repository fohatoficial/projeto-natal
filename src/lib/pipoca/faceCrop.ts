// Deterministic identity face crop, generated 100% client-side from the
// existing identity capture. Does NOT touch the camera or the appearance
// photo. If anything fails we return the original blob and mark used=false
// so the caller can fallback silently.

export type FaceCropResult = {
  blob: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  used: boolean;
};

const MAX_DIM = 1024;
const CROP_W_RATIO = 0.6;
const CROP_H_RATIO = 0.55;
const CROP_Y_START = 0.12;
const JPEG_QUALITY = 0.92;

async function readDims(blob: Blob): Promise<{ w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(blob);
    const d = { w: bmp.width, h: bmp.height };
    (bmp as unknown as { close?: () => void }).close?.();
    return d;
  } catch {
    return { w: 0, h: 0 };
  }
}

export async function deriveIdentityFaceCrop(input: Blob): Promise<FaceCropResult> {
  let ow = 0;
  let oh = 0;
  try {
    const bmp = await createImageBitmap(input);
    ow = bmp.width;
    oh = bmp.height;
    if (!ow || !oh) throw new Error("dimensões inválidas");

    const cw = Math.max(1, Math.round(ow * CROP_W_RATIO));
    const ch = Math.max(1, Math.round(oh * CROP_H_RATIO));
    const cx = Math.max(0, Math.round((ow - cw) / 2));
    const cy = Math.max(0, Math.round(oh * CROP_Y_START));

    const scale = Math.min(1, MAX_DIM / Math.max(cw, ch));
    const outW = Math.max(1, Math.round(cw * scale));
    const outH = Math.max(1, Math.round(ch * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas context indisponível");

    ctx.drawImage(bmp, cx, cy, cw, ch, 0, 0, outW, outH);
    (bmp as unknown as { close?: () => void }).close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new Error("toBlob retornou vazio");

    return {
      blob,
      width: outW,
      height: outH,
      originalWidth: ow,
      originalHeight: oh,
      used: true,
    };
  } catch (err) {
    console.warn("[PIPOCA_FACE_CROP] fallback para captura original", {
      reason: err instanceof Error ? err.message : "erro desconhecido",
    });
    if (!ow || !oh) {
      const d = await readDims(input);
      ow = d.w;
      oh = d.h;
    }
    return {
      blob: input,
      width: ow,
      height: oh,
      originalWidth: ow,
      originalHeight: oh,
      used: false,
    };
  }
}
