-- Pipoca & Cena — Etapa 2: capital_id na fila de impressão
-- Executar manualmente no Supabase EXTERNO (não é aplicado automaticamente).
-- Totalmente idempotente: pode ser executado mais de uma vez.
-- Pré-requisito: migration 20260618_pipoca_capitals.sql já executada.

BEGIN;

-- =========================================================================
-- 1) Coluna capital_id em pipoca_print_queue ------------------------------
-- =========================================================================
ALTER TABLE public.pipoca_print_queue
  ADD COLUMN IF NOT EXISTS capital_id uuid REFERENCES public.pipoca_capitals(id);

-- 2) Índice composto para o filtro da fila --------------------------------
CREATE INDEX IF NOT EXISTS idx_pipoca_print_queue_capital_status_created
  ON public.pipoca_print_queue (capital_id, status, created_at DESC);

-- =========================================================================
-- 3) Backfill — prioridade: geração -> captura -> Capital desconhecida ----
-- =========================================================================
DO $$
DECLARE
  v_unknown uuid;
BEGIN
  SELECT id INTO v_unknown
  FROM public.pipoca_capitals
  WHERE slug = 'capital-desconhecida';

  IF v_unknown IS NULL THEN
    RAISE EXCEPTION 'Capital desconhecida não encontrada — execute 20260618 antes.';
  END IF;

  -- 3.1) Da geração relacionada
  UPDATE public.pipoca_print_queue q
     SET capital_id = g.capital_id
    FROM public.pipoca_generations g
   WHERE q.capital_id IS NULL
     AND q.generation_id = g.id
     AND g.capital_id IS NOT NULL;

  -- 3.2) Da captura relacionada (via generation.capture_id)
  UPDATE public.pipoca_print_queue q
     SET capital_id = c.capital_id
    FROM public.pipoca_generations g
    JOIN public.pipoca_captures   c ON c.id = g.capture_id
   WHERE q.capital_id IS NULL
     AND q.generation_id = g.id
     AND c.capital_id IS NOT NULL;

  -- 3.3) Fallback: Capital desconhecida
  UPDATE public.pipoca_print_queue
     SET capital_id = v_unknown
   WHERE capital_id IS NULL;
END $$;

-- =========================================================================
-- 4) Garantir NOT NULL após o backfill ------------------------------------
-- =========================================================================
ALTER TABLE public.pipoca_print_queue
  ALTER COLUMN capital_id SET NOT NULL;

COMMIT;

-- =========================================================================
-- 5) Validações (executar separadamente) ----------------------------------
-- =========================================================================
-- Nenhum item nulo (esperado = 0):
--   SELECT count(*) FROM public.pipoca_print_queue WHERE capital_id IS NULL;
-- Distribuição por capital:
--   SELECT c.name, count(*) FROM public.pipoca_print_queue q
--     JOIN public.pipoca_capitals c ON c.id = q.capital_id
--    GROUP BY c.name ORDER BY count(*) DESC;
