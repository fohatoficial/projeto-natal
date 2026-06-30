-- Pipoca & Cena — adiciona "Cinemateca Brasileira" como opção selecionável
-- Executar manualmente no Supabase. Idempotente.

BEGIN;

INSERT INTO public.pipoca_capitals
  (name, uf, slug, display_order, active, selectable, is_system)
VALUES
  ('Cinemateca Brasileira', 'SP', 'cinemateca-brasileira', 70, true, true, false)
ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  uf            = EXCLUDED.uf,
  display_order = EXCLUDED.display_order,
  active        = true,
  selectable    = true,
  is_system     = false,
  updated_at    = now();

COMMIT;
