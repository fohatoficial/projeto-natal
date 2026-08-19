/**
 * TEMPLATE-MESTRE FECHADO do cartão-postal (Projeto Natal — Brasília).
 *
 * Nenhuma IA participa desta etapa. O layout é uma definição fixa: todas as
 * coordenadas, proporções, cores e ornamentos são declarados aqui. A
 * renderização apenas PREENCHE os espaços definidos com:
 *   - a fotografia gerada (máscara curva, crop cover, nunca deformada);
 *   - a mensagem do visitante;
 *   - o estilo tipográfico escolhido;
 *   - o divisor decorativo escolhido;
 *   - o branding do patrocinador, quando existir.
 *
 * Formato: 15 x 10 cm, paisagem (3:2), 300 dpi → 1772 x 1181 px.
 */

import {
  POSTCARD_PLACE_LABEL,
  type PostcardDividerStyle,
  type PostcardFontStyle,
} from "./postcard-messages";
import { SPONSOR } from "./branding";

/* ------------------------------------------------------------------ */
/* Definição fixa do template                                          */
/* ------------------------------------------------------------------ */

export const POSTCARD_W = 1772;
export const POSTCARD_H = 1181;

/** Paleta oficial do Projeto Natal. */
const BURGUNDY = "#8F1520";
const BURGUNDY_DEEP = "#671018";
const GOLD = "#C69A4B";
const GOLD_LIGHT = "#E3C489";
const IVORY = "#F6F0E5";
const OFFWHITE = "#FCF8F0";
const INK = "#2A1A16";

const FOOTER_H = 112;
/** ~58% fotografia / ~42% conteúdo. */
const PHOTO_EDGE = Math.round(POSTCARD_W * 0.585);
/** Profundidade da transição curva entre foto e painel. */
const CURVE_DEPTH = 68;

const FAMILY: Record<PostcardFontStyle, string> = {
  classic: '"Cormorant Garamond", Georgia, serif',
  script: '"Pinyon Script", "Cormorant Garamond", cursive',
  modern: '"DM Sans", system-ui, sans-serif',
};

/** Métricas tipográficas fixas por estilo (o usuário não escolhe tamanhos). */
const MESSAGE_METRICS: Record<
  PostcardFontStyle,
  { size: number; line: number; weight: string; min: number }
> = {
  classic: { size: 48, line: 64, weight: "400", min: 40 },
  script: { size: 62, line: 78, weight: "400", min: 50 },
  modern: { size: 38, line: 56, weight: "400", min: 32 },
};

const SANS = FAMILY.modern;
const SERIF = FAMILY.classic;
const SCRIPT = FAMILY.script;

const BODY_H = POSTCARD_H - FOOTER_H;
const PANEL_X = PHOTO_EDGE;
const PANEL_W = POSTCARD_W - PANEL_X;
const PANEL_CX = PANEL_X + PANEL_W / 2 + 14;

/* ------------------------------------------------------------------ */
/* Utilitários de desenho                                              */
/* ------------------------------------------------------------------ */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("POSTCARD_IMAGE_LOAD_FAILED"));
    img.src = src;
  });
}

