import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LOG = "[PIPOCA_SERVER]";
const ORIGINALS_BUCKET = "pipoca-visitor-originals";
const MIN_VALID_BYTES = 2048;

// Single medium-shot file. Identity and appearance both point to it
// downstream — see generation.functions.ts.
const MEDIUM_NAME = "visitor-medium.jpg";

const PrepareInput = z.object({
  filmId: z.string().uuid(),
  deviceId: z.string().max(120).nullish(),
  contentType: z.literal("image/jpeg"),
  visitorId: z.string().uuid().nullish(),
});

export const createPipocaCaptureUpload = createServerFn({ method: "POST" })
  .inputValidator((input) => PrepareInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: film, error: filmError } = await supabaseAdmin
      .from("pipoca_films")
      .select("id, active")
      .eq("id", data.filmId)
      .maybeSingle();
    if (filmError) throw new Error("Falha ao validar filme");
    if (!film || !film.active) throw new Error("Filme inativo ou inexistente");

    const { data: scenePack, error: spError } = await supabaseAdmin
      .from("pipoca_scene_packs")
      .select("id")
      .eq("film_id", data.filmId)
      .eq("active", true)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (spError) throw new Error("Falha ao localizar scene pack");
    if (!scenePack) throw new Error("Scene pack indisponível para este filme");

    let linkedVisitorId: string | null = null;
    if (data.visitorId) {
      const { data: visitor } = await supabaseAdmin
        .from("pipoca_visitors")
        .select("id, experience_consent")
        .eq("id", data.visitorId)
        .maybeSingle();
      if (visitor && visitor.experience_consent) {
        linkedVisitorId = visitor.id;
      }
    }

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("pipoca_sessions")
      .insert({
        device_id: data.deviceId ?? null,
        selected_film_id: data.filmId,
        scene_pack_id: scenePack.id,
        status: "photo_step",
        visitor_id: linkedVisitorId,
      })
      .select("id")
      .single();
    if (sessionError || !session) throw new Error("Falha ao criar sessão");

    const { data: capture, error: captureError } = await supabaseAdmin
      .from("pipoca_captures")
      .insert({
        session_id: session.id,
        validation_status: "pending",
      })
      .select("id")
      .single();
    if (captureError || !capture) throw new Error("Falha ao criar captura");

    const mediumPath = `${session.id}/${capture.id}/${MEDIUM_NAME}`;

    const { error: updateError } = await supabaseAdmin
      .from("pipoca_captures")
      .update({ original_photo_path: mediumPath })
      .eq("id", capture.id);
    if (updateError) throw new Error("Falha ao registrar caminho");

    const { data: signedMedium, error: sMedErr } = await supabaseAdmin.storage
      .from(ORIGINALS_BUCKET)
      .createSignedUploadUrl(mediumPath);
    if (sMedErr || !signedMedium) throw new Error("Falha ao criar URL de upload");

    console.log(`${LOG} upload assinado criado (single medium)`, {
      sessionId: session.id,
      captureId: capture.id,
    });

    return {
      sessionId: session.id as string,
      captureId: capture.id as string,
      uploads: {
        medium: { path: mediumPath, token: signedMedium.token },
      },
    };
  });

const ConfirmInput = z.object({
  sessionId: z.string().uuid(),
  captureId: z.string().uuid(),
});

export const confirmPipocaCaptureUpload = createServerFn({ method: "POST" })
  .inputValidator((input) => ConfirmInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: capture, error: capErr } = await supabaseAdmin
      .from("pipoca_captures")
      .select("id, session_id")
      .eq("id", data.captureId)
      .maybeSingle();
    if (capErr) throw new Error("Falha ao validar captura");
    if (!capture) throw new Error("Captura não encontrada");
    if (capture.session_id !== data.sessionId) throw new Error("Sessão inválida");

    const folder = `${data.sessionId}/${data.captureId}`;
    const mediumPath = `${folder}/${MEDIUM_NAME}`;

    const { data: listing, error: listErr } = await supabaseAdmin.storage
      .from(ORIGINALS_BUCKET)
      .list(folder, { limit: 100 });
    if (listErr) throw new Error("Falha ao listar uploads");

    const medEntry = listing?.find((f) => f.name === MEDIUM_NAME);
    const medSize = (medEntry?.metadata as { size?: number } | undefined)?.size ?? 0;

    if (!medEntry || medSize < MIN_VALID_BYTES) {
      throw new Error("Foto ausente ou inválida");
    }

    const { error: updCapErr } = await supabaseAdmin
      .from("pipoca_captures")
      .update({
        validation_status: "uploaded",
        validation_error: null,
        original_photo_path: mediumPath,
      })
      .eq("id", data.captureId);
    if (updCapErr) throw new Error("Falha ao confirmar captura");

    const { error: updSesErr } = await supabaseAdmin
      .from("pipoca_sessions")
      .update({ status: "photo_confirmed" })
      .eq("id", data.sessionId);
    if (updSesErr) throw new Error("Falha ao confirmar sessão");

    console.log(`${LOG} foto única confirmada`, {
      sessionId: data.sessionId,
      captureId: data.captureId,
    });

    return {
      success: true as const,
      sessionId: data.sessionId,
      captureId: data.captureId,
      paths: { medium: mediumPath },
    };
  });
