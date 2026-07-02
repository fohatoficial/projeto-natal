import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GEN_LOG = "[PIPOCA_GENERATION]";
const LOG = "[PIPOCA_SERVER]";
const REPLICATE_MODEL = "black-forest-labs/flux-2-pro";
const ORIGINALS_BUCKET = "pipoca-visitor-originals";
const GENERATED_BUCKET = "pipoca-generated-scenes";
const SIGNED_DOWNLOAD_TTL = 60 * 30;
const SIGNED_REF_TTL = 60 * 30;
const PUBLIC_RESULT_BASE_URL = "https://pipocaecena.lovable.app".replace(/\/+$/, "");

const IDENTITY_NAME = "identity-close.jpg";
const IDENTITY_RAW_NAME = "identity-raw.jpg";
const APPEARANCE_NAME = "appearance-medium.jpg";
const CIRCO_SCENE_PACK_ID = "407b5a71-6f4d-4fb0-b14a-e8cccab25001";
const CIRCO_REFERENCE_IMAGE_URL =
  "https://brsplarbpylygnsakyjf.supabase.co/storage/v1/object/public/pipoca-reference-assets/scenes/o-grande-circo-mistico/backstage-circo-encantado-v1.png";
const CROSS_FILM_PROMPT_CONTAMINATION = "CROSS_FILM_PROMPT_CONTAMINATION";
const STYLE_PREP_ERROR_MESSAGE = "Não foi possível preparar o estilo deste filme. Tente novamente.";
const CIRCO_COLOR_INSTRUCTION =
  "Full color image. Rich deep reds, warm golds and theatrical lighting. Do not generate monochrome, grayscale or black and white.";
const CIRCO_NEGATIVE_PROMPT_ADDITIONS = [
  "monochrome",
  "grayscale",
  "black and white",
  "desaturated image",
  "Cinema Novo aesthetic",
  "sertão landscape",
  "cangaço clothing",
  "cangaceiro hat",
  "arid desert scenery",
];
const CIRCO_FORBIDDEN_POSITIVE_TERMS = [
  "Cinema Novo",
  "sertão",
  "cangaço",
  "cangaceiro",
  "monochrome",
  "black and white",
  "Glauber Rocha",
];

// Correção cirúrgica para "Deus e o Diabo na Terra do Sol": DEUS_LEGACY_MODE.
// - Layout de referências: 3 base + até 2 chapéus (sem identity-raw).
// - Image 1 = identidade facial (única fonte de verdade da face).
// - Image 2 = aparência geral (proporção, pose, cabelo, óculos, brincos, idade)
//   — nunca preserva a roupa atual da pessoa.
// - Image 3 = cenário (sertão + cruz).
// - Images 4/5 = chapéu de cangaceiro (design/formato apenas).
// - Preto e branco garantido (grayscale pós-processado + prompt) e estética Cinema Novo.
const DEUS_E_DIABO_FILM_SLUG = "deus-e-o-diabo-na-terra-do-sol";
const DEUS_E_DIABO_IDENTITY_RULES = [
  "DEUS_LEGACY_MODE — STRICT IDENTITY. Image 1 is the ONLY source of truth for the face and identity. Preserve exactly the visitor from Image 1: face shape, jawline, eye shape, eye spacing, eyebrow shape, nose shape, mouth shape, lip shape, skin tone, ethnicity and overall recognizable identity.",
  "Do not reinterpret or redesign the face. Do not generate a similar person. Do not blend, average or invent facial features. Do not blend facial features from Images 2, 3, 4 or 5 into the face. When any reference conflicts with Image 1, Image 1 always wins for the face and identity.",
  "Do not age up or age down the person. Do not masculinize or feminize the face. Keep the person clearly recognizable as the same real visitor. Exactly one person in the final image.",
];
const DEUS_E_DIABO_APPEARANCE_RULES = [
  "APPEARANCE (Image 2): use Image 2 ONLY for body proportions, posture, hair shape, glasses if present, small accessories (earrings), and approximate age range. Do NOT preserve the visitor's real-world clothing from Image 2. Image 2 must never override the face from Image 1.",
];
const DEUS_E_DIABO_FEMALE_RULES = [
  "FEMALE IDENTITY PROTECTION: if the visitor is a woman, she must remain clearly recognizable as the same woman. Preserve feminine facial identity. Do not masculinize female visitors. Do not age female visitors. Do not create a harsher, gaunter or more angular face.",
];
const DEUS_E_DIABO_WARDROBE_RULES = [
  "WARDROBE: completely replace the visitor's current clothing. Do NOT preserve any jacket, coat, hoodie, sweater, heavy blouse, t-shirt, polo, dress shirt, jeans or any modern clothing visible in the source photo. Wardrobe must become authentic cangaceiro / sertão / rural Brazilian northeastern clothing from the film universe: rustic, worn, natural, period-appropriate.",
  "If the visitor is a woman, keep feminine cangaceira clothing (rustic dress or blouse/skirt with worn natural fabrics, subtle leather details when appropriate). If the visitor is a man, keep masculine cangaceiro clothing (rough cotton shirt, weathered fabric, leather vest or rustic leather elements when appropriate, simple belt).",
];
const DEUS_E_DIABO_HAT_RULES = [
  "HAT: the visitor MUST wear a proper cangaceiro leather hat — half-moon / crescent silhouette, upward-curved side flaps, structured leather body, visible metallic ornaments / stars / decorative details, leather straps. Never a cowboy, western, peão or generic rural hat.",
  "Images 4 and 5 are prop references used ONLY to define the design, format, proportion and ornamentation of the cangaceiro hat. They must never override the face, must never alter identity, age, gender presentation, hair or the scene, and must never distort head size or facial proportions. The face remains the focal point; the hat is required but secondary to the face.",
];
const DEUS_E_DIABO_STYLE_RULES = [
  "SCENE (Image 3): dry sertão landscape, wooden cross visible in the composition, the environment and atmosphere of \"Deus e o Diabo na Terra do Sol\". Naturally integrate the visitor into this environment.",
  "STYLE: final image MUST be black and white. High contrast, Cinema Novo visual language, harsh natural sertão light, film-still feel. Avoid modern look. Avoid color output. Avoid muted color tints and warm sepia colorization that break the intended black-and-white result.",
];
const DEUS_E_DIABO_FRAMING_RULES = [
  "FRAMING: medium shot or medium close-up where the face is clearly visible, wardrobe is visible and the hat is visible, with the face as the focal point. Avoid extreme close-ups dominated by the hat.",
];
const DEUS_E_DIABO_NEGATIVE_ADDITIONS = [
  "color image",
  "colored photo",
  "muted color tint",
  "warm sepia colorization",
  "sepia tint that breaks black and white",
  "preserved modern clothing",
  "jacket from original photo",
  "coat from original photo",
  "hoodie",
  "sweater",
  "modern t-shirt",
  "modern polo",
  "modern dress shirt",
  "jeans",
  "contemporary blouse",
  "western cowboy look",
  "cowboy hat",
  "generic cowboy hat",
  "generic hat",
  "oversized hat",
  "hat dominating the image",
  "face hidden by hat",
  "fashion editorial styling",
  "face drift",
  "altered identity",
  "different person",
  "wrong person",
  "similar person",
  "aged face",
  "older face",
  "harsher face",
  "gaunt face",
  "masculinized female face",
  "feminized male face",
  "extra people",
  "extra faces",
  "duplicated person",
  "distorted face",
  "wrong hat",
  "missing cross",
  "missing sertão",
  "missing sertao",
  "deformed hands",
  "extra limbs",
  "cartoon",
  "text",
  "logo",
  "watermark",
];

