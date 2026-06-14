import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LOG = "[PIPOCA_SERVER]";

const PrepareInput = z.object({
  filmId: z.string().uuid(),
  deviceId: z.string().max(120).nullish(),
  contentType: z.literal("image/jpeg"),
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

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("pipoca_sessions")
      .insert({
        device_id: data.deviceId ?? null,
        selected_film_id: data.filmId,
        scene_pack_id: scenePack.id,
        status: "photo_step",
      })
      .select("id")
      .single();
    if (sessionError || !session) throw new Error("Falha ao criar sessão");
    console.log(`${LOG} sessão criada`, { sessionId: session.id });

    const { data: capture, error: captureError } = await supabaseAdmin
      .from("pipoca_captures")
      .insert({
        session_id: session.id,
        validation_status: "pending",
      })
      .select("id")
      .single();
    if (captureError || !capture) throw new Error("Falha ao criar captura");
    console.log(`${LOG} captura criada`, { captureId: capture.id });

    const path = `${session.id}/${capture.id}/original.jpg`;

    const { error: updateError } = await supabaseAdmin
      .from("pipoca_captures")
      .update({ original_photo_path: path })
      .eq("id", capture.id);
    if (updateError) throw new Error("Falha ao registrar caminho");

    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from("pipoca-visitor-originals")
      .createSignedUploadUrl(path);
    if (signedError || !signed) throw new Error("Falha ao criar URL de upload");
    console.log(`${LOG} signed upload criado`, { path });

    return {
      sessionId: session.id,
      captureId: capture.id,
      path,
      token: signed.token,
    };
  });

const ConfirmInput = z.object({
  sessionId: z.string().uuid(),
  captureId: z.string().uuid(),
  path: z.string().min(1),
});

export const confirmPipocaCaptureUpload = createServerFn({ method: "POST" })
  .inputValidator((input) => ConfirmInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: capture, error: capErr } = await supabaseAdmin
      .from("pipoca_captures")
      .select("id, session_id, original_photo_path")
      .eq("id", data.captureId)
      .maybeSingle();
    if (capErr) throw new Error("Falha ao validar captura");
    if (!capture) throw new Error("Captura não encontrada");
    if (capture.session_id !== data.sessionId) throw new Error("Sessão inválida");
    if (capture.original_photo_path !== data.path) throw new Error("Caminho inválido");

    const { error: updCapErr } = await supabaseAdmin
      .from("pipoca_captures")
      .update({ validation_status: "uploaded", validation_error: null })
      .eq("id", data.captureId);
    if (updCapErr) throw new Error("Falha ao confirmar captura");

    const { error: updSesErr } = await supabaseAdmin
      .from("pipoca_sessions")
      .update({ status: "photo_confirmed" })
      .eq("id", data.sessionId);
    if (updSesErr) throw new Error("Falha ao confirmar sessão");

    console.log(`${LOG} upload confirmado`, {
      sessionId: data.sessionId,
      captureId: data.captureId,
    });

    return { success: true as const, sessionId: data.sessionId, captureId: data.captureId };
  });
