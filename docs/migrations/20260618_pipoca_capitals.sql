-- Pipoca & Cena — capitais + vinculação em sessions/captures/generations
-- Executar manualmente no projeto Supabase EXTERNO (não é aplicado automaticamente).
-- Idempotente: pode ser executado mais de uma vez sem efeitos colaterais.

-- 1) Tabela de capitais ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipoca_capitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  uf text NOT NULL,
  slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipoca_capitals_slug
  ON public.pipoca_capitals (slug);
CREATE INDEX IF NOT EXISTS idx_pipoca_capitals_active
  ON public.pipoca_capitals (active);
CREATE INDEX IF NOT EXISTS idx_pipoca_capitals_display_order
  ON public.pipoca_capitals (display_order);

GRANT SELECT ON public.pipoca_capitals TO anon;
GRANT SELECT ON public.pipoca_capitals TO authenticated;
GRANT ALL ON public.pipoca_capitals TO service_role;

ALTER TABLE public.pipoca_capitals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pipoca_capitals anon select active" ON public.pipoca_capitals;
CREATE POLICY "pipoca_capitals anon select active"
  ON public.pipoca_capitals
  FOR SELECT
  TO anon, authenticated
  USING (active = true);

-- 2) Cadastro inicial (idempotente por slug) -----------------------------
INSERT INTO public.pipoca_capitals (name, uf, slug, display_order, active)
VALUES
  ('Brasília',       'DF', 'brasilia',       10, true),
  ('Goiânia',        'GO', 'goiania',        20, true),
  ('Belo Horizonte', 'MG', 'belo-horizonte', 30, true),
  ('São Paulo',      'SP', 'sao-paulo',      40, true),
  ('Salvador',       'BA', 'salvador',       50, true),
  ('Porto Alegre',   'RS', 'porto-alegre',   60, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  uf = EXCLUDED.uf,
  display_order = EXCLUDED.display_order,
  updated_at = now();

-- 3) Vincular capital_id em sessions / captures / generations ------------
-- Nullable nesta etapa para preservar registros históricos.
ALTER TABLE public.pipoca_sessions
  ADD COLUMN IF NOT EXISTS capital_id uuid REFERENCES public.pipoca_capitals(id);

ALTER TABLE public.pipoca_captures
  ADD COLUMN IF NOT EXISTS capital_id uuid REFERENCES public.pipoca_capitals(id);

ALTER TABLE public.pipoca_generations
  ADD COLUMN IF NOT EXISTS capital_id uuid REFERENCES public.pipoca_capitals(id);

-- 4) Índices -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pipoca_sessions_capital_created
  ON public.pipoca_sessions (capital_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipoca_captures_capital_created
  ON public.pipoca_captures (capital_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipoca_generations_capital_created
  ON public.pipoca_generations (capital_id, created_at DESC);
