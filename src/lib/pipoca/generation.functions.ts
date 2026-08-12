import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GEN_LOG = "[PIPOCA_GENERATION]";
const LOG = "[PIPOCA_SERVER]";
const REPLICATE_MODEL = "black-forest-labs/flux-2-pro";
const ORIGINALS_BUCKET = "pipoca-visitor-originals";
const GENERATED_BUCKET = "pipoca-generated-scenes";
const SIGNED_DOWNLOAD_TTL = 60 * 30;
const SIGNED_REF_TTL = 60 * 30;


const IDENTITY_NAME = "identity-close.jpg";
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

function buildResultPageUrl(origin: string, publicToken: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/resultado/${encodeURIComponent(publicToken)}`;
}

const PQ_LOG = "[PIPOCA_PRINT_QUEUE_AUTO]";

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

    const { data: inserted, error: iErr } = await supabaseAdmin
      .from("pipoca_print_queue")
      .insert({
        visitor_id: visitorId,
        generation_id: generationId,
        status: "pending",
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
): BuiltPrompt {
  const parsed = parseScenePackPrompt(scenePack.prompt);
  const parts: string[] = [];

  // 1. Reference role declaration — strict visual priority
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


  // 2. Hard identity rules
  parts.push(
    "HARD RULES (highest priority): facial identity has absolute priority. The visitor's facial identity from Image 1 must remain the highest priority and must not be altered by any other reference. Do NOT redraw the face. Do NOT blend the face with another person. Do NOT stylize the face to match the scene.",
  );
  parts.push(
    "Exactly one person in the final image, and that person must be clearly recognizable as the visitor from Image 1 — not a similar person.",
  );
  parts.push(
    "Wardrobe and environment must adapt to fit the visitor. The visitor's face must NOT be altered to fit the style.",
  );
  parts.push(
    "The visitor must be naturally integrated into the environment from Image 3 — no pasted look, no cutout, no flat overlay. Body scale, posture, light on the skin, contact shadows and depth of field must match Image 3.",
  );

  const hatUsage = extractHatUsage(parsed);
  if (hatUsage) parts.push(`Hat usage notes from scene pack: ${hatUsage}.`);

  // 3. Neutral composition
  parts.push(
    "Vertical 4:5 framing, cinematic composition, shallow depth of field. The visitor anchored in the environment as if captured in a film still.",
  );
  parts.push(
    "FRAMING: keep the selected scene pack framing visible and legible. Avoid close-up, very tight framing, extreme close-up, or overly-approximated portrait that cuts the costume and erases the environment.",
  );
  parts.push(
    "HIERARCHY: Image 1 (face identity) = highest priority. Image 2 (appearance, body, clothing) = second priority. Image 3 (environment, composition) = third priority. Additional prop images, when present, are the lowest priority and must never replace or weaken Images 1, 2 or 3.",
  );

  // Absolute identity conflict rule.
  parts.push(
    "When any visual reference conflicts with Image 1, Image 1 always wins for the face, hair, age and identity.",
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
): BuiltPrompt {
  return buildPromptText(scenePack, hasHatRef);
}

/* ---------- Replicate helpers ---------- */

async function createReplicatePrediction(input: {
  prompt: string;
  identityUrl: string;
  appearanceUrl: string;
  sceneImageUrl: string;
  hatReferenceUrls: string[];
}): Promise<ReplicatePrediction> {
  const token = getReplicateToken();
  // Send both hat references when available: front (image 4) and side (image 5).
  const hatRefs = input.hatReferenceUrls.slice(0, 2);
  const inputImages = [
    input.identityUrl,
    input.appearanceUrl,
    input.sceneImageUrl,
    ...hatRefs,
  ];
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
      .select("id, selected_film_id, scene_pack_id, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (sErr || !session) throw new Error("Sessão não encontrada");

    const { data: capture, error: cErr } = await supabaseAdmin
      .from("pipoca_captures")
      .select("id, session_id")
      .eq("id", data.captureId)
      .maybeSingle();
    if (cErr || !capture) throw new Error("Captura não encontrada");
    if (capture.session_id !== session.id) throw new Error("Captura inválida");

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
    // Prop references are now strictly scene-pack-driven. No global toggle,
    // no film_id/slug guess, no fixed fallback URL. A scene pack without
    // `prop_references.hat_reference_images` (or with an empty array) sends
    // exactly 3 base images.
    const hatReferenceUrls: string[] = extractHatReferenceUrls(parsedScenePrompt);
    const hatRefUsed: string[] = hatReferenceUrls.slice(0, 2);
    console.log(`${GEN_LOG} prop references resolved from scene pack`, {
      scene_pack_id: chosenScenePackId,
      hat_reference_count: hatRefUsed.length,
    });
    const builtPrompt = buildPromptText(scenePack, hatRefUsed.length > 0);
    const sceneImageUrl = scenePack.reference_image_url;
    const referenceImageFilename = safeFilenameFromUrl(scenePack.reference_image_url);
    const image3MatchesScenePack = sceneImageUrl === scenePack.reference_image_url;
    const circoReferenceMismatch =
      scenePack.id === CIRCO_SCENE_PACK_ID && scenePack.reference_image_url !== CIRCO_REFERENCE_IMAGE_URL;
    const promptPreparedFromResolvedScenePack = chosenScenePackId === scenePack.id;

    const referenceRoles = [
      "identity-face-crop",
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
      base_image_count: 3,
      prop_reference_count: hatRefUsed.length,
      reference_count: 3 + hatRefUsed.length,
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
      })
      .select("id")
      .single();
    if (genErr || !generation) throw new Error("Falha ao criar registro de geração");

    console.log(`${GEN_LOG} geração usando referências`, {
      generationId: generation.id,
      attempt: attemptNumber,
      hatReferenceAvailable: hatReferenceUrls.length,
      hatReferenceUsed: hatRefUsed.length,
      order: [
        "identity-close",
        "appearance-medium",
        "scene-base",
        "hat-front",
        "hat-side",
      ].slice(0, 3 + hatRefUsed.length),
    });
    if (hatRefUsed.length > 0) {
      console.log(`${GEN_LOG} usando chapéu como referência secundária`);
    }
    console.log(`[PIPOCA_GENERATION_REFERENCES]`, {
      film_id: session.selected_film_id ?? null,
      scene_pack_id: chosenScenePackId,
      base_image_count: 3,
      prop_reference_count: hatRefUsed.length,
      total_image_count: 3 + hatRefUsed.length,
      prop_roles: hatRefUsed.length > 0
        ? ["hat-front", "hat-side"].slice(0, hatRefUsed.length)
        : [],
    });



    let prediction: ReplicatePrediction;
    try {
      prediction = await createReplicatePrediction({
        prompt: builtPrompt.promptText,
        identityUrl: signedIdentity.signedUrl,
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
          input_image_count: 3 + hatRefUsed.length,
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
