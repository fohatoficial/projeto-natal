-- Pipoca & Cena — Etapa 1 (revisada): capitais + backfill histórico
-- Executar manualmente no projeto Supabase EXTERNO (não é aplicado automaticamente).
-- Totalmente idempotente: pode ser executado mais de uma vez sem efeitos colaterais.
-- Preserva tudo o que já existe; apenas adiciona/migra dados.

BEGIN;

-- =========================================================================
-- 1) Tabela pipoca_capitals (criação caso não exista) ---------------------
-- =========================================================================
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

-- 1.1) Novos campos para diferenciar capitais reais e registros internos --
ALTER TABLE public.pipoca_capitals
  ADD COLUMN IF NOT EXISTS selectable boolean NOT NULL DEFAULT true;
ALTER TABLE public.pipoca_capitals
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- 1.2) Permitir uf nulo (necessário para "Capital desconhecida") ----------
ALTER TABLE public.pipoca_capitals
  ALTER COLUMN uf DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pipoca_capitals_slug
  ON public.pipoca_capitals (slug);
CREATE INDEX IF NOT EXISTS idx_pipoca_capitals_active
  ON public.pipoca_capitals (active);
CREATE INDEX IF NOT EXISTS idx_pipoca_capitals_display_order
  ON public.pipoca_capitals (display_order);
CREATE INDEX IF NOT EXISTS idx_pipoca_capitals_selectable
  ON public.pipoca_capitals (selectable);

GRANT SELECT ON public.pipoca_capitals TO anon;
GRANT SELECT ON public.pipoca_capitals TO authenticated;
GRANT ALL    ON public.pipoca_capitals TO service_role;

ALTER TABLE public.pipoca_capitals ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 2) Capitais reais (idempotente por slug) --------------------------------
-- =========================================================================
INSERT INTO public.pipoca_capitals
  (name, uf, slug, display_order, active, selectable, is_system)
VALUES
  ('Brasília',       'DF', 'brasilia',       10, true, true, false),
  ('Goiânia',        'GO', 'goiania',        20, true, true, false),
  ('Belo Horizonte', 'MG', 'belo-horizonte', 30, true, true, false),
  ('São Paulo',      'SP', 'sao-paulo',      40, true, true, false),
  ('Salvador',       'BA', 'salvador',       50, true, true, false),
  ('Porto Alegre',   'RS', 'porto-alegre',   60, true, true, false)
ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  uf            = EXCLUDED.uf,
  display_order = EXCLUDED.display_order,
  active        = EXCLUDED.active,
  selectable    = EXCLUDED.selectable,
  is_system     = EXCLUDED.is_system,
  updated_at    = now();

-- =========================================================================
-- 3) "Capital desconhecida" (idempotente, registro de sistema) ------------
-- =========================================================================
INSERT INTO public.pipoca_capitals
  (name, uf, slug, display_order, active, selectable, is_system)
VALUES
  ('Capital desconhecida', NULL, 'capital-desconhecida', 9999, true, false, true)
ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  uf            = NULL,
  active        = true,
  selectable    = false,
  is_system     = true,
  display_order = 9999,
  updated_at    = now();

-- =========================================================================
-- 4) RLS — leitura pública apenas de capitais selecionáveis reais ---------
-- =========================================================================
DROP POLICY IF EXISTS "pipoca_capitals anon select active" ON public.pipoca_capitals;
DROP POLICY IF EXISTS "pipoca_capitals public select selectable" ON public.pipoca_capitals;
DROP POLICY IF EXISTS "pipoca_capitals authenticated select all" ON public.pipoca_capitals;

-- 4.1) anon vê apenas capitais reais e selecionáveis (CapitalGate)
CREATE POLICY "pipoca_capitals public select selectable"
  ON public.pipoca_capitals
  FOR SELECT
  TO anon
  USING (active = true AND selectable = true AND is_system = false);

-- 4.2) authenticated vê tudo (futuro /dados e filtros administrativos)
CREATE POLICY "pipoca_capitals authenticated select all"
  ON public.pipoca_capitals
  FOR SELECT
  TO authenticated
  USING (true);

-- Sem políticas de INSERT/UPDATE/DELETE públicas ou autenticadas.
-- Escrita continua restrita a service_role.