// Prop references (e.g. cangaceiro hats) are scene-pack-driven via the
// `prop_references.hat_reference_images` array in the scene pack `prompt`
// JSON. There is no global toggle and no film-wide fallback URL — a scene
// pack without explicit prop references sends exactly 3 base images
// (identity, appearance, scene).



function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

function buildResultPageUrl(publicToken: string): string {
  return `${PUBLIC_RESULT_BASE_URL}/resultado/${encodeURIComponent(publicToken)}`;
}

const PQ_LOG = "[PIPOCA_PRINT_QUEUE_AUTO]";

const PRINT_CAPITAL_LOG = "[PIPOCA_PRINT_CAPITAL]";

async function resolveCapitalForGeneration(
  supabaseAdmin: any,
  generationId: string,
): Promise<{ capitalId: string | null; mismatch: boolean }> {
  const { data: gen } = await supabaseAdmin
    .from("pipoca_generations")
    .select("id, capital_id, capture_id")
    .eq("id", generationId)
    .maybeSingle();
  if (!gen) return { capitalId: null, mismatch: false };
  let captureCapitalId: string | null = null;
  if (gen.capture_id) {
    const { data: cap } = await supabaseAdmin
      .from("pipoca_captures")
      .select("capital_id")
      .eq("id", gen.capture_id)
      .maybeSingle();
    captureCapitalId = (cap?.capital_id as string | null) ?? null;
  }
  const genCapitalId = (gen.capital_id as string | null) ?? null;
  if (genCapitalId && captureCapitalId && genCapitalId !== captureCapitalId) {
    console.warn(PRINT_CAPITAL_LOG, "PRINT_CAPITAL_MISMATCH", {
      generation_id: generationId,
      generation_capital_id: genCapitalId,
      capture_capital_id: captureCapitalId,
    });
    return { capitalId: null, mismatch: true };
  }
  const resolved = genCapitalId ?? captureCapitalId;
  if (resolved) return { capitalId: resolved, mismatch: false };
  const { data: unknown } = await supabaseAdmin
    .from("pipoca_capitals")
    .select("id")
    .eq("slug", "capital-desconhecida")
    .maybeSingle();
  return { capitalId: (unknown?.id as string | null) ?? null, mismatch: false };
}

async function ensurePrintQueueEntry(
  supabaseAdmin: any,
  generationId: string,
  sessionId: string | null,
): Promise<{ queueId: string | null; alreadyExists: boolean; error?: string }> {
  try {
    const { data: existing } = await supabaseAdmin
      .from("pipoca_print_queue")
      .select("id, status")
      .eq("generation_id", generationId)
      .in("status", ["pending", "printing"])
      .maybeSingle();
    if (existing) {
      console.log(PQ_LOG, {
        generationId,
        outputAvailable: true,
        queueCreated: false,
        alreadyExists: true,
      });
      return { queueId: existing.id, alreadyExists: true };
    }

    let visitorId: string | null = null;
    if (sessionId) {
      const { data: session } = await supabaseAdmin
        .from("pipoca_sessions")
        .select("visitor_id")
        .eq("id", sessionId)
        .maybeSingle();
      visitorId = session?.visitor_id ?? null;
    }
    if (!visitorId) {
      console.warn(PQ_LOG, {
        generationId,
        outputAvailable: true,
        queueCreated: false,
        alreadyExists: false,
        errorCode: "no_visitor",
      });
      return { queueId: null, alreadyExists: false, error: "no_visitor" };
    }

    const { capitalId, mismatch } = await resolveCapitalForGeneration(supabaseAdmin, generationId);
    if (mismatch) {
      return { queueId: null, alreadyExists: false, error: "capital_mismatch" };
    }
    if (!capitalId) {
      console.warn(PQ_LOG, {
        generationId,
        outputAvailable: true,
        queueCreated: false,
        alreadyExists: false,
        errorCode: "no_capital",
      });
      return { queueId: null, alreadyExists: false, error: "no_capital" };
    }

    const { data: inserted, error: iErr } = await supabaseAdmin
      .from("pipoca_print_queue")
      .insert({
        visitor_id: visitorId,
        generation_id: generationId,
        status: "pending",
        capital_id: capitalId,
      })
      .select("id")
      .single();
    if (iErr) {
      if (iErr.code === "23505") {
        const { data: again } = await supabaseAdmin
          .from("pipoca_print_queue")
          .select("id")
          .eq("generation_id", generationId)
          .in("status", ["pending", "printing"])
          .maybeSingle();
        console.log(PQ_LOG, {
          generationId,
          outputAvailable: true,
          queueCreated: false,
          alreadyExists: true,
          retry: true,
        });
        return { queueId: again?.id ?? null, alreadyExists: true };
      }
      console.warn(PQ_LOG, {
        generationId,
        outputAvailable: true,
        queueCreated: false,
        alreadyExists: false,
        errorCode: iErr.code ?? "insert_failed",
      });
      return { queueId: null, alreadyExists: false, error: iErr.code ?? "insert_failed" };
    }
    console.log(PQ_LOG, {
      generationId,
      outputAvailable: true,
      queueCreated: true,
      alreadyExists: false,
    });
    console.log(PRINT_CAPITAL_LOG, "PRINT_CAPITAL_ATTACHED", {
      queue_id: inserted.id,
      generation_id: generationId,
      capital_id: capitalId,
    });
    return { queueId: inserted.id, alreadyExists: false };
  } catch (e) {
    console.warn(PQ_LOG, {
      generationId,
      outputAvailable: true,
      queueCreated: false,
      alreadyExists: false,
      errorCode: "exception",
    });
    return { queueId: null, alreadyExists: false, error: "exception" };
  }
}

async function ensurePublicResultFields(
  supabaseAdmin: any,
  gen: {
    id: string;
    status: string;
    public_token: string | null;
    result_page_url?: string | null;
    final_image_path: string | null;
  },
): Promise<{ publicToken: string; resultPageUrl: string }> {
  if (gen.status !== "completed") throw new Error("Geração ainda não concluída");
  if (!gen.final_image_path) throw new Error("Imagem final indisponível");

  const publicToken = isUuid(gen.public_token) ? gen.public_token.trim() : crypto.randomUUID();
  const resultPageUrl = buildResultPageUrl(publicToken);

  if (gen.public_token !== publicToken || gen.result_page_url !== resultPageUrl) {
    const { error } = await supabaseAdmin
      .from("pipoca_generations")
      .update({ public_token: publicToken, result_page_url: resultPageUrl })
      .eq("id", gen.id);
    if (error) throw new Error("Falha ao salvar URL pública");
  }

  return { publicToken, resultPageUrl };
}

