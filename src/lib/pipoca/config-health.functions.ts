import { createServerFn } from "@tanstack/react-start";

/**
 * Reports which required server secrets are missing.
 * Returns ONLY variable names — never values.
 */
export const getConfigHealth = createServerFn({ method: "GET" }).handler(async () => {
  const required = [
    "PIPOCA_PRINT_QUEUE_COOKIE_SECRET",
    "PIPOCA_PRINT_QUEUE_PIN",
    "PIPOCA_REPLICATE_API_TOKEN",
    "PIPOCA_SUPABASE_SERVICE_ROLE_KEY",
  ] as const;

  const missing = required.filter((name) => {
    const value = process.env[name];
    if (!value || value.trim().length === 0) return true;
    if (name === "PIPOCA_PRINT_QUEUE_COOKIE_SECRET" && value.length < 16) return true;
    return false;
  });

  if (missing.length > 0) {
    console.error("[PIPOCA_CONFIG] variáveis de ambiente ausentes", { missing });
  }

  return { ok: missing.length === 0, missing: missing as string[] };
});
