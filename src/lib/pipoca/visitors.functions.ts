import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isValidBrWhatsapp, last4FromE164, toE164Br } from "@/lib/pipoca/whatsapp";

const LOG = "[PIPOCA_VISITOR]";

const Input = z.object({
  fullName: z.string().trim().min(2).max(120),
  whatsapp: z.string().min(8).max(32),
  experienceConsent: z.literal(true, {
    errorMap: () => ({ message: "Consentimento obrigatório" }),
  }),
  privacyNoticeVersion: z.string().trim().min(1).max(20),
  marketingConsent: z.boolean().optional(),
});

function normalizeFullName(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (cleaned.length < 2) throw new Error("Nome inválido");
  if (/^\d+$/.test(cleaned)) throw new Error("Nome inválido");
  return cleaned;
}

function firstNameOf(full: string): string {
  const part = full.split(" ")[0]?.trim() ?? "";
  return part.slice(0, 24);
}

export const createPipocaVisitor = createServerFn({ method: "POST" })
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const fullName = normalizeFullName(data.fullName);
    const firstName = firstNameOf(fullName);
    if (!isValidBrWhatsapp(data.whatsapp)) throw new Error("WhatsApp inválido");
    const e164 = toE164Br(data.whatsapp);
    const last4 = last4FromE164(e164);

    const now = new Date().toISOString();
    const { data: row, error } = await supabaseAdmin
      .from("pipoca_visitors")
      .insert({
        full_name: fullName,
        first_name: firstName,
        whatsapp_e164: e164,
        whatsapp_last4: last4,
        experience_consent: true,
        experience_consent_at: now,
        privacy_notice_version: data.privacyNoticeVersion,
        marketing_consent: Boolean(data.marketingConsent),
        marketing_consent_at: data.marketingConsent ? now : null,
      })
      .select("id, first_name")
      .single();
    if (error || !row) {
      console.warn(`${LOG} falha ao criar visitante`, error?.message);
      throw new Error("Falha ao registrar visitante");
    }

    console.log(`${LOG} visitante criado`, { id: row.id, len: fullName.length });
    console.log("[PIPOCA_CONSENT] autorização registrada", { version: data.privacyNoticeVersion });
    return { visitorId: row.id as string, firstName: row.first_name as string };
  });
