-- Pipoca & Cena — visitor registration + print queue
-- Execute this SQL in the EXTERNAL Supabase project (it is NOT executed automatically).
-- Project ref: brsplarbpylygnsakyjf

-- 1) Visitors -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipoca_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  first_name text NOT NULL,
  whatsapp_e164 text NOT NULL,
  whatsapp_last4 text NOT NULL,
  experience_consent boolean NOT NULL DEFAULT false,
  experience_consent_at timestamptz,
  privacy_notice_version text,
  marketing_consent boolean NOT NULL DEFAULT false,
  marketing_consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipoca_visitors_whatsapp ON public.pipoca_visitors (whatsapp_e164);
CREATE INDEX IF NOT EXISTS idx_pipoca_visitors_created ON public.pipoca_visitors (created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.pipoca_visitors TO service_role;
ALTER TABLE public.pipoca_visitors ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only service-role server functions read/write.

-- 2) Link visitor to existing sessions ------------------------------------
ALTER TABLE public.pipoca_sessions
  ADD COLUMN IF NOT EXISTS visitor_id uuid REFERENCES public.pipoca_visitors(id);

CREATE INDEX IF NOT EXISTS idx_pipoca_sessions_visitor ON public.pipoca_sessions (visitor_id);

-- 3) Print queue ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipoca_print_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL REFERENCES public.pipoca_visitors(id),
  generation_id uuid NOT NULL REFERENCES public.pipoca_generations(id),
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  printing_started_at timestamptz,
  printed_at timestamptz,
  cleared_at timestamptz,
  printed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pipoca_print_queue_status_chk CHECK (
    status IN ('pending','printing','printed','failed','cleared','cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_pipoca_print_queue_status ON public.pipoca_print_queue (status);
CREATE INDEX IF NOT EXISTS idx_pipoca_print_queue_requested ON public.pipoca_print_queue (requested_at);
CREATE INDEX IF NOT EXISTS idx_pipoca_print_queue_visitor ON public.pipoca_print_queue (visitor_id);
CREATE INDEX IF NOT EXISTS idx_pipoca_print_queue_generation ON public.pipoca_print_queue (generation_id);

-- Only one active request per generation (active = not printed/cleared/cancelled).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pipoca_print_queue_active_generation
  ON public.pipoca_print_queue (generation_id)
  WHERE status IN ('pending','printing');

GRANT SELECT, INSERT, UPDATE ON public.pipoca_print_queue TO service_role;
ALTER TABLE public.pipoca_print_queue ENABLE ROW LEVEL SECURITY;
-- No policies: every read/write goes through admin server functions.