/** Crop cover inteligente: preserva proporção e prioriza a parte superior. */
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
    sy = (img.naturalHeight - sh) * 0.26;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function tracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  spacing: number,
) {
  const chars = [...text];
  const width =
    chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
  let x = cx - width / 2;
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  for (const c of chars) {
    ctx.fillText(c, x, y);
    x += ctx.measureText(c).width + spacing;
  }
  ctx.textAlign = prev;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

/* -------------------- ornamentos pré-desenhados -------------------- */

function starGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.32;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function snowflakeGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
    for (const s of [0.9, -0.9]) {
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62);
      ctx.lineTo(
        cx + Math.cos(a) * r * 0.62 + Math.cos(a + s) * r * 0.26,
        cy + Math.sin(a) * r * 0.62 + Math.sin(a + s) * r * 0.26,
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}

function branchGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  len: number,
  dir: number,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - (len / 2) * dir, cy);
  ctx.lineTo(cx + (len / 2) * dir, cy);
  ctx.stroke();
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    const x = cx - (len / 2) * dir + len * t * dir;
    const s = len * 0.13 * (1 - t * 0.5);
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x, cy);
      ctx.lineTo(x + s * dir, cy + s * sign);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function berryGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.fillStyle = BURGUNDY;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function rule(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

/** Divisor decorativo escolhido pelo visitante — desenho fixo por identificador. */
function drawDivider(
  ctx: CanvasRenderingContext2D,
  style: PostcardDividerStyle,
  cx: number,
  cy: number,
  width: number,
  scale = 1,
) {
  const half = width / 2;
  const gap = 34 * scale;
  const gold = GOLD;
  if (style === "snowflake") {
    rule(ctx, cx - half, cx - gap, cy, "rgba(198,154,75,0.6)");
    rule(ctx, cx + gap, cx + half, cy, "rgba(198,154,75,0.6)");
    snowflakeGlyph(ctx, cx, cy, 18 * scale, gold);
  } else if (style === "star") {
    rule(ctx, cx - half, cx - gap, cy, "rgba(198,154,75,0.6)");
    rule(ctx, cx + gap, cx + half, cy, "rgba(198,154,75,0.6)");
    starGlyph(ctx, cx, cy, 15 * scale, gold);
  } else if (style === "branch") {
    branchGlyph(ctx, cx - gap - 6 * scale, cy, half - gap, -1, gold);
    branchGlyph(ctx, cx + gap + 6 * scale, cy, half - gap, 1, gold);
    berryGlyph(ctx, cx, cy, 7 * scale);
    berryGlyph(ctx, cx - 17 * scale, cy + 9 * scale, 5 * scale);
    berryGlyph(ctx, cx + 17 * scale, cy + 9 * scale, 5 * scale);
  } else {
    // ornamento geométrico dourado (losango duplo + filetes)
    rule(ctx, cx - half, cx - gap, cy, "rgba(198,154,75,0.6)");
    rule(ctx, cx + gap, cx + half, cy, "rgba(198,154,75,0.6)");
    ctx.save();
    ctx.strokeStyle = gold;
    ctx.fillStyle = gold;
    ctx.lineWidth = 1.6;
    const r = 15 * scale;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    const r2 = r * 0.42;
    ctx.moveTo(cx, cy - r2);
    ctx.lineTo(cx + r2, cy);
    ctx.lineTo(cx, cy + r2);
    ctx.lineTo(cx - r2, cy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Fontes                                                              */
/* ------------------------------------------------------------------ */

async function ensureFonts() {
  try {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    await Promise.race([
      Promise.all([
        document.fonts.load('400 60px "Cormorant Garamond"'),
        document.fonts.load('600 60px "Cormorant Garamond"'),
        document.fonts.load('400 60px "Pinyon Script"'),
        document.fonts.load('400 40px "DM Sans"'),
        document.fonts.ready,
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* noop */
  }
}

/* ------------------------------------------------------------------ */
/* Renderização do template                                            */
/* ------------------------------------------------------------------ */

export type PostcardOptions = {
  message: string;
  fontStyle: PostcardFontStyle;
  dividerStyle: PostcardDividerStyle;
};

export type PostcardRender = {
  blob: Blob;
  objectUrl: string;
  width: number;
  height: number;
};

/** Contorno da máscara curva da fotografia (borda direita côncava). */
function photoPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(PHOTO_EDGE, 0);
  ctx.bezierCurveTo(
    PHOTO_EDGE - CURVE_DEPTH,
    BODY_H * 0.3,
    PHOTO_EDGE - CURVE_DEPTH,
    BODY_H * 0.7,
    PHOTO_EDGE,
    BODY_H,
  );
  ctx.lineTo(0, BODY_H);
  ctx.closePath();
}

let cachedPhoto: { src: string; img: HTMLImageElement } | null = null;

/** Compõe o cartão-postal final preenchendo o template fechado. */
export async function renderPostcard(
  photoUrl: string,
  opts: PostcardOptions,
): Promise<PostcardRender> {
  await ensureFonts();

  const photo =
    cachedPhoto && cachedPhoto.src === photoUrl
      ? cachedPhoto.img
      : await loadImage(photoUrl).then((img) => {
          cachedPhoto = { src: photoUrl, img };
          return img;
        });

  const sponsorLogo = SPONSOR.sponsorLogoUrl
    ? await loadImage(SPONSOR.sponsorLogoUrl).catch(() => null)
    : null;

  const canvas = document.createElement("canvas");
  canvas.width = POSTCARD_W;
  canvas.height = POSTCARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("POSTCARD_CANVAS_FAILED");

  /* 1. Painel de conteúdo (marfim/off-white) */
  const panelGrad = ctx.createLinearGradient(PANEL_X, 0, POSTCARD_W, BODY_H);
  panelGrad.addColorStop(0, OFFWHITE);
  panelGrad.addColorStop(1, IVORY);
  ctx.fillStyle = panelGrad;
  ctx.fillRect(0, 0, POSTCARD_W, BODY_H);

  /* 2. Fotografia dentro da máscara curva */
  ctx.save();
  photoPath(ctx);
  ctx.clip();
  drawCover(ctx, photo, 0, 0, PHOTO_EDGE, BODY_H);
  ctx.restore();

  /* 3. Filete dourado acompanhando a curva */
  ctx.save();
  photoPath(ctx);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  /* 4. Moldura interna discreta do painel */
  ctx.strokeStyle = "rgba(198,154,75,0.35)";
  ctx.lineWidth = 1.6;
  ctx.strokeRect(PANEL_X + 52, 44, PANEL_W - 104, BODY_H - 88);

  /* 5. Ornamentos natalinos discretos (poucos, pré-desenhados) */
  snowflakeGlyph(ctx, PANEL_X + 96, 96, 17, "rgba(198,154,75,0.45)");
  starGlyph(ctx, POSTCARD_W - 92, 92, 10, "rgba(198,154,75,0.5)");
  snowflakeGlyph(ctx, POSTCARD_W - 96, BODY_H - 92, 13, "rgba(198,154,75,0.35)");

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  /* 6. Headline fixa: Feliz / Natal */
  ctx.fillStyle = BURGUNDY;
  ctx.font = `600 96px ${SERIF}`;
  tracked(ctx, "Feliz", PANEL_CX, 232, 4);

  const natalGrad = ctx.createLinearGradient(PANEL_CX - 220, 0, PANEL_CX + 220, 0);
  natalGrad.addColorStop(0, GOLD);
  natalGrad.addColorStop(0.5, GOLD_LIGHT);
  natalGrad.addColorStop(1, GOLD);
  ctx.fillStyle = natalGrad;
  ctx.font = `400 152px ${SCRIPT}`;
  ctx.fillText("Natal", PANEL_CX, 382);

  /* 7. Divisor escolhido */
  drawDivider(ctx, opts.dividerStyle, PANEL_CX, 452, PANEL_W - 240);

  /* 8. Mensagem do visitante */
  const m = MESSAGE_METRICS[opts.fontStyle];
  const maxTextW = PANEL_W - 200;
  ctx.fillStyle = INK;
  let size = m.size;
  ctx.font = `${m.weight} ${size}px ${FAMILY[opts.fontStyle]}`;
  let lines = wrapLines(ctx, opts.message, maxTextW);
  while (lines.length > 4 && size > m.min) {
    size -= 4;
    ctx.font = `${m.weight} ${size}px ${FAMILY[opts.fontStyle]}`;
    lines = wrapLines(ctx, opts.message, maxTextW);
  }
  const lineH = Math.round(m.line * (size / m.size));
  const blockCenter = (452 + (BODY_H - 176)) / 2 + 16;
  const start = blockCenter - ((lines.length - 1) * lineH) / 2;
  lines.forEach((l, i) => ctx.fillText(l, PANEL_CX, start + i * lineH));

  /* 9. Detalhe complementar + identificação do cenário */
  drawDivider(ctx, opts.dividerStyle, PANEL_CX, BODY_H - 168, PANEL_W - 380, 0.62);

  ctx.fillStyle = BURGUNDY;
  ctx.font = `500 24px ${SANS}`;
  tracked(ctx, POSTCARD_PLACE_LABEL, PANEL_CX, BODY_H - 96, 5);

  /* 10. Rodapé vermelho profundo (área de branding) */
  const footY = BODY_H;
  const footGrad = ctx.createLinearGradient(0, footY, POSTCARD_W, POSTCARD_H);
  footGrad.addColorStop(0, BURGUNDY_DEEP);
  footGrad.addColorStop(0.5, BURGUNDY);
  footGrad.addColorStop(1, BURGUNDY_DEEP);
  ctx.fillStyle = footGrad;
  ctx.fillRect(0, footY, POSTCARD_W, FOOTER_H);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, footY, POSTCARD_W, 4);

  const footCy = footY + FOOTER_H / 2;
  if (sponsorLogo) {
    const scale = Math.min(58 / sponsorLogo.naturalHeight, 380 / sponsorLogo.naturalWidth);
    const lw = sponsorLogo.naturalWidth * scale;
    const lh = sponsorLogo.naturalHeight * scale;
    ctx.drawImage(sponsorLogo, POSTCARD_W / 2 - lw / 2, footCy - lh / 2, lw, lh);
  } else if (SPONSOR.sponsorName) {
    ctx.fillStyle = "rgba(252,248,240,0.94)";
    ctx.font = `500 22px ${SANS}`;
    tracked(
      ctx,
      `OFERECIDO POR ${SPONSOR.sponsorName.toUpperCase()}`,
      POSTCARD_W / 2,
      footCy + 8,
      4,
    );
  } else {
    // Sem patrocinador o rodapé permanece completo: filetes + estrela dourada.
    starGlyph(ctx, POSTCARD_W / 2, footCy, 12, GOLD_LIGHT);
    rule(ctx, POSTCARD_W / 2 - 240, POSTCARD_W / 2 - 34, footCy, "rgba(227,196,137,0.55)");
    rule(ctx, POSTCARD_W / 2 + 34, POSTCARD_W / 2 + 240, footCy, "rgba(227,196,137,0.55)");
    snowflakeGlyph(ctx, POSTCARD_W / 2 - 282, footCy, 12, "rgba(227,196,137,0.6)");
    snowflakeGlyph(ctx, POSTCARD_W / 2 + 282, footCy, 12, "rgba(227,196,137,0.6)");
  }

  if (SPONSOR.institutionalMessage) {
    ctx.fillStyle = "rgba(252,248,240,0.82)";
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

  return { blob, objectUrl: URL.createObjectURL(blob), width: POSTCARD_W, height: POSTCARD_H };
}
