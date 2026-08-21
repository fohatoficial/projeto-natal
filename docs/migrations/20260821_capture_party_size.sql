-- =========================================================================
-- Projeto Natal — Sprint "Refinamento de UX"
-- Registra quem participa da foto (solo/couple/family), escolhido na etapa
-- "Quem vai entrar neste cartão-postal?". Usado apenas para adaptar as
-- orientações de captura e para métricas; NÃO afeta o prompt de geração.
--
-- Idempotente. NÃO executado pelo agente — revise e aplique manualmente.
-- =========================================================================

ALTER TABLE public.pipoca_captures
  ADD COLUMN IF NOT EXISTS party_size text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pipoca_captures_party_size_chk'
  ) THEN
    ALTER TABLE public.pipoca_captures
      ADD CONSTRAINT pipoca_captures_party_size_chk
      CHECK (party_size IS NULL OR party_size IN ('solo', 'couple', 'family'));
  END IF;
END $$;

-- Sem alteração de GRANTs/RLS: a tabela continua acessível apenas via
-- server functions com service_role.
