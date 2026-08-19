/**
 * Composição determinística do cartão-postal final (Projeto Natal).
 *
 * Nenhuma IA participa desta etapa: a fotografia gerada é apenas recortada
 * (cover, sem deformar) e o restante do cartão é desenhado por código.
 *
 * Formato: 15 x 10 cm, paisagem (3:2), 300 dpi → 1772 x 1181 px.
 */

import { POSTCARD_PLACE_LABEL } from "./postcard-messages";
import { SPONSOR } from "./branding";

export const POSTCARD_W = 1772;
export const POSTCARD_H = 1181;

const INK = "#241A16";
const IVORY = "#F7F1E6";
const IVORY_DEEP = "#EFE6D6";
const DEEP_RED = "#7B1524";
const GOLD = "#B08A3E";
const GOLD_LIGHT = "#D8B978";

const SERIF = '"Cormorant Garamond", "Cormorant", Georgia, "Times New Roman", serif';
const SANS = '"DM Sans", "Helvetica Neue", Arial, sans-serif';

const PHOTO_RATIO = 0.585;
const FOOTER_H = 104;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("POSTCARD_IMAGE_LOAD_FAILED"));
    img.src = src;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const srcRatio = img.naturalWidth / img.naturalHeight;
  const dstRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (srcRatio > dstRatio) {
    sw = img.naturalHeight * dstRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / dstRatio;
    // Crop preferindo a parte superior/central (mantém rostos e o monumento).
    sy = (img.naturalHeight - sh) * 0.28;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** Desenha texto com espaçamento entre letras, centralizado em cx. */
function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  tracking: number,
) {
  const chars = [...text];
  const width =
    chars.reduce((acc, c) => acc + ctx.measureText(c).width, 0) + tracking * (chars.length - 1);
  let x = cx - width / 2;
  ctx.textAlign = "left";
  for (const c of chars) {
    ctx.fillText(c, x, y);
    x += ctx.measureText(c).width + tracking;
  }
  ctx.textAlign = "center";
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI / 4) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.34;
    const px = cx + Math.cos(angle) * rad;
    const py = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function snowflake(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.13);
  ctx.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6);
    ctx.lineTo(
      cx + Math.cos(a) * r * 0.6 + Math.cos(a + 0.9) * r * 0.28,
      cy + Math.sin(a) * r * 0.6 + Math.sin(a + 0.9) * r * 0.28,
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6);
    ctx.lineTo(
      cx + Math.cos(a) * r * 0.6 + Math.cos(a - 0.9) * r * 0.28,
      cy + Math.sin(a) * r * 0.6 + Math.sin(a - 0.9) * r * 0.28,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function sprig(ctx: CanvasRenderingContext2D, cx: number, cy: number, len: number, dir: number) {
  ctx.save();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - (len / 2) * dir, cy);
  ctx.lineTo(cx + (len / 2) * dir, cy);
  ctx.stroke();
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    const x = cx - (len / 2) * dir + len * t * dir;
    const s = len * 0.11 * (1 - t * 0.5);
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + s * dir, cy - s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + s * dir, cy + s);
    ctx.stroke();
  }
  ctx.restore();
}

async function ensureFonts() {
  try {
    if (typeof document !== "undefined" && "fonts" in document) {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    }
  } catch {
    /* noop */
  }
}

export type PostcardRender = {
  blob: Blob;
  objectUrl: string;
  width: number;
  height: number;
};