-- =========================================================================
-- 5) Colunas capital_id em sessions / captures / generations --------------
-- =========================================================================
ALTER TABLE public.pipoca_sessions
  ADD COLUMN IF NOT EXISTS capital_id uuid REFERENCES public.pipoca_capitals(id);
ALTER TABLE public.pipoca_captures
  ADD COLUMN IF NOT EXISTS capital_id uuid REFERENCES public.pipoca_capitals(id);
ALTER TABLE public.pipoca_generations
  ADD COLUMN IF NOT EXISTS capital_id uuid REFERENCES public.pipoca_capitals(id);

CREATE INDEX IF NOT EXISTS idx_pipoca_sessions_capital_created
  ON public.pipoca_sessions (capital_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipoca_captures_capital_created
  ON public.pipoca_captures (capital_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipoca_generations_capital_created
  ON public.pipoca_generations (capital_id, created_at DESC);

-- =========================================================================
-- 6) Backfill histórico — usa "Capital desconhecida" como fallback --------
-- =========================================================================
DO $$
DECLARE
  v_unknown uuid;
BEGIN
  SELECT id INTO v_unknown
  FROM public.pipoca_capitals
  WHERE slug = 'capital-desconhecida';

  IF v_unknown IS NULL THEN
    RAISE EXCEPTION 'Capital desconhecida não encontrada — abortando backfill.';
  END IF;

  -- 6.1) Sessões históricas sem capital_id
  UPDATE public.pipoca_sessions
     SET capital_id = v_unknown
   WHERE capital_id IS NULL;

  -- 6.2) Capturas históricas sem capital_id
  UPDATE public.pipoca_captures
     SET capital_id = v_unknown
   WHERE capital_id IS NULL;

  -- 6.3) Gerações históricas: prioridade captura -> sessão -> desconhecida
  UPDATE public.pipoca_generations g
     SET capital_id = c.capital_id
    FROM public.pipoca_captures c
   WHERE g.capital_id IS NULL
     AND g.capture_id  = c.id
     AND c.capital_id IS NOT NULL;

  UPDATE public.pipoca_generations g
     SET capital_id = s.capital_id
    FROM public.pipoca_sessions s
   WHERE g.capital_id IS NULL
     AND g.session_id  = s.id
     AND s.capital_id IS NOT NULL;

  UPDATE public.pipoca_generations
     SET capital_id = v_unknown
   WHERE capital_id IS NULL;
END $$;

COMMIT;

-- =========================================================================
-- 7) Validações pós-migration (executar separadamente para inspecionar) ---
-- =========================================================================
-- Capitais reais cadastradas:
--   SELECT count(*) FROM public.pipoca_capitals WHERE is_system = false;
-- Id da Capital desconhecida:
--   SELECT id FROM public.pipoca_capitals WHERE slug = 'capital-desconhecida';
-- Totais migrados (sem capital_id nulo, esperado = 0):
--   SELECT count(*) FROM public.pipoca_sessions    WHERE capital_id IS NULL;
--   SELECT count(*) FROM public.pipoca_captures    WHERE capital_id IS NULL;
--   SELECT count(*) FROM public.pipoca_generations WHERE capital_id IS NULL;
-- Quantidade total agora vinculada à Capital desconhecida:
--   SELECT 'sessions'    AS t, count(*) FROM public.pipoca_sessions    WHERE capital_id = (SELECT id FROM public.pipoca_capitals WHERE slug='capital-desconhecida')
--   UNION ALL SELECT 'captures',    count(*) FROM public.pipoca_captures    WHERE capital_id = (SELECT id FROM public.pipoca_capitals WHERE slug='capital-desconhecida')
--   UNION ALL SELECT 'generations', count(*) FROM public.pipoca_generations WHERE capital_id = (SELECT id FROM public.pipoca_capitals WHERE slug='capital-desconhecida');
-- Divergências entre captura e geração:
--   SELECT count(*) FROM public.pipoca_generations g
--     JOIN public.pipoca_captures c ON c.id = g.capture_id
--    WHERE g.capital_id IS DISTINCT FROM c.capital_id;
-- Divergências entre sessão e captura:
--   SELECT count(*) FROM public.pipoca_captures c
--     JOIN public.pipoca_sessions s ON s.id = c.session_id
--    WHERE c.capital_id IS DISTINCT FROM s.capital_id;
