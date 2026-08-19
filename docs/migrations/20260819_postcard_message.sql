-- =========================================================================
-- Projeto Natal — Sprint "Cartão-Postal Brasília"
-- Guarda a mensagem escolhida pelo visitante e o cartão-postal final
-- composto programaticamente (sem IA) a partir da fotografia gerada.
--
-- Idempotente. NÃO executado pelo agente — revise e aplique manualmente.
-- =========================================================================

ALTER TABLE public.pipoca_generations
  ADD COLUMN IF NOT EXISTS postcard_message      text,
  ADD COLUMN IF NOT EXISTS postcard_message_type text,
  ADD COLUMN IF NOT EXISTS postcard_image_path   text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pipoca_generations_postcard_message_type_chk'
  ) THEN
    ALTER TABLE public.pipoca_generations
      ADD CONSTRAINT pipoca_generations_postcard_message_type_chk
      CHECK (postcard_message_type IS NULL OR postcard_message_type IN ('preset','custom'));
  END IF;
END $$;

-- Backfill dos registros gravados enquanto as colunas não existiam
-- (o código usa metadata como fallback compatível).
UPDATE public.pipoca_generations
SET
  postcard_image_path   = COALESCE(postcard_image_path,   metadata->>'postcard_image_path'),
  postcard_message      = COALESCE(postcard_message,      metadata->>'postcard_message'),
  postcard_message_type = COALESCE(postcard_message_type, metadata->>'postcard_message_type')
WHERE metadata ? 'postcard_image_path';

CREATE INDEX IF NOT EXISTS idx_pipoca_generations_postcard_path
  ON public.pipoca_generations (postcard_image_path);

-- Sem alteração de GRANTs/RLS: a tabela continua acessível apenas via
-- server functions com service_role.
