import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GEN_LOG = "[PIPOCA_GENERATION]";
const LOG = "[PIPOCA_SERVER]";
const REPLICATE_MODEL = "black-forest-labs/flux-2-pro";
const ORIGINALS_BUCKET = "pipoca-visitor-originals";
const GENERATED_BUCKET = "pipoca-generated-scenes";
const SIGNED_DOWNLOAD_TTL = 60 * 30;
const SIGNED_REF_TTL = 60 * 30;
// Canonical published domain — never use preview/lovableproject hosts or
// window.location.origin. Result QR code MUST always point here.
const PUBLIC_RESULT_BASE_URL = "https://pipocaecena.lovable.app".replace(/\/+$/, "");

// Single medium-shot file. Used as BOTH identity and appearance until the
// generation pipeline is revised.
// Temporary single-photo compatibility mapping. Identity and appearance use
// the same medium-shot image until generation pipeline revision.
const MEDIUM_NAME = "visitor-medium.jpg";

const ENABLE_HAT_REFERENCE = true;

const FIXED_HAT_REFERENCE_URL =
  "https://brsplarbpylygnsakyjf.supabase.co/storage/v1/object/public/pipoca-reference-assets/props/deus-e-o-diabo-na-terra-do-sol/chapeu-cangaceiro-em-uso-v2.jpg";


function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

