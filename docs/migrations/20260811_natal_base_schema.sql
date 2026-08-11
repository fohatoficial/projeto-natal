-- =========================================================================
-- Pipoca & Cena — Projeto Natal — SCHEMA BASE
-- Arquivo: docs/migrations/20260811_natal_base_schema.sql
--
-- Executar MANUALMENTE no NOVO projeto Supabase (Projeto Natal), ANTES de:
--   1) 20260618_pipoca_capitals.sql
--   2) 20260619_pipoca_print_queue_capital.sql
--   3) 20260620_pipoca_dados_rpcs.sql
--   4) 20260630_pipoca_cinemateca.sql (opcional — adiciona Cinemateca)
--
-- Este arquivo NÃO é executado automaticamente e NÃO insere nenhum dado
-- de visitantes, sessões, capturas, gerações ou fila do projeto antigo.
-- Idempotente: pode ser executado mais de uma vez.
--
-- Origem: auditoria do código (supabase*.from / .storage / .rpc) +
-- migrations existentes em docs/migrations.
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1) pipoca_films
--    Lido pelo cliente (anon) em src/lib/pipoca/usePipocaFilms.ts e pelo
--    servidor (service_role) em upload/generation/print-queue/public-result.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.pipoca_films (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL,
  slug           text NOT NULL UNIQUE,
  synopsis_short text,
  cover_url      text,
  catalog_url    text,
  active         boolean NOT NULL DEFAULT true,
  display_order  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipoca_films_active_order
  ON public.pipoca_films (active, display_order);

GRANT SELECT ON public.pipoca_films TO anon;
GRANT SELECT ON public.pipoca_films TO authenticated;
GRANT ALL    ON public.pipoca_films TO service_role;

ALTER TABLE public.pipoca_films ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pipoca_films public select active" ON public.pipoca_films;
CREATE POLICY "pipoca_films public select active"
  ON public.pipoca_films
  FOR SELECT
  TO anon, authenticated
  USING (active = true);
-- Escrita apenas via service_role (sem policies de INSERT/UPDATE/DELETE).

-- =========================================================================
-- 2) pipoca_scene_packs
--    Lido apenas no servidor (service_role): upload.functions.ts e
--    generation.functions.ts.
--    `prompt` é jsonb (o código faz parse de objeto com prop_references).
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.pipoca_scene_packs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id             uuid NOT NULL REFERENCES public.pipoca_films(id) ON DELETE CASCADE,
  scene_name          text,
  prompt              jsonb,
  negative_prompt     text,
  reference_image_url text,
  visual_style        text,
  color_mode          text,
  framing             text,
  pose_type           text,
  active              boolean NOT NULL DEFAULT true,
  status              text NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pipoca_scene_packs_status_chk
    CHECK (status IN ('active', 'draft', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_pipoca_scene_packs_film_active
  ON public.pipoca_scene_packs (film_id, active, status, created_at DESC);

GRANT ALL ON public.pipoca_scene_packs TO service_role;

ALTER TABLE public.pipoca_scene_packs ENABLE ROW LEVEL SECURITY;
-- Sem policies: acesso somente por server functions com service_role.

-- =========================================================================
-- 3) pipoca_visitors
--    (mesma definição de 20260615_pipoca_visitors_and_print_queue.sql,
--     reproduzida aqui para que o schema base seja autossuficiente)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.pipoca_visitors (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name              text NOT NULL,
  first_name             text NOT NULL,
  whatsapp_e164          text NOT NULL,
  whatsapp_last4         text NOT NULL,
  experience_consent     boolean NOT NULL DEFAULT false,
  experience_consent_at  timestamptz,
  privacy_notice_version text,
  marketing_consent      boolean NOT NULL DEFAULT false,
  marketing_consent_at   timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipoca_visitors_whatsapp
  ON public.pipoca_visitors (whatsapp_e164);
CREATE INDEX IF NOT EXISTS idx_pipoca_visitors_last4
  ON public.pipoca_visitors (whatsapp_last4);
CREATE INDEX IF NOT EXISTS idx_pipoca_visitors_created
  ON public.pipoca_visitors (created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.pipoca_visitors TO service_role;

ALTER TABLE public.pipoca_visitors ENABLE ROW LEVEL SECURITY;
-- Sem policies: dados pessoais (LGPD) acessíveis apenas por service_role.

-- =========================================================================
-- 4) pipoca_sessions
--    capital_id é adicionado por 20260618; visitor_id por 20260615.
--    Ambos já constam aqui para que o schema base fique consistente —
--    as migrations posteriores usam ADD COLUMN IF NOT EXISTS.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.pipoca_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id        text,
  selected_film_id uuid REFERENCES public.pipoca_films(id),
  scene_pack_id    uuid REFERENCES public.pipoca_scene_packs(id),
  visitor_id       uuid REFERENCES public.pipoca_visitors(id),
  status           text NOT NULL DEFAULT 'photo_step',
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pipoca_sessions_status_chk CHECK (
    status IN ('photo_step','photo_confirmed','processing','completed','failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_pipoca_sessions_created
  ON public.pipoca_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipoca_sessions_visitor
  ON public.pipoca_sessions (visitor_id);
CREATE INDEX IF NOT EXISTS idx_pipoca_sessions_film
  ON public.pipoca_sessions (selected_film_id);

GRANT ALL ON public.pipoca_sessions TO service_role;

ALTER TABLE public.pipoca_sessions ENABLE ROW LEVEL SECURITY;
-- Sem policies: somente service_role.

-- =========================================================================
-- 5) pipoca_captures
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.pipoca_captures (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid NOT NULL REFERENCES public.pipoca_sessions(id) ON DELETE CASCADE,
  original_photo_path text,
  validation_status   text NOT NULL DEFAULT 'pending',
  validation_error    text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pipoca_captures_validation_status_chk CHECK (
    validation_status IN ('pending','uploaded','invalid')
  )
);

CREATE INDEX IF NOT EXISTS idx_pipoca_captures_session
  ON public.pipoca_captures (session_id);
CREATE INDEX IF NOT EXISTS idx_pipoca_captures_created
  ON public.pipoca_captures (created_at DESC);

GRANT ALL ON public.pipoca_captures TO service_role;

ALTER TABLE public.pipoca_captures ENABLE ROW LEVEL SECURITY;
-- Sem policies: somente service_role.

-- =========================================================================
-- 6) pipoca_generations
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.pipoca_generations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES public.pipoca_sessions(id) ON DELETE CASCADE,
  capture_id         uuid NOT NULL REFERENCES public.pipoca_captures(id) ON DELETE CASCADE,
  film_id            uuid REFERENCES public.pipoca_films(id),
  scene_pack_id      uuid REFERENCES public.pipoca_scene_packs(id),
  status             text NOT NULL DEFAULT 'queued',
  provider           text,
  provider_job_id    text,
  attempt_number     integer NOT NULL DEFAULT 1,
  final_image_path   text,
  public_token       uuid UNIQUE,
  result_page_url    text,
  error_message      text,
  processing_time_ms integer,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pipoca_generations_status_chk CHECK (
    status IN ('queued','processing','completed','failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_pipoca_generations_session
  ON public.pipoca_generations (session_id);
CREATE INDEX IF NOT EXISTS idx_pipoca_generations_capture
  ON public.pipoca_generations (capture_id);
CREATE INDEX IF NOT EXISTS idx_pipoca_generations_status_created
  ON public.pipoca_generations (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipoca_generations_public_token
  ON public.pipoca_generations (public_token);

GRANT ALL ON public.pipoca_generations TO service_role;

ALTER TABLE public.pipoca_generations ENABLE ROW LEVEL SECURITY;
-- Sem policies: a página pública /resultado lê via server function
-- (service_role), nunca direto do navegador.

-- =========================================================================
-- 7) pipoca_print_queue
--    (mesma definição de 20260615; capital_id é adicionado por 20260619)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.pipoca_print_queue (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id          uuid NOT NULL REFERENCES public.pipoca_visitors(id),
  generation_id       uuid NOT NULL REFERENCES public.pipoca_generations(id),
  status              text NOT NULL DEFAULT 'pending',
  requested_at        timestamptz NOT NULL DEFAULT now(),
  printing_started_at timestamptz,
  printed_at          timestamptz,
  cleared_at          timestamptz,
  printed_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pipoca_print_queue_status_chk CHECK (
    status IN ('pending','printing','printed','failed','cleared','cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_pipoca_print_queue_status
  ON public.pipoca_print_queue (status);
CREATE INDEX IF NOT EXISTS idx_pipoca_print_queue_requested
  ON public.pipoca_print_queue (requested_at);
CREATE INDEX IF NOT EXISTS idx_pipoca_print_queue_visitor
  ON public.pipoca_print_queue (visitor_id);
CREATE INDEX IF NOT EXISTS idx_pipoca_print_queue_generation
  ON public.pipoca_print_queue (generation_id);

-- Apenas um pedido ativo por geração.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pipoca_print_queue_active_generation
  ON public.pipoca_print_queue (generation_id)
  WHERE status IN ('pending','printing');

GRANT SELECT, INSERT, UPDATE ON public.pipoca_print_queue TO service_role;

ALTER TABLE public.pipoca_print_queue ENABLE ROW LEVEL SECURITY;
-- Sem policies: fila acessível apenas por server functions com service_role.

-- =========================================================================
-- 8) Storage buckets
--    - pipoca-visitor-originals : PRIVADO (upload via signed upload URL)
--    - pipoca-generated-scenes  : PRIVADO (leitura via signed URL)
--    - pipoca-reference-assets  : PÚBLICO (cenas/artes de referência)
--    Nenhum arquivo é copiado do projeto antigo por este SQL.
-- =========================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('pipoca-visitor-originals', 'pipoca-visitor-originals', false),
  ('pipoca-generated-scenes',  'pipoca-generated-scenes',  false),
  ('pipoca-reference-assets',  'pipoca-reference-assets',  true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Sem policies de storage para os buckets privados: todo acesso é feito com
-- service_role (signed upload URLs e signed download URLs no servidor).
-- O bucket público de referência é servido pelo endpoint público do Storage.

COMMIT;

-- =========================================================================
-- 9) Ordem de execução recomendada no Projeto Natal
-- =========================================================================
--   1. 20260811_natal_base_schema.sql   (este arquivo)
--   2. 20260618_pipoca_capitals.sql
--   3. 20260619_pipoca_print_queue_capital.sql
--   4. 20260620_pipoca_dados_rpcs.sql
--   5. 20260630_pipoca_cinemateca.sql   (opcional)
--
-- Observação: 20260615_pipoca_visitors_and_print_queue.sql fica redundante,
-- pois seu conteúdo já está incluído aqui (tudo com IF NOT EXISTS — executá-la
-- de novo é inofensivo).
--
-- Após executar tudo, é necessário cadastrar manualmente:
--   - filmes em public.pipoca_films
--   - scene packs em public.pipoca_scene_packs (com reference_image_url
--     apontando para o bucket pipoca-reference-assets do PROJETO NATAL)
