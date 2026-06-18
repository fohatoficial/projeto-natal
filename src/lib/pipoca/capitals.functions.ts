import { createServerFn } from "@tanstack/react-start";

export type PipocaCapital = {
  id: string;
  name: string;
  uf: string;
  slug: string;
  display_order: number;
};

// Leitura pública (anon) — política RLS já restringe a active=true.
export const listActiveCapitals = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ capitals: PipocaCapital[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("pipoca_capitals")
      .select("id, name, uf, slug, display_order")
      .eq("active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error("Falha ao carregar capitais");
    return { capitals: (data ?? []) as PipocaCapital[] };
  },
);
