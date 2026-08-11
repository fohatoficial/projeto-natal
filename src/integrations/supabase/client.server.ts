import { createClient } from "@supabase/supabase-js";
import process from "node:process";

// SERVER-ONLY admin client. The `.server.ts` suffix prevents Vite from
// bundling this module into the browser. Never import it from a component,
// hook, or any client-reachable file at module scope.
//
// In `*.functions.ts` files (which are client-reachable), import this
// lazily INSIDE the `.handler()` body:
//   const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[supabase/client.server] Missing env var: ${name}`);
  }
  return value;
}

const supabaseUrl = getEnv("PIPOCA_SUPABASE_URL");

// Note: Lovable reserves the "SUPABASE_" prefix for managed secrets, so the
// external project's service_role is stored as PIPOCA_SUPABASE_SERVICE_ROLE_KEY.
export const supabaseAdmin = createClient(
  supabaseUrl,
  getEnv("PIPOCA_SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);
