import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GENERATED_BUCKET = "pipoca-generated-scenes";
const SIGNED_TTL = 60 * 30;
const LOG = "[PIPOCA_POSTCARD]";

const PrepareInput = z.object({
  generationId: z.string().uuid(),
});

const ConfirmInput = z.object({
  generationId: z.string().uuid(),
  path: z.string().min(1),
  messageType: z.enum(["preset", "custom"]),
  messageText: z.string().trim().min(1).max(100),
  fontStyle: z.enum(["classic", "script", "modern"]).default("classic"),
  dividerStyle: z.enum(["snowflake", "star", "branch", "ornament"]).default("snowflake"),
});


/** Cria uma signed upload URL para o cartão-postal composto no cliente. */
export const preparePipocaPostcardUpload = createServerFn({ method: "POST" })
  .inputValidator((input) => PrepareInput.parse(input))
  .handler(async ({ data }): Promise<{ path: string; token: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: gen, error } = await supabaseAdmin
      .from("pipoca_generations")
      .select("id, session_id, status")
      .eq("id", data.generationId)
      .maybeSingle();
    if (error || !gen) throw new Error("Geração não encontrada");
    if (gen.status !== "completed") throw new Error("Geração ainda não concluída");

    const path = `${gen.session_id}/${gen.id}/postcard.jpg`;
    await supabaseAdmin.storage.from(GENERATED_BUCKET).remove([path]).catch(() => undefined);
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(GENERATED_BUCKET)
      .createSignedUploadUrl(path);
    if (sErr || !signed?.token) throw new Error("Falha ao preparar upload do cartão");

    console.log(`${LOG} upload preparado`, { generationId: gen.id });
    return { path, token: signed.token };
  });

/** Persiste mensagem + postal final e devolve a URL assinada do cartão. */
export const confirmPipocaPostcard = createServerFn({ method: "POST" })
  .inputValidator((input) => ConfirmInput.parse(input))
  .handler(
    async ({ data }): Promise<{ postcardUrl: string; postcardPath: string }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: gen, error } = await supabaseAdmin
        .from("pipoca_generations")
        .select("id, metadata")
        .eq("id", data.generationId)
        .maybeSingle();
      if (error || !gen) throw new Error("Geração não encontrada");

      const mergedMetadata = {
        ...(typeof gen.metadata === "object" && gen.metadata !== null
          ? (gen.metadata as Record<string, unknown>)
          : {}),
        postcard_image_path: data.path,
        postcard_message: data.messageText,
        postcard_message_type: data.messageType,
        postcard_finalized_at: new Date().toISOString(),
      };

      // Colunas dedicadas quando a migration já foi aplicada; caso contrário,
      // o mesmo conteúdo permanece em metadata (fallback compatível).
      const withColumns = await supabaseAdmin
        .from("pipoca_generations")
        .update({
          postcard_image_path: data.path,
          postcard_message: data.messageText,
          postcard_message_type: data.messageType,
          metadata: mergedMetadata,
        })
        .eq("id", gen.id);

      if (withColumns.error) {
        console.warn(`${LOG} colunas dedicadas indisponíveis, usando metadata`);
        const { error: mErr } = await supabaseAdmin
          .from("pipoca_generations")
          .update({ metadata: mergedMetadata })
          .eq("id", gen.id);
        if (mErr) throw new Error("Falha ao salvar o cartão-postal");
      }

      const { data: signed, error: sErr } = await supabaseAdmin.storage
        .from(GENERATED_BUCKET)
        .createSignedUrl(data.path, SIGNED_TTL);
      if (sErr || !signed?.signedUrl) throw new Error("Falha ao assinar cartão-postal");

      console.log(`${LOG} cartão finalizado`, {
        generationId: gen.id,
        messageType: data.messageType,
      });
      return { postcardUrl: signed.signedUrl, postcardPath: data.path };
    },
  );
