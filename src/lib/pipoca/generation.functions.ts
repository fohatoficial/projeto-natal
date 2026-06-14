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
async function buildFaceCropJpeg(originalBytes: Uint8Array): Promise<Uint8Array> {
  const photon = await import("@cf-wasm/photon");
  const img = photon.PhotonImage.new_from_byteslice(originalBytes);
  try {
    const w = img.get_width();
    const h = img.get_height();

    const cropW = Math.round(w * 0.6);
    const cropH = Math.round(h * 0.55);
    const x = Math.max(0, Math.round((w - cropW) / 2));
    // shift up: top of the crop sits at ~12% of the image height instead of centered
    const y = Math.max(0, Math.round(h * 0.12));
    const y2 = Math.min(h, y + cropH);
    const x2 = Math.min(w, x + cropW);

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
        return resized.get_bytes_jpeg(92);
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

  // 1. Identity vs environment — clear priority declaration
  parts.push(
    "Image 1 is the IDENTITY REFERENCE. The visitor's face, skin tone, hair, age, and recognizable features must be faithfully preserved.",
  );
  parts.push(
    "Image 2 is the ENVIRONMENT AND COMPOSITION REFERENCE. Match its framing, lighting direction, depth, spatial layout, and atmosphere.",
  );

  // 2. Hard rules — non-negotiable
  parts.push(
    "HARD RULES (highest priority): exactly one person in the final image — and that person is the visitor from image 1.",
  );
  parts.push(
    "The visitor must remain highly recognizable as the same person: same face, same skin, same identity.",
  );
  parts.push(
    "The visitor must be naturally integrated into the environment of image 2 — no pasted look, no cutout composite, no flat overlay.",
  );
  parts.push(
    "Body scale, posture, light on the skin, contact shadows, and depth of field must all match the surrounding scene.",
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
  visitorImageUrl: string;
  sceneImageUrl: string;
}): Promise<ReplicatePrediction> {
  const token = getReplicateToken();
  const body = {
    input: {
      prompt: input.prompt,
      input_images: [input.visitorImageUrl, input.sceneImageUrl],
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

    // Signed download URL for the visitor's private photo (consumed by Replicate)
    const { data: signedVisitor, error: signErr } = await supabaseAdmin.storage
      .from(ORIGINALS_BUCKET)
      .createSignedUrl(capture.original_photo_path, SIGNED_REF_TTL);
    if (signErr || !signedVisitor?.signedUrl) {
      throw new Error("Falha ao gerar URL da foto original");
    }

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

    let prediction: ReplicatePrediction;
    try {
      prediction = await createReplicatePrediction({
        prompt: promptText,
        visitorImageUrl: signedVisitor.signedUrl,
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
        metadata: { model: REPLICATE_MODEL, attempt: attemptNumber },
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
