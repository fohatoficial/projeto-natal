-- =========================================================================
-- Projeto Natal — Sprint "Refinamento Visual + Postcard Builder Premium"
-- Persiste o estilo tipográfico e o divisor decorativo escolhidos.
--
-- Idempotente. NÃO executado pelo agente — revise e aplique manualmente.
-- Pré-requisito: 20260819_postcard_message.sql
-- =========================================================================

ALTER TABLE public.pipoca_generations
  ADD COLUMN IF NOT EXISTS postcard_font_style    text,
  ADD COLUMN IF NOT EXISTS postcard_divider_style text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pipoca_generations_postcard_font_style_chk'
  ) THEN
    ALTER TABLE public.pipoca_generations
      ADD CONSTRAINT pipoca_generations_postcard_font_style_chk
      CHECK (postcard_font_style IS NULL
             OR postcard_font_style IN ('classic','script','modern'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pipoca_generations_postcard_divider_style_chk'
  ) THEN
    ALTER TABLE public.pipoca_generations
      ADD CONSTRAINT pipoca_generations_postcard_divider_style_chk
      CHECK (postcard_divider_style IS NULL
             OR postcard_divider_style IN ('snowflake','star','branch','ornament'));
  END IF;
END $$;

-- Backfill dos registros gravados enquanto as colunas não existiam
-- (o código usa metadata como fallback compatível).
UPDATE public.pipoca_generations
SET
  postcard_font_style    = COALESCE(postcard_font_style,    metadata->>'postcard_font_style'),
  postcard_divider_style = COALESCE(postcard_divider_style, metadata->>'postcard_divider_style')
WHERE metadata ? 'postcard_font_style'
   OR metadata ? 'postcard_divider_style';

-- Sem alteração de GRANTs/RLS: a tabela continua acessível apenas via
-- server functions com service_role.