/** Compõe o cartão-postal final e devolve o JPEG pronto para uso. */
export async function renderPostcard(
  photoUrl: string,
  message: string,
): Promise<PostcardRender> {
  await ensureFonts();
  const photo = await loadImage(photoUrl);
  const sponsorLogo = SPONSOR.sponsorLogoUrl
    ? await loadImage(SPONSOR.sponsorLogoUrl).catch(() => null)
    : null;

  const canvas = document.createElement("canvas");
  canvas.width = POSTCARD_W;
  canvas.height = POSTCARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("POSTCARD_CANVAS_FAILED");

  // Fundo marfim
  ctx.fillStyle = IVORY;
  ctx.fillRect(0, 0, POSTCARD_W, POSTCARD_H);

  const bodyH = POSTCARD_H - FOOTER_H;
  const photoW = Math.round(POSTCARD_W * PHOTO_RATIO);

  // Fotografia (cover, sem deformação)
  drawCover(ctx, photo, 0, 0, photoW, bodyH);

  // Transição elegante entre foto e área textual
  const fade = ctx.createLinearGradient(photoW - 90, 0, photoW, 0);
  fade.addColorStop(0, "rgba(247,241,230,0)");
  fade.addColorStop(1, "rgba(247,241,230,0.92)");
  ctx.fillStyle = fade;
  ctx.fillRect(photoW - 90, 0, 90, bodyH);

  // Filete dourado vertical
  ctx.fillStyle = GOLD;
  ctx.fillRect(photoW - 3, 0, 3, bodyH);

  // Painel direito
  const panelX = photoW;
  const panelW = POSTCARD_W - photoW;
  const panelCx = panelX + panelW / 2;
  const panelGrad = ctx.createLinearGradient(panelX, 0, POSTCARD_W, bodyH);
  panelGrad.addColorStop(0, IVORY);
  panelGrad.addColorStop(1, IVORY_DEEP);
  ctx.fillStyle = panelGrad;
  ctx.fillRect(panelX, 0, panelW, bodyH);

  // Moldura interna discreta
  ctx.strokeStyle = "rgba(176,138,62,0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX + 40, 40, panelW - 80, bodyH - 80);

  // Ornamentos discretos
  snowflake(ctx, panelX + 78, 82, 20, "rgba(176,138,62,0.5)");
  snowflake(ctx, POSTCARD_W - 88, bodyH - 96, 15, "rgba(176,138,62,0.4)");
  star(ctx, POSTCARD_W - 84, 88, 11, "rgba(176,138,62,0.55)");

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Headline
  ctx.fillStyle = DEEP_RED;
  ctx.font = `600 108px ${SERIF}`;
  ctx.fillText("Feliz", panelCx, 246);

  ctx.font = `600 150px ${SERIF}`;
  const natalGrad = ctx.createLinearGradient(panelCx - 200, 0, panelCx + 200, 0);
  natalGrad.addColorStop(0, GOLD);
  natalGrad.addColorStop(0.5, GOLD_LIGHT);
  natalGrad.addColorStop(1, GOLD);
  ctx.fillStyle = natalGrad;
  drawTracked(ctx, "Natal", panelCx, 386, 6);

  // Ramo decorativo
  sprig(ctx, panelCx - 130, 436, 150, -1);
  sprig(ctx, panelCx + 130, 436, 150, 1);
  star(ctx, panelCx, 436, 13, GOLD);

  // Mensagem
  ctx.fillStyle = INK;
  ctx.font = `400 46px ${SERIF}`;
  const maxTextW = panelW - 180;
  let lines = wrapLines(ctx, message, maxTextW);
  if (lines.length > 4) {
    ctx.font = `400 40px ${SERIF}`;
    lines = wrapLines(ctx, message, maxTextW);
  }
  const lineH = lines.length > 4 ? 54 : 62;
  const blockTop = 560;
  lines.forEach((l, i) => {
    ctx.fillText(l, panelCx, blockTop + i * lineH);
  });

  // Identificação
  ctx.fillStyle = DEEP_RED;
  ctx.font = `500 24px ${SANS}`;
  drawTracked(ctx, POSTCARD_PLACE_LABEL, panelCx, bodyH - 96, 5);

  ctx.strokeStyle = "rgba(123,21,36,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(panelCx - 110, bodyH - 74);
  ctx.lineTo(panelCx + 110, bodyH - 74);
  ctx.stroke();

  // Rodapé vermelho premium
  const footY = bodyH;
  const footGrad = ctx.createLinearGradient(0, footY, POSTCARD_W, POSTCARD_H);
  footGrad.addColorStop(0, "#5E0F1B");
  footGrad.addColorStop(0.5, DEEP_RED);
  footGrad.addColorStop(1, "#5E0F1B");
  ctx.fillStyle = footGrad;
  ctx.fillRect(0, footY, POSTCARD_W, FOOTER_H);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, footY, POSTCARD_W, 4);

  // Área do patrocinador (fica elegante mesmo vazia)
  const footCy = footY + FOOTER_H / 2;
  if (sponsorLogo) {
    const maxH = 56;
    const scale = Math.min(maxH / sponsorLogo.naturalHeight, 380 / sponsorLogo.naturalWidth);
    const lw = sponsorLogo.naturalWidth * scale;
    const lh = sponsorLogo.naturalHeight * scale;
    ctx.drawImage(sponsorLogo, POSTCARD_W / 2 - lw / 2, footCy - lh / 2, lw, lh);
  } else if (SPONSOR.sponsorName) {
    ctx.fillStyle = "rgba(248,241,228,0.92)";
    ctx.font = `500 22px ${SANS}`;
    drawTracked(ctx, `OFERECIDO POR ${SPONSOR.sponsorName.toUpperCase()}`, POSTCARD_W / 2, footCy + 8, 4);
  } else {
    // Sem patrocinador: apenas ornamentos dourados discretos.
    star(ctx, POSTCARD_W / 2, footCy, 12, "rgba(216,185,120,0.9)");
    ctx.strokeStyle = "rgba(216,185,120,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(POSTCARD_W / 2 - 220, footCy);
    ctx.lineTo(POSTCARD_W / 2 - 30, footCy);
    ctx.moveTo(POSTCARD_W / 2 + 30, footCy);
    ctx.lineTo(POSTCARD_W / 2 + 220, footCy);
    ctx.stroke();
    snowflake(ctx, POSTCARD_W / 2 - 260, footCy, 12, "rgba(216,185,120,0.7)");
    snowflake(ctx, POSTCARD_W / 2 + 260, footCy, 12, "rgba(216,185,120,0.7)");
  }

  if (SPONSOR.institutionalMessage) {
    ctx.fillStyle = "rgba(248,241,228,0.8)";
    ctx.font = `400 18px ${SANS}`;
    ctx.fillText(SPONSOR.institutionalMessage, POSTCARD_W / 2, footY + FOOTER_H - 14);
  }

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("POSTCARD_BLOB_FAILED"))),
      "image/jpeg",
      0.94,
    ),
  );

  return {
    blob,
    objectUrl: URL.createObjectURL(blob),
    width: POSTCARD_W,
    height: POSTCARD_H,
  };
}
