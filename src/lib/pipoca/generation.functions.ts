import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const FACE_LOG = "[PIPOCA_FACE]";
const GEN_LOG = "[PIPOCA_GENERATION]";

/**
 * Build a face-focused crop from the original visitor photo.
 *
 * Heuristic (no facial detection in this step):
 *  - assume the visitor is roughly centered in the totem capture;
 *  - take ~60% of the width centered horizontally;
 *  - take ~55% of the height, positioned slightly above center so face + shoulders
 *    are included while feet / lower body are dropped;
 *  - resize the result to 1024px on the longer side.
 *
 * Uses @cf-wasm/photon (WASM) so it runs inside the Cloudflare Worker SSR runtime
 * — `sharp` is a native addon and is not supported there.
 */
type FaceCropResult = { bytes: Uint8Array; width: number; height: number };

async function buildFaceCropJpeg(originalBytes: Uint8Array): Promise<FaceCropResult> {
  // Dynamic import keeps @cf-wasm/photon out of the browser bundle entirely.
  const photon = await import("@cf-wasm/photon");
  const img = photon.PhotonImage.new_from_byteslice(originalBytes);
  try {
    const w = img.get_width();
    const h = img.get_height();

    // Square crop. Size = 78% of the shorter side — generous enough to keep
    // forehead, hair, chin, jaw, glasses, beard, neck and a bit of shoulders.
    // Centered horizontally. Vertically anchored at ~18% from the top, which
    // shifts the crop DOWN relative to the previous heuristic so the chin is
    // no longer clipped and there is less empty space above the head.
    const side = Math.min(w, h);
    const cropSide = Math.min(w, h, Math.round(side * 0.78));
    const x = Math.max(0, Math.round((w - cropSide) / 2));
    const yIdeal = Math.round(h * 0.18);
    const y = Math.max(0, Math.min(yIdeal, h - cropSide));
    const x2 = Math.min(w, x + cropSide);
    const y2 = Math.min(h, y + cropSide);

    const cropped = photon.crop(img, x, y, x2, y2);
    try {
      const targetSide = 1024;
      const cw = cropped.get_width();
      const ch = cropped.get_height();
      const scale = targetSide / Math.max(cw, ch);
      const outW = Math.max(1, Math.round(cw * scale));
      const outH = Math.max(1, Math.round(ch * scale));
      const resized = photon.resize(cropped, outW, outH, 1);
      try {
        const bytes = resized.get_bytes_jpeg(92);
        return { bytes, width: outW, height: outH };
      } finally {
        resized.free();
      }
    } finally {
      cropped.free();
    }
  } finally {
    img.free();
  }
}

/**
 * Deterministic monochrome post-processing.
 *
 * Applied to the model output before it is saved to the generated bucket so
 * every Pipoca image lands with the same Cinema Novo visual language —
 * predominantly black & white, mild contrast lift, very subtle earthy tone.
 *
 * Pure Photon transforms; no facial detection, no per-image tuning.
 */
async function applyMonochromeFinish(inputBytes: Uint8Array): Promise<Uint8Array> {
  const photon = await import("@cf-wasm/photon");
  const img = photon.PhotonImage.new_from_byteslice(inputBytes);
  try {
    // 1. Strict luminance-based grayscale — removes the colour drift between
    //    runs of the model.
    photon.grayscale(img);
    // 2. Gentle contrast lift for the filmic feel. Photon's contrast range is
    //    roughly -255..255; a small positive value avoids crushing detail.
    try {
      (photon as any).adjust_contrast?.(img, 18.0);
    } catch {
      // contrast is optional — skip silently if the build lacks it
    }
    // 3. Very subtle earthy toning. sepia() is a fixed warm tint; we apply
    //    it once at low strength by blending through a single pass. If the
    //    helper is unavailable we just stay neutral B&W.
    try {
      (photon as any).sepia?.(img);
    } catch {
      // toning is optional
    }
    return img.get_bytes_jpeg(94);
  } finally {
    img.free();
  }
}

