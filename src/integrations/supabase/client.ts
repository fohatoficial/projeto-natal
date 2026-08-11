import { createClient } from "@supabase/supabase-js";

// Browser-safe Supabase client. Uses the public/anon (publishable) key.
// Never put service_role here — this module ships to the browser.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";

const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

if (!supabaseUrl || !supabasePublishableKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase/client] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.",
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