type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
  metrics?: { predict_time?: number } | null;
};

type ScenePackForGeneration = {
  id: string;
  film_id: string;
  scene_name: string | null;
  prompt: unknown;
  negative_prompt: string | null;
  reference_image_url: string | null;
  visual_style: string | null;
  color_mode: string | null;
  framing: string | null;
  pose_type: string | null;
};

type PromptDiagnostics = {
  contains_monochrome: boolean;
  contains_sertao: boolean;
  contains_cangaco: boolean;
  contains_cinema_novo: boolean;
  contains_circo: boolean;
  prompt_contamination_detected: boolean;
};

type BuiltPrompt = {
  promptText: string;
  positivePromptText: string;
  negativePromptText: string;
  diagnostics: PromptDiagnostics;
  shouldApplyNeutralGrayscale: boolean;
  sectionLabels: string[];
  extractedNegativeCount: number;
};

function getReplicateToken(): string {
  const t = process.env.PIPOCA_REPLICATE_API_TOKEN;
  if (!t) throw new Error("PIPOCA_REPLICATE_API_TOKEN ausente");
  return t;
}

/**
 * Neutral, deterministic black & white finish.
 *
 * No sepia. No earthy / brown / yellow / golden toning. Pure luminance
 * grayscale with a very mild contrast lift (~+8). Geometry, sharpness and
 * face are not touched. JPEG q=94. On any failure we keep the raw model
 * output so the visitor still gets an image.
 */
async function applyNeutralGrayscale(inputBytes: Uint8Array): Promise<Uint8Array> {
  const photon = await import("@cf-wasm/photon");
  const img = photon.PhotonImage.new_from_byteslice(inputBytes);
  try {
    photon.grayscale(img);
    try {
      (photon as any).adjust_contrast?.(img, 8.0);
    } catch {
      // contrast is optional — pure grayscale is still acceptable
    }
    return img.get_bytes_jpeg(94);
  } finally {
    img.free();
  }
}

/* ---------- Prompt builder ---------- */

function parseScenePackPrompt(rawPrompt: unknown): unknown {
  if (typeof rawPrompt === "string") {
    const trimmed = rawPrompt.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return rawPrompt;
      }
    }
    return rawPrompt;
  }
  return rawPrompt;
}

function extractHatReferenceUrls(parsedPrompt: unknown): string[] {
  if (!parsedPrompt || typeof parsedPrompt !== "object") return [];
  const obj = parsedPrompt as Record<string, unknown>;
  const props = obj["prop_references"];
  if (!props || typeof props !== "object") return [];
  const raw = (props as Record<string, unknown>)["hat_reference_images"];
  if (!Array.isArray(raw)) return [];
  const urls: string[] = [];
  for (const v of raw) {
    if (typeof v === "string") {
      const t = v.trim();
      if (t && /^https?:\/\//i.test(t)) urls.push(t);
    }
    if (urls.length >= 2) break;
  }
  return urls;
}

function extractHatUsage(parsedPrompt: unknown): string | null {
  if (!parsedPrompt || typeof parsedPrompt !== "object") return null;
  const obj = parsedPrompt as Record<string, unknown>;
  const props = obj["prop_references"];
  if (!props || typeof props !== "object") return null;
  const usage = (props as Record<string, unknown>)["hat_usage"];
  return typeof usage === "string" && usage.trim() ? usage.trim() : null;
}

type PromptSection = { label: string; body: string };
type ExtractedPrompt = { sections: PromptSection[]; forbidden: string[] };

const NEGATIVE_KEYS = new Set([
  "forbidden",
  "negative",
  "negative_prompt",
  "avoid",
  "prohibited",
  "exclusions",
  "do_not",
  "must_not",
]);
const STRUCTURAL_SKIP_KEYS = new Set([
  "hat_reference_images",
  "prop_references",
  "reference_roles",
  "hat_usage",
]);
const SECTION_LABELS: Record<string, string> = {
  scene: "SCENE",
  subject: "SUBJECT",
  wardrobe: "WARDROBE",
  environment: "ENVIRONMENT",
  style: "STYLE",
  composition: "COMPOSITION",
  final_result: "FINAL RESULT",
};

function labelFor(key: string): string {
  return SECTION_LABELS[key] ?? key.replace(/[_-]+/g, " ").toUpperCase();
}

function pushUnique(list: string[], seen: Set<string>, value: string) {
  const key = value.toLocaleLowerCase("pt-BR");
  if (seen.has(key)) return;
  seen.add(key);
  list.push(value);
}

function collectStrings(
  value: unknown,
  positive: string[],
  positiveSeen: Set<string>,
  negative: string[],
  negativeSeen: Set<string>,
  insideNegative: boolean,
) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || /^https?:\/\//i.test(trimmed)) return;
    if (insideNegative) pushUnique(negative, negativeSeen, trimmed);
    else pushUnique(positive, positiveSeen, trimmed);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, positive, positiveSeen, negative, negativeSeen, insideNegative);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (STRUCTURAL_SKIP_KEYS.has(k)) continue;
      const nextNeg = insideNegative || NEGATIVE_KEYS.has(k);
      collectStrings(v, positive, positiveSeen, negative, negativeSeen, nextNeg);
    }
  }
}

function extractPromptFields(parsedPrompt: unknown): ExtractedPrompt {
  if (typeof parsedPrompt === "string") {
    const t = parsedPrompt.trim();
    return { sections: t ? [{ label: "SCENE PACK", body: t }] : [], forbidden: [] };
  }
  if (!parsedPrompt || typeof parsedPrompt !== "object" || Array.isArray(parsedPrompt)) {
    return { sections: [], forbidden: [] };
  }
  const sections: PromptSection[] = [];
  const forbidden: string[] = [];
  const forbiddenSeen = new Set<string>();

  for (const [key, value] of Object.entries(parsedPrompt as Record<string, unknown>)) {
    if (STRUCTURAL_SKIP_KEYS.has(key)) continue;
    const positive: string[] = [];
    const posSeen = new Set<string>();
    collectStrings(value, positive, posSeen, forbidden, forbiddenSeen, NEGATIVE_KEYS.has(key));
    if (!NEGATIVE_KEYS.has(key) && positive.length > 0) {
      sections.push({ label: labelFor(key), body: positive.join(" ") });
    }
  }
  return { sections, forbidden };
}

function safeFilenameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split("/").filter(Boolean).pop() ?? "") || null;
  } catch {
    const clean = url.split("?")[0]?.split("#")[0] ?? "";
    return clean.split("/").filter(Boolean).pop() || null;
  }
}

function containsAny(text: string, terms: string[]): boolean {
  const normalized = text.toLocaleLowerCase("pt-BR");
  return terms.some((term) => normalized.includes(term.toLocaleLowerCase("pt-BR")));
}

