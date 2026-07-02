import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LOG = "[PIPOCA_SERVER]";
const ORIGINALS_BUCKET = "pipoca-visitor-originals";
const MIN_VALID_BYTES = 2048;

const IDENTITY_NAME = "identity-close.jpg";
const IDENTITY_RAW_NAME = "identity-raw.jpg";
const APPEARANCE_NAME = "appearance-medium.jpg";

const PrepareInput = z.object({
  filmId: z.string().uuid(),
  deviceId: z.string().max(120).nullish(),
  contentType: z.literal("image/jpeg"),
  visitorId: z.string().uuid().nullish(),
  capitalSlug: z.string().min(1).max(80).nullish(),
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
      .select("id, film_id")
      .eq("film_id", data.filmId)
      .eq("active", true)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (spError) throw new Error("Falha ao localizar scene pack");
    if (!scenePack) throw new Error("Scene pack indisponível para este filme");
    if (scenePack.film_id !== data.filmId) {
      console.warn(`${LOG} SCENE_PACK_FILM_MISMATCH no prepare`, {
        selected_film_id: data.filmId,
        scene_pack_id: scenePack.id,
        scene_pack_film_id: scenePack.film_id,
      });
      throw new Error("SCENE_PACK_FILM_MISMATCH");
    }
    console.log(`[PIPOCA_FILM_ROUTING]`, {
      stage: "prepare",
      selected_film_id: data.filmId,
      resolved_scene_pack_id: scenePack.id,
      resolved_scene_pack_film_id: scenePack.film_id,
      routing_match: true,
    });

    // Resolve capital from slug (required for new captures). Historical
    // records without capital_id stay valid because the column is nullable
    // in the DB; the application requires a slug going forward.
    let capitalId: string | null = null;
    if (data.capitalSlug) {
      const { data: capital } = await supabaseAdmin
        .from("pipoca_capitals")
        .select("id, active")
        .eq("slug", data.capitalSlug)
        .maybeSingle();
      if (!capital || !capital.active) {
        console.warn(`${LOG} CAPITAL_INVALID`, { capital_slug: data.capitalSlug });
        throw new Error("Capital inválida — selecione novamente.");
      }
      capitalId = capital.id as string;
    } else {
      console.warn(`${LOG} CAPITAL_SELECTION_REQUIRED — capture sem capital_slug`);
      throw new Error("Capital não selecionada. Volte para a tela inicial.");
    }

    // If a visitorId was provided, ensure the visitor exists and granted
    // experience consent before linking it to the session.
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
        capital_id: capitalId,
      })
      .select("id")
      .single();
    if (sessionError || !session) throw new Error("Falha ao criar sessão");

    const { data: capture, error: captureError } = await supabaseAdmin
      .from("pipoca_captures")
      .insert({
        session_id: session.id,
        validation_status: "pending",
        capital_id: capitalId,
      })
      .select("id")
      .single();
    if (captureError || !capture) throw new Error("Falha ao criar captura");

    console.log(`${LOG} CAPTURE_CAPITAL_ATTACHED`, {
      capital_id: capitalId,
      capital_slug: data.capitalSlug,
      capture_id: capture.id,
    });

    const identityPath = `${session.id}/${capture.id}/${IDENTITY_NAME}`;
    const appearancePath = `${session.id}/${capture.id}/${APPEARANCE_NAME}`;

    // We still record identity-close.jpg in `original_photo_path` for backward
    // compatibility with the existing schema (no new column was created).
    const { error: updateError } = await supabaseAdmin
      .from("pipoca_captures")
      .update({ original_photo_path: identityPath })
      .eq("id", capture.id);
    if (updateError) throw new Error("Falha ao registrar caminho");

    const { data: signedIdentity, error: sIdErr } = await supabaseAdmin.storage
      .from(ORIGINALS_BUCKET)
      .createSignedUploadUrl(identityPath);
    if (sIdErr || !signedIdentity) throw new Error("Falha ao criar URL de upload (identidade)");

    const { data: signedAppearance, error: sApErr } = await supabaseAdmin.storage
      .from(ORIGINALS_BUCKET)
      .createSignedUploadUrl(appearancePath);
    if (sApErr || !signedAppearance) throw new Error("Falha ao criar URL de upload (aparência)");

    console.log(`${LOG} dois uploads assinados criados`, {
      sessionId: session.id,
      captureId: capture.id,
    });

    return {
      sessionId: session.id as string,
      captureId: capture.id as string,
      uploads: {
        identity: { path: identityPath, token: signedIdentity.token },
        appearance: { path: appearancePath, token: signedAppearance.token },
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

    // Server-derived paths only — never trust client.
    const folder = `${data.sessionId}/${data.captureId}`;
    const identityPath = `${folder}/${IDENTITY_NAME}`;
    const appearancePath = `${folder}/${APPEARANCE_NAME}`;

    // List the capture folder and verify both files exist with minimum size.
    const { data: listing, error: listErr } = await supabaseAdmin.storage
      .from(ORIGINALS_BUCKET)
      .list(folder, { limit: 100 });
    if (listErr) throw new Error("Falha ao listar uploads");

    const idEntry = listing?.find((f) => f.name === IDENTITY_NAME);
    const apEntry = listing?.find((f) => f.name === APPEARANCE_NAME);
    const idSize = (idEntry?.metadata as { size?: number } | undefined)?.size ?? 0;
    const apSize = (apEntry?.metadata as { size?: number } | undefined)?.size ?? 0;

    if (!idEntry || idSize < MIN_VALID_BYTES) {
      throw new Error("Foto de identidade ausente ou inválida");
    }
    if (!apEntry || apSize < MIN_VALID_BYTES) {
      throw new Error("Foto de aparência ausente ou inválida");
    }

    const { error: updCapErr } = await supabaseAdmin
      .from("pipoca_captures")
      .update({
        validation_status: "uploaded",
        validation_error: null,
        original_photo_path: identityPath,
      })
      .eq("id", data.captureId);
    if (updCapErr) throw new Error("Falha ao confirmar captura");

    const { error: updSesErr } = await supabaseAdmin
      .from("pipoca_sessions")
      .update({ status: "photo_confirmed" })
      .eq("id", data.sessionId);
    if (updSesErr) throw new Error("Falha ao confirmar sessão");

    console.log(`${LOG} duas fotos confirmadas`, {
      sessionId: data.sessionId,
      captureId: data.captureId,
    });

    return {
      success: true as const,
      sessionId: data.sessionId,
      captureId: data.captureId,
      paths: { identity: identityPath, appearance: appearancePath },
    };
  });