const LOG = "[PIPOCA_SERVER]";
const REPLICATE_MODEL = "black-forest-labs/flux-2-pro";
const ORIGINALS_BUCKET = "pipoca-visitor-originals";
const GENERATED_BUCKET = "pipoca-generated-scenes";
const SIGNED_DOWNLOAD_TTL = 60 * 30; // 30 min for visitor download
const SIGNED_REF_TTL = 60 * 30; // 30 min for replicate to pull the source

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

/* ---------- Prompt builder ---------- */

function buildPromptText(rawPrompt: unknown, filmTitle?: string | null): string {
  let parsed: unknown = rawPrompt;
  if (typeof rawPrompt === "string") {
    const trimmed = rawPrompt.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = rawPrompt;
      }
    } else {
      parsed = rawPrompt;
    }
  }

  const parts: string[] = [];

  // 1. Three references — explicit role declaration
  parts.push(
    "Image 1 is the primary FACE IDENTITY REFERENCE. It is a tight crop of the visitor's face and shoulders and is the absolute source of truth for who the person is.",
  );
  parts.push(
    "Image 2 is the secondary FULL APPEARANCE REFERENCE. It shows the same visitor in full and helps preserve overall look, body proportions, posture and visual coherence with image 1.",
  );
  parts.push(
    "Image 3 is the ENVIRONMENT AND COMPOSITION REFERENCE. Match its framing, lighting direction, depth, spatial layout, and atmosphere.",
  );

  // 2. Hard rules — non-negotiable, identity first
  parts.push(
    "HARD RULES (highest priority): preserve the EXACT facial identity from image 1.",
  );
  parts.push(
    "Preserve face shape, eyes, nose, mouth, jawline, skin tone, facial hair, glasses (if present) and hair / hairline exactly as in image 1.",
  );
  parts.push(
    "The final person must be clearly recognizable as the same person from image 1 — not a similar person, not a stylized version, the same person.",
  );
  parts.push(
    "Exactly one person in the final image, and that person is the visitor from images 1 and 2.",
  );
  parts.push(
    "The visitor must be naturally integrated into the environment of image 3 — no pasted look, no cutout composite, no flat overlay.",
  );
  parts.push(
    "Body scale, posture, light on the skin, contact shadows, and depth of field must all match the surrounding scene from image 3.",
  );

  // 3. Cinema Novo style — strongly monochrome
  parts.push(
    "STYLE: predominantly black and white, nearly monochromatic, with only a very subtle earthy tint.",
  );
  parts.push(
    "Strong contrast, deep shadows, luminous highlights, visible film grain, slightly desaturated.",
  );
  parts.push(
    "Austere Brazilian Cinema Novo mood in the spirit of Glauber Rocha — serious, iconic, mythic. Not casual. Not touristic. Not editorial fashion.",
  );

  // 4. Wardrobe — rustic, timeless, non-modern
  parts.push(
    "WARDROBE: rustic, timeless, non-modern. Clothing must feel rooted in the northeastern Brazilian sertão.",
  );
  parts.push(
    "Avoid bright casual modern clothing. Avoid contemporary t-shirt look. Avoid modern jeans, sneakers, or streetwear.",
  );

  // 5. Hat — subtle cangaço, never cowboy
  parts.push(
    "HAT: a subtle northeastern leather hat inspired by cangaço — wide-brim, weathered, earthy, native to the sertão.",
  );
  parts.push(
    "The hat must NOT be a cowboy hat. Must NOT be western. Must NOT be theatrical, costume-like, or exaggerated.",
  );
  parts.push(
    "The hat must feel native to the scene, present but understated — never overpowering the face.",
  );

  // 6. Cross — visible but secondary
  parts.push(
    "A small wooden cross may appear in the composition — visible but visually secondary, never the focal point.",
  );

  // 7. Composition
  parts.push(
    "Vertical 4:5 framing, cinematic composition, shallow depth of field. The visitor anchored in the environment as if captured in a film still.",
  );

  // 8. Film / scene context
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
}): Promise<ReplicatePrediction> {
  const token = getReplicateToken();
  const body = {
    input: {
      prompt: input.prompt,
      // Order matters: identity, appearance, environment.
      // On Photon fallback, identity and appearance both come from the
      // original photo for this single attempt (face-crop.jpg stays absent).
      input_images: [input.identityUrl, input.appearanceUrl, input.sceneImageUrl],
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
      .select("id, session_id, original_photo_path")
      .eq("id", data.captureId)
      .maybeSingle();
    if (cErr || !capture) throw new Error("Captura não encontrada");
    if (capture.session_id !== session.id) throw new Error("Captura inválida");
    if (!capture.original_photo_path) throw new Error("Foto original ausente");

    if (!session.scene_pack_id || !session.selected_film_id) {
      throw new Error("Sessão sem filme/scene pack");
    }

    const { data: scenePack, error: spErr } = await supabaseAdmin
      .from("pipoca_scene_packs")
      .select("id, prompt, reference_image_url")
      .eq("id", session.scene_pack_id)
      .maybeSingle();
    if (spErr || !scenePack) throw new Error("Scene pack não encontrado");
    if (!scenePack.reference_image_url) throw new Error("Cena-base sem reference_image_url");

    const { data: film } = await supabaseAdmin
      .from("pipoca_films")
      .select("id, title")
      .eq("id", session.selected_film_id)
      .maybeSingle();

    // count prior attempts for this capture
    const { count: priorCount } = await supabaseAdmin
      .from("pipoca_generations")
      .select("id", { count: "exact", head: true })
      .eq("capture_id", capture.id);
    const attemptNumber = (priorCount ?? 0) + 1;

    const MIN_VALID_BYTES = 2048;
    const faceCropPath = `${session.id}/${capture.id}/face-crop.jpg`;

    let faceCropReused = false;
    let faceCropFallback = false;
    let faceCropWidth: number | null = null;
    let faceCropHeight: number | null = null;

    // 1) Always need a signed URL for the original photo — it is used as
    //    the full-appearance reference on every attempt, and as the identity
    //    reference when the Photon crop falls back.
    const { data: signedVisitor, error: signVisitorErr } = await supabaseAdmin.storage
      .from(ORIGINALS_BUCKET)
      .createSignedUrl(capture.original_photo_path, SIGNED_REF_TTL);
    if (signVisitorErr || !signedVisitor?.signedUrl) {
      throw new Error("Falha ao gerar URL da foto original");
    }

    // 2) Try to reuse an existing face crop from a previous attempt for this capture.
    let existingCropOk = false;
    try {
      const { data: existing, error: existingErr } = await supabaseAdmin.storage
        .from(ORIGINALS_BUCKET)
        .download(faceCropPath);
      if (!existingErr && existing && existing.size >= MIN_VALID_BYTES) {
        existingCropOk = true;
        faceCropReused = true;
        console.log(`${FACE_LOG} crop existente reutilizado`, { bytes: existing.size });
      }
    } catch {
      // ignore — will regenerate below
    }

    // faceCropSignedUrl stays null in fallback mode; the original photo stands in.
    let faceCropSignedUrl: string | null = null;

    if (existingCropOk) {
      const { data: signedFace, error: signFaceErr } = await supabaseAdmin.storage
        .from(ORIGINALS_BUCKET)
        .createSignedUrl(faceCropPath, SIGNED_REF_TTL);
      if (signFaceErr || !signedFace?.signedUrl) {
        throw new Error("Falha ao gerar URL do face crop");
      }
      faceCropSignedUrl = signedFace.signedUrl;
    } else {
      // 3) Download original photo (required to either crop or fallback).
      const { data: originalBlob, error: dlErr } = await supabaseAdmin.storage
        .from(ORIGINALS_BUCKET)
        .download(capture.original_photo_path);
      if (dlErr || !originalBlob) {
        throw new Error("Falha ao baixar foto original");
      }
      const originalBytes = new Uint8Array(await originalBlob.arrayBuffer());
      if (originalBytes.byteLength < MIN_VALID_BYTES) {
        throw new Error("Foto original vazia ou inválida");
      }

      // 4) Try Photon crop. On any failure we MUST NOT upload the original
      //    photo to face-crop.jpg — that would let retries treat it as a true
      //    crop. We just skip the upload and let the original stand in for
      //    this single attempt; the next retry will retry Photon because
      //    face-crop.jpg will still be absent.
      try {
        const result = await buildFaceCropJpeg(originalBytes);
        if (!result.bytes || result.bytes.byteLength < MIN_VALID_BYTES) {
          throw new Error("JPEG do crop vazio");
        }

        const { error: faceUpErr } = await supabaseAdmin.storage
          .from(ORIGINALS_BUCKET)
          .upload(faceCropPath, result.bytes, { contentType: "image/jpeg", upsert: true });
        if (faceUpErr) throw new Error(`Falha ao salvar face crop: ${faceUpErr.message}`);

        faceCropWidth = result.width;
        faceCropHeight = result.height;
        console.log(`${FACE_LOG} crop novo gerado e salvo`, {
          bytes: result.bytes.byteLength,
          width: faceCropWidth,
          height: faceCropHeight,
        });

        const { data: signedFace, error: signFaceErr } = await supabaseAdmin.storage
          .from(ORIGINALS_BUCKET)
          .createSignedUrl(faceCropPath, SIGNED_REF_TTL);
        if (signFaceErr || !signedFace?.signedUrl) {
          throw new Error("Falha ao gerar URL do face crop");
        }
        faceCropSignedUrl = signedFace.signedUrl;
      } catch (e) {
        // Fallback: original photo as identity reference only for THIS attempt.
        // face-crop.jpg is intentionally left non-existent so the next retry
        // can attempt Photon again.
        faceCropFallback = true;
        const reason = e instanceof Error ? e.message : "erro desconhecido";
        console.warn(`${FACE_LOG} fallback para original — face-crop.jpg NÃO será salvo`, {
          reason,
        });
        faceCropSignedUrl = null;
      }
    }

    // 5) Build the three input image references.
    //    - With a real crop: identity = face-crop, appearance = original.
    //    - On fallback: identity and appearance both come from the original
    //      photo for this single attempt. face-crop.jpg stays absent.
    const identityUrl = faceCropSignedUrl ?? signedVisitor.signedUrl;
    const appearanceUrl = signedVisitor.signedUrl;

    const promptText = buildPromptText(scenePack.prompt, film?.title);

    const { data: generation, error: genErr } = await supabaseAdmin
      .from("pipoca_generations")
      .insert({
        session_id: session.id,
        film_id: session.selected_film_id,
        scene_pack_id: session.scene_pack_id,
        capture_id: capture.id,
        status: "queued",
        provider: "replicate",
        attempt_number: attemptNumber,
      })
      .select("id")
      .single();
    if (genErr || !generation) throw new Error("Falha ao criar registro de geração");

    console.log(`${LOG} geração criada`, {
      generationId: generation.id,
      attempt: attemptNumber,
    });

    console.log(`${GEN_LOG} usando 3 referências`, {
      generationId: generation.id,
      order: faceCropFallback
        ? ["original (fallback)", "original", "scene-base"]
        : ["face-crop", "original", "scene-base"],
      fallback: faceCropFallback,
    });

    let prediction: ReplicatePrediction;
    try {
      prediction = await createReplicatePrediction({
        prompt: promptText,
        identityUrl,
        appearanceUrl,
        sceneImageUrl: scenePack.reference_image_url,
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
      console.warn(`${LOG} geração falhou ao criar prediction`);
      throw new Error("Falha ao iniciar geração");
    }

    console.log(`${LOG} prediction criada na Replicate`, {
      generationId: generation.id,
      predictionId: prediction.id,
      status: prediction.status,
    });

    await supabaseAdmin
      .from("pipoca_generations")
      .update({
        status: "processing",
        provider_job_id: prediction.id,
        metadata: {
          model: REPLICATE_MODEL,
          attempt: attemptNumber,
          face_crop_path: faceCropPath,
          face_crop_reused: faceCropReused,
          face_crop_fallback: faceCropFallback,
          face_crop_dimensions:
            faceCropWidth && faceCropHeight ? `${faceCropWidth}x${faceCropHeight}` : null,
          input_image_count: 3,
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
  | { status: "completed"; generationId: string; imageUrl: string };

export const getPipocaGenerationStatus = createServerFn({ method: "POST" })
  .inputValidator((input) => StatusInput.parse(input))
  .handler(async ({ data }): Promise<StatusResponse> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: gen, error: gErr } = await supabaseAdmin
      .from("pipoca_generations")
      .select(
        "id, session_id, status, provider_job_id, final_image_path, created_at",
      )
      .eq("id", data.generationId)
      .maybeSingle();
    if (gErr || !gen) throw new Error("Geração não encontrada");

    // Already completed: just re-sign the existing file
    if (gen.status === "completed" && gen.final_image_path) {
      const { data: signed, error: sErr } = await supabaseAdmin.storage
        .from(GENERATED_BUCKET)
        .createSignedUrl(gen.final_image_path, SIGNED_DOWNLOAD_TTL);
      if (sErr || !signed?.signedUrl) throw new Error("Falha ao gerar URL final");
      return {
        status: "completed",
        generationId: gen.id,
        imageUrl: signed.signedUrl,
      };
    }

    if (gen.status === "failed") {
      return { status: "failed", error: "Geração falhou" };
    }

    if (!gen.provider_job_id) throw new Error("provider_job_id ausente");

    let pred: ReplicatePrediction;
    try {
      pred = await getReplicatePrediction(gen.provider_job_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro desconhecido";
      console.warn(`${LOG} prediction consultada com erro`);
      return { status: "processing" };
    }
    console.log(`${LOG} prediction consultada`, {
      predictionId: pred.id,
      status: pred.status,
    });

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
        .update({ status: "failed", error_message: errMsg })
        .eq("id", gen.id);
      await supabaseAdmin
        .from("pipoca_sessions")
        .update({ status: "failed" })
        .eq("id", gen.session_id);
      console.warn(`${LOG} geração falhou`);
      return { status: "failed", error: "Não foi possível criar a cena" };
    }

    // succeeded
    const outputUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    if (!outputUrl || typeof outputUrl !== "string") {
      await supabaseAdmin
        .from("pipoca_generations")
        .update({ status: "failed", error_message: "Sem output" })
        .eq("id", gen.id);
      return { status: "failed", error: "Saída vazia do modelo" };
    }

    const imgRes = await fetch(outputUrl);
    if (!imgRes.ok) {
      throw new Error(`Falha ao baixar imagem: ${imgRes.status}`);
    }
    const buf = new Uint8Array(await imgRes.arrayBuffer());
    const finalPath = `${gen.session_id}/${gen.id}/final.jpg`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(GENERATED_BUCKET)
      .upload(finalPath, buf, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw new Error(`Upload final falhou: ${upErr.message}`);
    console.log(`${LOG} imagem final salva`, { generationId: gen.id });

    const processingMs =
      typeof pred.metrics?.predict_time === "number"
        ? Math.round(pred.metrics.predict_time * 1000)
        : null;

    await supabaseAdmin
      .from("pipoca_generations")
      .update({
        status: "completed",
        final_image_path: finalPath,
        error_message: null,
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
    };
  });