function analyzePrompt(positivePromptText: string, scenePackId: string): PromptDiagnostics {
  const inspectedText = scenePackId === CIRCO_SCENE_PACK_ID
    ? positivePromptText.replace(CIRCO_COLOR_INSTRUCTION, "")
    : positivePromptText;
  const contains_monochrome = containsAny(inspectedText, [
    "monochrome",
    "black and white",
    "grayscale",
    "preto e branco",
    "monocromático",
    "monocromatico",
  ]);
  const contains_sertao = containsAny(inspectedText, ["sertão", "sertao"]);
  const contains_cangaco = containsAny(inspectedText, ["cangaço", "cangaco", "cangaceiro"]);
  const contains_cinema_novo = containsAny(inspectedText, ["Cinema Novo", "Glauber Rocha"]);
  const contains_circo = containsAny(inspectedText, ["circo", "circense", "cortinas", "teatral"]);
  return {
    contains_monochrome,
    contains_sertao,
    contains_cangaco,
    contains_cinema_novo,
    contains_circo,
    prompt_contamination_detected:
      scenePackId === CIRCO_SCENE_PACK_ID &&
      containsAny(inspectedText, CIRCO_FORBIDDEN_POSITIVE_TERMS),
  };
}

function buildPromptText(
  scenePack: ScenePackForGeneration,
  hasHatRef = false,
  filmSlug: string | null = null,
  hasSecondaryIdentity = false,
): BuiltPrompt {
  const parsed = parseScenePackPrompt(scenePack.prompt);
  const parts: string[] = [];
  const isDeusEDiabo = filmSlug === DEUS_E_DIABO_FILM_SLUG;
  const useSecondaryIdentity = isDeusEDiabo && hasSecondaryIdentity;

  // Reference-role declarations. The Deus e o Diabo path uses a distinct
  // 6-image layout (face crop + uncropped identity as dual identity refs);
  // all other films continue with the classic 3+prop layout.
  if (useSecondaryIdentity) {
    parts.push(
      "Image 1 is the PRIMARY FACE IDENTITY REFERENCE (close face crop of the visitor) and has the highest priority for facial identity.",
    );
    parts.push(
      "Image 2 is the SECONDARY IDENTITY REFERENCE (the original uncropped identity photo of the visitor). Use it for full-head shape, hair, apparent age and overall recognizability.",
    );
    parts.push(
      "Images 1 and 2 together are the ONLY source of truth for the face, identity, hair, age, gender presentation and ethnicity.",
    );
    parts.push(
      "Image 3 is the APPEARANCE / BODY / CLOTHING reference. Use it only for body proportions, posture and general body appearance.",
    );
    parts.push(
      "Image 4 is the SCENE / ENVIRONMENT / COMPOSITION reference. Use it only for the environment, composition, lighting direction and atmosphere.",
    );
    if (hasHatRef) {
      parts.push(
        "Images 5 and 6 are LOW-PRIORITY prop references used ONLY for the design and fit of the cangaceiro hat (Image 5 = front, Image 6 = side). They must never influence facial identity, age, gender presentation, hairstyle, expression, body, clothing, pose, camera distance, lighting or environment.",
      );
    }
  } else {
    parts.push(
      "Image 1 is the PRIMARY FACE IDENTITY REFERENCE and has the highest priority. It is a close, guided portrait of the visitor and is the absolute source of truth for facial identity.",
    );
    parts.push(
      "Use Image 1 for face shape, eyes, nose, mouth, jawline, skin tone, hair, facial hair (beard/stubble), eyebrows, glasses if present, apparent age, and overall recognizable identity.",
    );
    parts.push(
      "Image 2 is the FULL APPEARANCE, CLOTHING AND BODY PROPORTION REFERENCE. It shows the same visitor framed from the waist up.",
    );
    parts.push(
      "Use Image 2 for posture, body proportions, full hair shape, shoulders, torso, clothing texture, and general appearance — but always defer to Image 1 for the face itself.",
    );
    parts.push(
      "Image 3 is the PRIMARY ENVIRONMENT, COMPOSITION AND FRAMING REFERENCE. Use it only for the selected scene pack environment, composition, lighting direction and atmosphere.",
    );
    if (hasHatRef) {
      parts.push(
        "Images 4 and 5 are low-priority prop design and fit references only, used only when the selected scene pack explicitly provides them.",
      );
      parts.push(
        "Use prop references only to guide the explicit prop from the selected scene pack. They must not influence facial identity, body proportions, clothing, pose, camera distance, lighting or environment.",
      );
      parts.push(
        "Any prop must remain proportional to the visitor and naturally integrated into the costume, without dominating the image, covering the face or changing the framing.",
      );
    }
  }


  // 2. Hard identity rules
  parts.push(
    "HARD RULES (highest priority): facial identity has absolute priority. The visitor's facial identity must remain the highest priority and must not be altered by any other reference. Do NOT redraw the face. Do NOT blend the face with another person. Do NOT stylize the face to match the scene.",
  );
  parts.push(
    "Exactly one person in the final image, and that person must be clearly recognizable as the visitor — not a similar person.",
  );
  parts.push(
    "Wardrobe and environment must adapt to fit the visitor. The visitor's face must NOT be altered to fit the style.",
  );
  parts.push(
    useSecondaryIdentity
      ? "The visitor must be naturally integrated into the environment from Image 4 — no pasted look, no cutout, no flat overlay. Body scale, posture, light on the skin, contact shadows and depth of field must match Image 4."
      : "The visitor must be naturally integrated into the environment from Image 3 — no pasted look, no cutout, no flat overlay. Body scale, posture, light on the skin, contact shadows and depth of field must match Image 3.",
  );

  // Film-specific hardening for "Deus e o Diabo na Terra do Sol".
  if (isDeusEDiabo) {
    for (const rule of DEUS_E_DIABO_IDENTITY_RULES) parts.push(rule);
    for (const rule of DEUS_E_DIABO_FEMALE_RULES) parts.push(rule);
    for (const rule of DEUS_E_DIABO_WARDROBE_RULES) parts.push(rule);
    for (const rule of DEUS_E_DIABO_HAT_RULES) parts.push(rule);
    for (const rule of DEUS_E_DIABO_FRAMING_RULES) parts.push(rule);
  }

  const hatUsage = extractHatUsage(parsed);
  if (hatUsage && !isDeusEDiabo) parts.push(`Hat usage notes from scene pack: ${hatUsage}.`);

  // 3. Neutral composition
  parts.push(
    "Vertical 4:5 framing, cinematic composition, shallow depth of field. The visitor anchored in the environment as if captured in a film still.",
  );
  parts.push(
    "FRAMING: keep the selected scene pack framing visible and legible. Avoid close-up, very tight framing, extreme close-up, or overly-approximated portrait that cuts the costume and erases the environment.",
  );
  parts.push(
    useSecondaryIdentity
      ? "HIERARCHY: Images 1 and 2 (face and identity) = highest priority. Image 3 (appearance, body, clothing) = second priority. Image 4 (environment, composition) = third priority. Images 5 and 6 (hat prop references) are the lowest priority and must never replace or weaken Images 1, 2, 3 or 4."
      : "HIERARCHY: Image 1 (face identity) = highest priority. Image 2 (appearance, body, clothing) = second priority. Image 3 (environment, composition) = third priority. Additional prop images, when present, are the lowest priority and must never replace or weaken Images 1, 2 or 3.",
  );

  // Absolute identity conflict rule.
  parts.push(
    useSecondaryIdentity
      ? "When any visual reference conflicts with Images 1 and 2, Images 1 and 2 always win for the face, hair, age, gender presentation and identity."
      : "When any visual reference conflicts with Image 1, Image 1 always wins for the face, hair, age and identity.",
  );

  // 4. Scene-pack-specific style — only from the resolved scene pack.
  const extracted = extractPromptFields(parsed);
  if (extracted.sections.length > 0) {
    const sectionBlock = extracted.sections
      .map((s) => `${s.label}: ${s.body}`)
      .join("\n");
    parts.push(`SCENE PACK PROMPT:\n${sectionBlock}`);
  }
  if (scenePack.visual_style?.trim()) parts.push(`VISUAL STYLE: ${scenePack.visual_style.trim()}.`);
  if (scenePack.color_mode?.trim()) parts.push(`COLOR MODE: ${scenePack.color_mode.trim()}.`);
  if (scenePack.framing?.trim()) parts.push(`SCENE PACK FRAMING: ${scenePack.framing.trim()}.`);
  if (scenePack.pose_type?.trim()) parts.push(`POSE TYPE: ${scenePack.pose_type.trim()}.`);
  if (scenePack.id === CIRCO_SCENE_PACK_ID) parts.push(CIRCO_COLOR_INSTRUCTION);

  const positivePromptText = parts.join(" ");
  const negativeParts: string[] = [];
  if (scenePack.negative_prompt?.trim()) negativeParts.push(scenePack.negative_prompt.trim());
  if (extracted.forbidden.length > 0) negativeParts.push(...extracted.forbidden);
  if (scenePack.id === CIRCO_SCENE_PACK_ID) negativeParts.push(...CIRCO_NEGATIVE_PROMPT_ADDITIONS);
  if (isDeusEDiabo) negativeParts.push(...DEUS_E_DIABO_NEGATIVE_ADDITIONS);
  const seenNeg = new Set<string>();
  const dedupedNeg: string[] = [];
  for (const raw of negativeParts) {
    const chunks = raw.split(/,\s*/).map((c) => c.trim()).filter(Boolean);
    for (const c of chunks) {
      const key = c.toLocaleLowerCase("pt-BR");
      if (seenNeg.has(key)) continue;
      seenNeg.add(key);
      dedupedNeg.push(c);
    }
  }
  const negativePromptText = dedupedNeg.join(", ");
  const promptText = negativePromptText
    ? `${positivePromptText} NEGATIVE PROMPT: ${negativePromptText}.`
    : positivePromptText;

  return {
    promptText,
    positivePromptText,
    negativePromptText,
    diagnostics: analyzePrompt(positivePromptText, scenePack.id),
    shouldApplyNeutralGrayscale: containsAny(
      [scenePack.color_mode, scenePack.visual_style, ...extracted.sections.map((s) => s.body)]
        .filter(Boolean)
        .join(" "),
      ["black and white", "preto e branco", "grayscale", "monochrome", "monocromático", "monocromatico"],
    ),
    sectionLabels: extracted.sections.map((s) => s.label),
    extractedNegativeCount: extracted.forbidden.length,
  };
}

