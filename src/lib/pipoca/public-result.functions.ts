import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GENERATED_BUCKET = "pipoca-generated-scenes";
const SIGNED_DOWNLOAD_TTL = 60 * 30;
const LOG = "[PIPOCA_PUBLIC_RESULT]";

const Input = z.object({ publicToken: z.string().uuid() });

export type PublicResult = {
  generationId: string;
  filmTitle: string;
  imageUrl: string;
  createdAt: string;
  downloadFilename: string;
};

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "cena";
}

/**
 * Public-safe fetch by public_token. Returns only fields safe to expose:
 * film title, a fresh signed URL to the generated image, the createdAt
 * timestamp and a suggested download filename. Never exposes prompts,
 * visitor identity, original photo paths or service-role data.
 */
export const getPublicPipocaResult = createServerFn({ method: "POST" })
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data }): Promise<PublicResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: gen, error } = await supabaseAdmin
      .from("pipoca_generations")
      .select("id, status, final_image_path, film_id, created_at, public_token")
      .eq("public_token", data.publicToken)
      .maybeSingle();
    if (error) {
      console.warn(`${LOG} erro ao buscar`, error.message);
      throw new Error("Resultado não encontrado");
    }
    if (!gen) throw new Error("Resultado não encontrado");
    if (gen.status !== "completed" || !gen.final_image_path) {
      throw new Error("Resultado indisponível");
    }

    const { data: film } = await supabaseAdmin
      .from("pipoca_films")
      .select("title")
      .eq("id", gen.film_id)
      .maybeSingle();
    const filmTitle = film?.title ?? "Tela Brasil";

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(GENERATED_BUCKET)
      .createSignedUrl(gen.final_image_path, SIGNED_DOWNLOAD_TTL);
    if (sErr || !signed?.signedUrl) throw new Error("Falha ao gerar URL");

    return {
      generationId: gen.id,
      filmTitle,
      imageUrl: signed.signedUrl,
      createdAt: gen.created_at,
      downloadFilename: `pipoca-e-cena-${slugify(filmTitle)}.jpg`,
    };
  });