function buildResultPageUrl(publicToken: string): string {
  return `${PUBLIC_RESULT_BASE_URL}/resultado/${publicToken}`;
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

function buildPromptText(
  rawPrompt: unknown,
  filmTitle?: string | null,
  hasHatRef = false,
): string {
  const parsed = parseScenePackPrompt(rawPrompt);
  const parts: string[] = [];

  // 1. Reference roles
  parts.push(
    "Image 1 is the EXCLUSIVE FACIAL IDENTITY REFERENCE. It is a close, guided portrait of the visitor and is the only source for face, identity, face shape, eyes, nose, mouth, jawline, skin tone, hair, facial hair, eyebrows, glasses, and apparent age.",
  );
  parts.push(
    "Image 2 is the APPEARANCE REFERENCE. Use it for body proportions, posture, shoulders, torso, general appearance and base clothing of the same visitor. Do not take facial features from Image 2.",
  );
  parts.push(
    "Image 3 is the SCENE REFERENCE. Use it for environment, sertão landscape, composition, lighting direction and cinematic atmosphere. Do not take facial features from Image 3.",
  );
  if (hasHatRef) {
    parts.push(
      "Image 4 is a HAT DESIGN CUE only. Use it as visual reference for the cangaceiro hat shape, scale and natural fit on the head. Do not take facial features, body, clothing, pose or environment from Image 4. Image 4 must never override or distort the visitor's identity, face, hairstyle, clothing, pose or the environment.",
    );
  }

  // 2. Identity protection
  parts.push(
    "The generated person must be clearly recognizable as the visitor from Image 1. Preserve face shape, eye spacing, nose shape, mouth shape, jawline, hairline, hairstyle, skin tone and facial characteristics. Do not create a different person.",
  );
  parts.push(
    `Do not blend facial features from Images 2, 3${hasHatRef ? " or 4" : ""} into the visitor's face. Image 1 is the only facial identity reference.`,
  );
  parts.push(
    "Exactly one person in the final image. The visitor is naturally integrated into the environment from Image 3: matching scale, posture, skin light, contact shadows and depth of field.",
  );

  // 3. Style
  parts.push(
    "STYLE: strictly black and white, neutral grayscale. No sepia, no brown, yellow, beige or golden tint. Strong contrast, deep shadows, luminous highlights, visible film grain.",
  );
  parts.push(
    "Austere Brazilian Cinema Novo mood in the spirit of Glauber Rocha — serious, iconic, mythic. Expression neutral or mildly serious, never smiling.",
  );

  // 4. Wardrobe / clothing
  parts.push(
    "WARDROBE: historically inspired by Brazilian cangaço and northeastern sertão. Rustic, natural, dusty, believable and non-theatrical. Leather details are welcome. No modern clothing, no t-shirt, no jeans, no sneakers, no streetwear, no costume-party look, no fantasy exaggeration. Clothing must remain visible and coherent with the framing.",
  );
  parts.push(
    "The wardrobe must look authentic, restrained and cinematic, not caricatured.",
  );

  // 5. Hat
  parts.push(
    "HAT: traditional Brazilian cangaceiro leather hat, historically appropriate, worn naturally, proportional to the head and visually integrated with the outfit. May include subtle front ornamentation. Must not be oversized, must not be theatrical, must not dominate the image, must not cover the face, must not reduce facial recognizability. Never a cowboy or western wide-brim hat.",
  );
  parts.push(
    "The hat is important, but it is secondary to identity, clothing and scene.",
  );

  const hatUsage = extractHatUsage(parsed);
  if (hatUsage) parts.push(`Hat usage notes from scene pack: ${hatUsage}.`);

  // 6. Cross
  parts.push(
    "A small wooden cross may appear in the composition — visible but secondary.",
  );

  // 7. Framing
  parts.push(
    "Vertical 4:5 framing, cinematic composition, shallow depth of field. Medium or medium-full shot showing the visitor from head to waist or just above the knees — enough room to see the face clearly, the clothing clearly and to understand the scene. Do not crop too tightly on the face, and do not hide the wardrobe.",
  );

  // 8. Hierarchy
  if (hasHatRef) {
    parts.push(
      "HIERARCHY: Image 1 (face) = highest priority. Image 2 (body, appearance, base clothing) = second. Image 3 (scene, atmosphere) = third. Image 4 (cangaceiro hat design cue) = lowest priority, used only for hat shape and fit.",
    );
  } else {
    parts.push(
      "HIERARCHY: Image 1 (face) = highest priority. Image 2 (appearance/body) = second. Image 3 (environment) = third.",
    );
  }

  // 9. Film context
  parts.push(
    `Cinematic scene from the arid Brazilian sertão, in the spirit of "Deus e o Diabo na Terra do Sol"${
      filmTitle ? ` and the film "${filmTitle}"` : ""
    }: dramatic sunlight, dust in the air, 1960s Cinema Novo aesthetic, photoreal, high quality.`,
  );

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const pickStr = (k: string) => (typeof obj[k] === "string" ? (obj[k] as string) : undefined);
    const scene = pickStr("scene") ?? pickStr("setting") ?? pickStr("environment");
    const mood = pickStr("mood") ?? pickStr("atmosphere");
    const style = pickStr("style") ?? pickStr("look");
    const wardrobe = pickStr("wardrobe") ?? pickStr("costume");
    const extra = pickStr("description") ?? pickStr("prompt");
    if (scene) parts.push(`Scene details: ${scene}.`);
    if (mood) parts.push(`Mood: ${mood}.`);
    if (style) parts.push(`Visual style: ${style}.`);
    if (wardrobe) parts.push(`Wardrobe notes from scene pack: ${wardrobe}.`);
    if (extra) parts.push(extra);
  } else if (typeof parsed === "string" && parsed.trim()) {
    parts.push(parsed.trim());
  }

  return parts.join(" ");
}

/* ---------- Replicate helpers ---------- */