export function __buildPipocaPromptInputForTests(
  scenePack: ScenePackForGeneration,
  hasHatRef = false,
  filmSlug: string | null = null,
  hasSecondaryIdentity = false,
): BuiltPrompt {
  return buildPromptText(scenePack, hasHatRef, filmSlug, hasSecondaryIdentity);
}

/* ---------- Replicate helpers ---------- */

async function createReplicatePrediction(input: {
  prompt: string;
  identityUrl: string;
  identityRawUrl?: string | null;
  appearanceUrl: string;
  sceneImageUrl: string;
  hatReferenceUrls: string[];
}): Promise<ReplicatePrediction> {
  const token = getReplicateToken();
  // Send both hat references when available: front and side.
  const hatRefs = input.hatReferenceUrls.slice(0, 2);
  // Order (default): identity, appearance, scene, then up to 2 hat refs.
  // Order (Deus e o Diabo w/ identity raw): identity (face crop), identity
  // raw (secondary), appearance, scene, hat front, hat side.
  const inputImages = input.identityRawUrl
    ? [input.identityUrl, input.identityRawUrl, input.appearanceUrl, input.sceneImageUrl, ...hatRefs]
    : [input.identityUrl, input.appearanceUrl, input.sceneImageUrl, ...hatRefs];
  const body = {
    input: {
      prompt: input.prompt,
      // Order: identity, appearance, scene base, then up to 2 hat refs.
      input_images: inputImages,
      aspect_ratio: "4:5",
      output_format: "jpg",
      output_quality: 95,
      safety_tolerance: 2,
    },
  };
  const res = await fetch(
    `https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "respond-async",
      },
      body: JSON.stringify(body),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    console.warn(`${LOG} replicate create falhou`, { status: res.status });
    throw new Error(`Replicate ${res.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text) as ReplicatePrediction;
}

async function getReplicatePrediction(id: string): Promise<ReplicatePrediction> {
  const token = getReplicateToken();
  const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Replicate get ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as ReplicatePrediction;
}

/* ---------- createPipocaGeneration ---------- */

const CreateInput = z.object({
  sessionId: z.string().uuid(),
  captureId: z.string().uuid(),
});

export const createPipocaGeneration = createServerFn({ method: "POST" })
  .inputValidator((input) => CreateInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: session, error: sErr } = await supabaseAdmin
      .from("pipoca_sessions")
      .select("id, selected_film_id, scene_pack_id, status, capital_id")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (sErr || !session) throw new Error("Sessão não encontrada");

    const { data: capture, error: cErr } = await supabaseAdmin
      .from("pipoca_captures")
      .select("id, session_id, capital_id")
      .eq("id", data.captureId)
      .maybeSingle();
    if (cErr || !capture) throw new Error("Captura não encontrada");
    if (capture.session_id !== session.id) throw new Error("Captura inválida");

    // Capital integrity: capture and session must agree. Historical records
    // without capital_id are tolerated; new ones must match.
    const sessionCapitalId = (session as any).capital_id as string | null;
    const captureCapitalId = (capture as any).capital_id as string | null;
    if (sessionCapitalId && captureCapitalId && sessionCapitalId !== captureCapitalId) {
      console.warn(`${GEN_LOG} GENERATION_CAPITAL_MISMATCH`, {
        session_capital_id: sessionCapitalId,
        capture_capital_id: captureCapitalId,
        capture_id: capture.id,
      });
      throw new Error("GENERATION_CAPITAL_MISMATCH");
    }
    const resolvedCapitalId = captureCapitalId ?? sessionCapitalId ?? null;

    if (!session.scene_pack_id || !session.selected_film_id) {
      throw new Error("Sessão sem filme/scene pack");
    }

    // Server-derived paths only.
    const identityPath = `${session.id}/${capture.id}/${IDENTITY_NAME}`;
    const appearancePath = `${session.id}/${capture.id}/${APPEARANCE_NAME}`;

    // Honour only the exact scene pack stored in the session. No global or
    // first-active fallback is allowed here, because prompt style must come
    // exclusively from the resolved session scene pack.
    let scenePack: ScenePackForGeneration | null = null;

    const { data: linkedPack } = await supabaseAdmin
      .from("pipoca_scene_packs")
      .select("id, film_id, scene_name, prompt, negative_prompt, reference_image_url, visual_style, color_mode, framing, pose_type, active, status")
      .eq("id", session.scene_pack_id)
      .maybeSingle();

    const isUsable = (p: any) =>
      p && p.reference_image_url && p.active === true && p.status === "active";

    if (isUsable(linkedPack) && linkedPack!.film_id === session.selected_film_id) {
      scenePack = linkedPack as any;
    } else {
      console.warn(`${GEN_LOG} SCENE_PACK_SESSION_INVALID`, {
        session_film_id: session.selected_film_id,
        session_scene_pack_id: session.scene_pack_id,
        linked_scene_pack_film_id: linkedPack?.film_id ?? null,
      });
      throw new Error("SCENE_PACK_SESSION_INVALID");
    }

    if (!scenePack) throw new Error("Scene pack não encontrado");
    if (!scenePack.reference_image_url) throw new Error("Cena-base sem reference_image_url");

    // Hard consistency lock — never let a scene pack from a different film
    // through to Replicate, even if upstream data is inconsistent.
    if (scenePack.film_id !== session.selected_film_id) {
      console.warn(`${GEN_LOG} SCENE_PACK_FILM_MISMATCH`, {
        session_film_id: session.selected_film_id,
        scene_pack_id: scenePack.id,
        scene_pack_film_id: scenePack.film_id,
      });
      throw new Error("SCENE_PACK_FILM_MISMATCH");
    }

    const chosenScenePackId = scenePack.id;

    // Routing log — safe fields only (no signed URLs, no PII).
    let referenceImageHost: string | null = null;
    try {
      referenceImageHost = new URL(scenePack.reference_image_url).host;
    } catch {
      referenceImageHost = null;
    }
    console.log(`[PIPOCA_FILM_ROUTING]`, {
      session_film_id: session.selected_film_id,
      capture_session_id: session.id,
      resolved_scene_pack_id: chosenScenePackId,
      resolved_scene_pack_film_id: scenePack.film_id,
      reference_image_host: referenceImageHost,
      routing_match: scenePack.film_id === session.selected_film_id,
    });

    const { count: priorCount } = await supabaseAdmin
      .from("pipoca_generations")
      .select("id", { count: "exact", head: true })
      .eq("capture_id", capture.id);
    const attemptNumber = (priorCount ?? 0) + 1;

    // Signed URLs for the two visitor photos.
    const { data: signedIdentity, error: signIdErr } = await supabaseAdmin.storage
      .from(ORIGINALS_BUCKET)
      .createSignedUrl(identityPath, SIGNED_REF_TTL);
    if (signIdErr || !signedIdentity?.signedUrl) {
      throw new Error("Falha ao gerar URL da foto de identidade");
    }
    const { data: signedAppearance, error: signApErr } = await supabaseAdmin.storage
      .from(ORIGINALS_BUCKET)
      .createSignedUrl(appearancePath, SIGNED_REF_TTL);
    if (signApErr || !signedAppearance?.signedUrl) {
      throw new Error("Falha ao gerar URL da foto de aparência");
    }

    const parsedScenePrompt = parseScenePackPrompt(scenePack.prompt);

    // Resolve film slug (needed for film-specific surgical rules — e.g.
    // "Deus e o Diabo na Terra do Sol" identity/wardrobe hardening).
    let filmSlug: string | null = null;
    try {
      const { data: filmRow } = await supabaseAdmin
        .from("pipoca_films")
        .select("slug")
        .eq("id", session.selected_film_id)
        .maybeSingle();
      filmSlug = (filmRow?.slug as string | null) ?? null;
    } catch {
      filmSlug = null;
    }
    const isDeusEDiabo = filmSlug === DEUS_E_DIABO_FILM_SLUG;

    // Deus e o Diabo — try to resolve the secondary identity reference (the
    // uncropped identity photo). Best-effort: if the file is missing (older
    // captures / upload failure), fall back to the 3+prop layout for this
    // generation and log the fallback flag.
    let signedIdentityRawUrl: string | null = null;
    let identityRawResolved = false;
    if (isDeusEDiabo) {
      const identityRawPath = `${session.id}/${capture.id}/${IDENTITY_RAW_NAME}`;
      try {
        const folder = `${session.id}/${capture.id}`;
        const { data: listing } = await supabaseAdmin.storage
          .from(ORIGINALS_BUCKET)
          .list(folder, { limit: 100 });
        const rawEntry = listing?.find((f: any) => f.name === IDENTITY_RAW_NAME);
        const rawSize = (rawEntry?.metadata as { size?: number } | undefined)?.size ?? 0;
        if (rawEntry && rawSize >= 2048) {
          const { data: signedRaw } = await supabaseAdmin.storage
            .from(ORIGINALS_BUCKET)
            .createSignedUrl(identityRawPath, SIGNED_REF_TTL);
          if (signedRaw?.signedUrl) {
            signedIdentityRawUrl = signedRaw.signedUrl;
            identityRawResolved = true;
          }
        }
      } catch {
        signedIdentityRawUrl = null;
        identityRawResolved = false;
      }
      if (!identityRawResolved) {
        console.warn(`${GEN_LOG} DEUS_E_DIABO_IDENTITY_RAW_MISSING`, {
          film_slug: filmSlug,
          scene_pack_id: session.scene_pack_id,
          capture_id: capture.id,
          fallback_reference_layout: "3+prop",
        });
      }
    }

    // Prop references are scene-pack-driven. For "Deus e o Diabo na Terra do
    // Sol" we keep the cangaceiro hat references (Images 5 & 6 when the
    // secondary identity is available, otherwise 4 & 5) — facial fidelity is
    // enforced through the strict identity rules in the prompt.
    const hatReferenceUrls: string[] = extractHatReferenceUrls(parsedScenePrompt);
    const hatRefUsed: string[] = hatReferenceUrls.slice(0, 2);
    console.log(`${GEN_LOG} prop references resolved from scene pack`, {
      scene_pack_id: chosenScenePackId,
      hat_reference_count: hatRefUsed.length,
    });
    const hasSecondaryIdentity = isDeusEDiabo && identityRawResolved;
    const builtPrompt = buildPromptText(
      scenePack,
      hatRefUsed.length > 0,
      filmSlug,
      hasSecondaryIdentity,
    );
    const baseImageCount = hasSecondaryIdentity ? 4 : 3;
    const totalReferenceCount = baseImageCount + hatRefUsed.length;

    if (isDeusEDiabo) {
      console.log(`${GEN_LOG} DEUS_E_DIABO_IDENTITY_RECOVERY_MODE`, {
        film_slug: filmSlug,
        scene_pack_id: chosenScenePackId,
        reference_count: totalReferenceCount,
        identity_reference_count: hasSecondaryIdentity ? 2 : 1,
        hat_reference_count: hatRefUsed.length,
        strict_face_identity_mode: true,
        female_identity_protection_enabled: true,
        secondary_identity_available: hasSecondaryIdentity,
      });
    }

    const sceneImageUrl = scenePack.reference_image_url;
    const referenceImageFilename = safeFilenameFromUrl(scenePack.reference_image_url);
    const image3MatchesScenePack = sceneImageUrl === scenePack.reference_image_url;
    const circoReferenceMismatch =
      scenePack.id === CIRCO_SCENE_PACK_ID && scenePack.reference_image_url !== CIRCO_REFERENCE_IMAGE_URL;
    const promptPreparedFromResolvedScenePack = chosenScenePackId === scenePack.id;

    const referenceRoles = [
      "identity-face-crop",
      ...(hasSecondaryIdentity ? ["identity-raw"] : []),
      "appearance-medium",
      "scene-base",
      ...(hatRefUsed.length > 0 ? ["hat-front", "hat-side"].slice(0, hatRefUsed.length) : []),
    ];
    console.log(`[PIPOCA_FINAL_GENERATION_INPUT]`, {
      film_id: session.selected_film_id,
      scene_pack_id: chosenScenePackId,
      scene_name: scenePack.scene_name,
      visual_style: scenePack.visual_style,
      color_mode: scenePack.color_mode,
      reference_image_filename: referenceImageFilename,
      base_image_count: baseImageCount,
      prop_reference_count: hatRefUsed.length,
      reference_count: totalReferenceCount,
      reference_roles: referenceRoles,
      prompt_sections: builtPrompt.sectionLabels,
      extracted_negative_count: builtPrompt.extractedNegativeCount,
      prompt_length: builtPrompt.promptText.length,
      negative_prompt_length: builtPrompt.negativePromptText.length,
      final_prompt_length: builtPrompt.promptText.length,
      model: REPLICATE_MODEL,
      scene_pack_version: (scenePack as any).updated_at ?? null,
      contains_monochrome: builtPrompt.diagnostics.contains_monochrome,
      contains_sertao: builtPrompt.diagnostics.contains_sertao,
      contains_cangaco: builtPrompt.diagnostics.contains_cangaco,
      contains_cinema_novo: builtPrompt.diagnostics.contains_cinema_novo,
      contains_circo: builtPrompt.diagnostics.contains_circo,
      routing_match: scenePack.film_id === session.selected_film_id,
      prompt_contamination_detected:
        builtPrompt.diagnostics.prompt_contamination_detected || circoReferenceMismatch,
    });

    if (
      scenePack.film_id !== session.selected_film_id ||
      scenePack.id !== chosenScenePackId ||
      !image3MatchesScenePack ||
      !promptPreparedFromResolvedScenePack ||
      circoReferenceMismatch ||
      builtPrompt.diagnostics.prompt_contamination_detected
    ) {
      console.warn(`${GEN_LOG} ${CROSS_FILM_PROMPT_CONTAMINATION}`, {
        film_id: session.selected_film_id,
        scene_pack_id: chosenScenePackId,
        scene_pack_film_id: scenePack.film_id,
        reference_image_filename: referenceImageFilename,
        circo_reference_mismatch: circoReferenceMismatch,
      });
      throw new Error(CROSS_FILM_PROMPT_CONTAMINATION);
    }



    const { data: generation, error: genErr } = await supabaseAdmin
      .from("pipoca_generations")
      .insert({
        session_id: session.id,
        film_id: session.selected_film_id,
        scene_pack_id: chosenScenePackId,
        capture_id: capture.id,
        status: "queued",
        provider: "replicate",
        attempt_number: attemptNumber,
        capital_id: resolvedCapitalId,
      })
      .select("id")
      .single();
    if (genErr || !generation) throw new Error("Falha ao criar registro de geração");

    if (resolvedCapitalId) {
      console.log(`${GEN_LOG} GENERATION_CAPITAL_ATTACHED`, {
        capital_id: resolvedCapitalId,
        generation_id: generation.id,
        capture_id: capture.id,
      });
    }

    console.log(`${GEN_LOG} geração usando referências`, {
      generationId: generation.id,
      attempt: attemptNumber,
      hatReferenceAvailable: hatReferenceUrls.length,
      hatReferenceUsed: hatRefUsed.length,
      order: referenceRoles,
    });
    if (hatRefUsed.length > 0) {
      console.log(`${GEN_LOG} usando chapéu como referência secundária`);
    }
    console.log(`[PIPOCA_GENERATION_REFERENCES]`, {
      film_id: session.selected_film_id ?? null,
      scene_pack_id: chosenScenePackId,
      base_image_count: baseImageCount,
      prop_reference_count: hatRefUsed.length,
      total_image_count: totalReferenceCount,
      prop_roles: hatRefUsed.length > 0
        ? ["hat-front", "hat-side"].slice(0, hatRefUsed.length)
        : [],
    });



    let prediction: ReplicatePrediction;
    try {
      prediction = await createReplicatePrediction({
        prompt: builtPrompt.promptText,
        identityUrl: signedIdentity.signedUrl,
        identityRawUrl: signedIdentityRawUrl,
        appearanceUrl: signedAppearance.signedUrl,
        sceneImageUrl,
        hatReferenceUrls: hatRefUsed,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro desconhecido";
      await supabaseAdmin
        .from("pipoca_generations")
        .update({ status: "failed", error_message: msg })
        .eq("id", generation.id);
      await supabaseAdmin
        .from("pipoca_sessions")
        .update({ status: "failed" })
        .eq("id", session.id);
      throw new Error("Falha ao iniciar geração");
    }

    await supabaseAdmin
      .from("pipoca_generations")
      .update({
        status: "processing",
        provider_job_id: prediction.id,
        metadata: {
          model: REPLICATE_MODEL,
          attempt: attemptNumber,
          identity_photo_path: identityPath,
          appearance_photo_path: appearancePath,
          input_image_count: totalReferenceCount,
          scene_pack_id: chosenScenePackId,
          hat_reference_count_available: hatReferenceUrls.length,
          hat_reference_count_used: hatRefUsed.length,
          hat_reference_url_used: hatRefUsed[0] ?? null,
          hat_reference_front_url: hatRefUsed[0] ?? null,
          hat_reference_side_url: hatRefUsed[1] ?? null,
          prompt_cache_key: `${session.selected_film_id}:${chosenScenePackId}`,
          reference_image_filename: referenceImageFilename,
          prompt_contamination_detected: builtPrompt.diagnostics.prompt_contamination_detected,
          post_process: builtPrompt.shouldApplyNeutralGrayscale ? "neutral-grayscale" : "none",
          post_process_contrast: builtPrompt.shouldApplyNeutralGrayscale ? 8 : null,
        },
      })
      .eq("id", generation.id);

    await supabaseAdmin
      .from("pipoca_sessions")
      .update({ status: "processing" })
      .eq("id", session.id);

    return {
      generationId: generation.id as string,
      status: "processing" as const,
    };
  });

/* ---------- getPipocaGenerationStatus ---------- */

const StatusInput = z.object({
  generationId: z.string().uuid(),
});

type StatusResponse =
  | { status: "queued" | "processing" }
  | { status: "failed"; error: string }
  | {
      status: "completed";
      generationId: string;
      imageUrl: string;
      publicToken: string;
      resultPageUrl: string;
    };

export const getPipocaGenerationStatus = createServerFn({ method: "POST" })
  .inputValidator((input) => StatusInput.parse(input))
  .handler(async ({ data }): Promise<StatusResponse> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: gen, error: gErr } = await supabaseAdmin
      .from("pipoca_generations")
      .select(
        "id, public_token, result_page_url, final_image_path, status, film_id, session_id, provider_job_id, created_at, metadata",
      )
      .eq("id", data.generationId)
      .maybeSingle();
    if (gErr || !gen) throw new Error("Geração não encontrada");

    // Merge into existing metadata — never wipe previously-stored fields.
    const mergeMetadata = (extra: Record<string, unknown>) => ({
      ...(typeof gen.metadata === "object" && gen.metadata !== null
        ? (gen.metadata as Record<string, unknown>)
        : {}),
      ...extra,
    });

    if (gen.status === "completed" && gen.final_image_path) {
      const { publicToken, resultPageUrl } = await ensurePublicResultFields(supabaseAdmin, gen);
      await ensurePrintQueueEntry(supabaseAdmin, gen.id, gen.session_id);
      const { data: signed, error: sErr } = await supabaseAdmin.storage
        .from(GENERATED_BUCKET)
        .createSignedUrl(gen.final_image_path, SIGNED_DOWNLOAD_TTL);
      if (sErr || !signed?.signedUrl) throw new Error("Falha ao gerar URL final");
      return {
        status: "completed",
        generationId: gen.id,
        imageUrl: signed.signedUrl,
        publicToken,
        resultPageUrl,
      };
    }

    if (gen.status === "failed") {
      return { status: "failed", error: "Geração falhou" };
    }

    if (!gen.provider_job_id) throw new Error("provider_job_id ausente");

    let pred: ReplicatePrediction;
    try {
      pred = await getReplicatePrediction(gen.provider_job_id);
    } catch {
      return { status: "processing" };
    }

    if (pred.status === "starting" || pred.status === "processing") {
      if (gen.status !== "processing") {
        await supabaseAdmin
          .from("pipoca_generations")
          .update({ status: "processing" })
          .eq("id", gen.id);
      }
      return { status: "processing" };
    }

    if (pred.status === "failed" || pred.status === "canceled") {
      const errMsg = pred.error ?? "Falha na geração";
      await supabaseAdmin
        .from("pipoca_generations")
        .update({
          status: "failed",
          error_message: errMsg,
          metadata: mergeMetadata({ replicate_status: pred.status }),
        })
        .eq("id", gen.id);
      await supabaseAdmin
        .from("pipoca_sessions")
        .update({ status: "failed" })
        .eq("id", gen.session_id);
      return { status: "failed", error: "Não foi possível criar a cena" };
    }

    const outputUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    if (!outputUrl || typeof outputUrl !== "string") {
      await supabaseAdmin
        .from("pipoca_generations")
        .update({
          status: "failed",
          error_message: "Sem output",
          metadata: mergeMetadata({ replicate_status: pred.status }),
        })
        .eq("id", gen.id);
      return { status: "failed", error: "Saída vazia do modelo" };
    }

    const imgRes = await fetch(outputUrl);
    if (!imgRes.ok) throw new Error(`Falha ao baixar imagem: ${imgRes.status}`);
    const rawBuf = new Uint8Array(await imgRes.arrayBuffer());

    const metadata = typeof gen.metadata === "object" && gen.metadata !== null
      ? (gen.metadata as Record<string, unknown>)
      : {};
    const shouldApplyNeutralGrayscale = metadata.post_process === "neutral-grayscale";
    let finalBuf: Uint8Array = rawBuf;
    let postProcess: "neutral-grayscale" | "raw-fallback" | "none" = shouldApplyNeutralGrayscale
      ? "neutral-grayscale"
      : "none";
    let postProcessError: string | null = null;
    if (shouldApplyNeutralGrayscale) {
      try {
        const processed = await applyNeutralGrayscale(rawBuf);
        if (!processed || processed.byteLength < 1024) {
          throw new Error("pós-processamento devolveu JPEG vazio");
        }
        finalBuf = new Uint8Array(processed);
      } catch (e) {
        postProcess = "raw-fallback";
        postProcessError = e instanceof Error ? e.message : "erro desconhecido";
        finalBuf = rawBuf;
      }
    }

    const finalPath = `${gen.session_id}/${gen.id}/final.jpg`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(GENERATED_BUCKET)
      .upload(finalPath, finalBuf, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw new Error(`Upload final falhou: ${upErr.message}`);

    const processingMs =
      typeof pred.metrics?.predict_time === "number"
        ? Math.round(pred.metrics.predict_time * 1000)
        : null;
    const publicToken = isUuid(gen.public_token) ? gen.public_token.trim() : crypto.randomUUID();
    const resultPageUrl = buildResultPageUrl(publicToken);

    await supabaseAdmin
      .from("pipoca_generations")
      .update({
        status: "completed",
        public_token: publicToken,
        result_page_url: resultPageUrl,
        final_image_path: finalPath,
        error_message: null,
        metadata: mergeMetadata({
          post_process: postProcess,
          post_process_contrast: postProcess === "neutral-grayscale" ? 8 : null,
          post_process_error: postProcessError,
        }),
        ...(processingMs !== null ? { processing_time_ms: processingMs } : {}),
      })
      .eq("id", gen.id);

    await supabaseAdmin
      .from("pipoca_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", gen.session_id);

    await ensurePrintQueueEntry(supabaseAdmin, gen.id, gen.session_id);

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(GENERATED_BUCKET)
      .createSignedUrl(finalPath, SIGNED_DOWNLOAD_TTL);
    if (sErr || !signed?.signedUrl) throw new Error("Falha ao gerar URL final");

    return {
      status: "completed",
      generationId: gen.id,
      imageUrl: signed.signedUrl,
      publicToken,
      resultPageUrl,
    };
  });