async function createReplicatePrediction(input: {
  prompt: string;
  identityUrl: string;
  appearanceUrl: string;
  sceneImageUrl: string;
  hatReferenceUrl?: string | null;
}): Promise<ReplicatePrediction> {
  const token = getReplicateToken();
  const inputImages = [
    input.identityUrl,
    input.appearanceUrl,
    input.sceneImageUrl,
  ];
  if (input.hatReferenceUrl) inputImages.push(input.hatReferenceUrl);
  const body = {
    input: {
      prompt: input.prompt,
      // Order: identity (Image 1), appearance (Image 2), scene base (Image 3), hat cue (Image 4, optional).
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
    // Single medium-shot file — used as identity AND appearance below.
    const mediumPath = `${session.id}/${capture.id}/${MEDIUM_NAME}`;

    // Multiple active scene packs: honour session pick if usable, otherwise
    // randomly pick among the active packs for the film.
    let scenePack:
      | { id: string; prompt: unknown; reference_image_url: string | null }
      | null = null;

    const { data: linkedPack } = await supabaseAdmin
      .from("pipoca_scene_packs")
      .select("id, prompt, reference_image_url, active, status, film_id")
      .eq("id", session.scene_pack_id)
      .maybeSingle();

    const isUsable = (p: any) =>
      p && p.reference_image_url && p.active === true && p.status === "active";

    if (isUsable(linkedPack)) {
      scenePack = linkedPack as any;
    } else if (session.selected_film_id) {
      const { data: candidates, error: candErr } = await supabaseAdmin
        .from("pipoca_scene_packs")
        .select("id, prompt, reference_image_url, active, status")
        .eq("film_id", session.selected_film_id)
        .eq("active", true)
        .eq("status", "active");
      if (candErr) throw new Error("Falha ao buscar scene packs");
      const usable = (candidates ?? []).filter(isUsable);
      if (usable.length === 0) throw new Error("Nenhum scene pack ativo para o filme");
      const picked = usable[Math.floor(Math.random() * usable.length)];
      scenePack = picked as any;
    }

    if (!scenePack) throw new Error("Scene pack não encontrado");
    if (!scenePack.reference_image_url) throw new Error("Cena-base sem reference_image_url");
    const chosenScenePackId = scenePack.id;

    const { data: film } = await supabaseAdmin
      .from("pipoca_films")
      .select("id, title")
      .eq("id", session.selected_film_id)
      .maybeSingle();

    const { count: priorCount } = await supabaseAdmin
      .from("pipoca_generations")
      .select("id", { count: "exact", head: true })
      .eq("capture_id", capture.id);
    const attemptNumber = (priorCount ?? 0) + 1;

    // Single signed URL for the medium-shot photo. Reused as identity AND
    // appearance below (temporary single-photo compatibility mapping).
    const { data: signedMedium, error: signMedErr } = await supabaseAdmin.storage
      .from(ORIGINALS_BUCKET)
      .createSignedUrl(mediumPath, SIGNED_REF_TTL);
    if (signMedErr || !signedMedium?.signedUrl) {
      throw new Error("Falha ao gerar URL da foto");
    }
    const signedMediumUrl = signedMedium.signedUrl;

    
    const hatReferenceUrl = ENABLE_HAT_REFERENCE ? FIXED_HAT_REFERENCE_URL : null;
    const inputImageCount = hatReferenceUrl ? 4 : 3;
    console.log(`${GEN_LOG} hat reference enabled: ${ENABLE_HAT_REFERENCE}`);
    const promptText = buildPromptText(scenePack.prompt, film?.title, Boolean(hatReferenceUrl));


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

    console.log(`${GEN_LOG} geração com ${inputImageCount} imagens`, {
      generationId: generation.id,
      attempt: attemptNumber,
      order: hatReferenceUrl
        ? ["identity-close", "appearance-medium", "scene-base", "hat-reference"]
        : ["identity-close", "appearance-medium", "scene-base"],
    });

    let prediction: ReplicatePrediction;
    try {
      prediction = await createReplicatePrediction({
        prompt: promptText,
        // Single medium-shot URL used for both roles. Temporary mapping.
        identityUrl: signedMediumUrl,
        appearanceUrl: signedMediumUrl,
        sceneImageUrl: scenePack.reference_image_url,
        hatReferenceUrl,
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
          input_image_count: inputImageCount,
          scene_pack_id: chosenScenePackId,
          hat_reference_enabled: ENABLE_HAT_REFERENCE,
          hat_reference_url_used: hatReferenceUrl,
          post_process: "neutral-grayscale",
          post_process_contrast: 8,
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

    // Deterministic neutral B&W finish.
    let finalBuf: Uint8Array = rawBuf;
    let postProcess: "neutral-grayscale" | "raw-fallback" = "neutral-grayscale";
    let postProcessError: string | null = null;
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
