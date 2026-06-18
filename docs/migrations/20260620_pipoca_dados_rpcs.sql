-- Pipoca & Cena — RPCs administrativas para o painel /dados
-- Execute este SQL no projeto Supabase EXTERNO (NÃO é executado automaticamente).
--
-- Objetivo: paginação e contagens 100% server-side, sem limite artificial de
-- 5000 capturas, com todos os filtros aplicados em SQL.
--
-- As funções são SECURITY DEFINER e ficam restritas ao service_role (o
-- painel /dados já só é acessível com PIN e usa supabaseAdmin no servidor).

-- ─── Limpeza idempotente ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.pipoca_dados_summary(
  timestamptz, timestamptz, uuid, uuid, text, text, text, timestamptz, timestamptz
);
DROP FUNCTION IF EXISTS public.pipoca_dados_page(
  timestamptz, timestamptz, uuid, uuid, text, text, text, integer, integer
);

-- ─── Resumo agregado + per-capital ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pipoca_dados_summary(
  p_start         timestamptz,
  p_end           timestamptz,
  p_capital       uuid,
  p_film          uuid,
  p_gen_status    text,
  p_print_status  text,
  p_search        text,
  p_today_start   timestamptz,
  p_today_end     timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(btrim(coalesce(p_search, '')), '');
  v_result jsonb;
BEGIN
  WITH filtered_captures AS (
    SELECT
      c.id,
      c.created_at,
      c.capital_id,
      c.session_id,
      s.visitor_id,
      s.selected_film_id,
      v.whatsapp_e164,
      v.whatsapp_last4,
      v.full_name,
      v.first_name
    FROM public.pipoca_captures c
    LEFT JOIN public.pipoca_sessions s ON s.id = c.session_id
    LEFT JOIN public.pipoca_visitors v ON v.id = s.visitor_id
    WHERE (p_start    IS NULL OR c.created_at >= p_start)
      AND (p_end      IS NULL OR c.created_at <  p_end)
      AND (p_capital  IS NULL OR c.capital_id = p_capital)
      AND (p_film     IS NULL OR s.selected_film_id = p_film)
      AND (v_search   IS NULL OR
           v.full_name      ILIKE '%' || v_search || '%' OR
           v.first_name     ILIKE '%' || v_search || '%' OR
           v.whatsapp_e164  ILIKE '%' || v_search || '%' OR
           v.whatsapp_last4 ILIKE '%' || v_search || '%')
      AND (p_gen_status IS NULL OR EXISTS (
            SELECT 1 FROM public.pipoca_generations g
            WHERE g.capture_id = c.id AND g.status = p_gen_status))
      AND (p_print_status IS NULL OR EXISTS (
            SELECT 1
            FROM public.pipoca_generations g
            JOIN public.pipoca_print_queue q ON q.generation_id = g.id
            WHERE g.capture_id = c.id AND q.status = p_print_status))
  ),
  filtered_gens AS (
    SELECT g.id, g.capture_id, g.status, g.created_at
    FROM public.pipoca_generations g
    WHERE g.capture_id IN (SELECT id FROM filtered_captures)
  ),
  filtered_queue AS (
    SELECT q.id, q.generation_id, q.status, fg.capture_id
    FROM public.pipoca_print_queue q
    JOIN filtered_gens fg ON fg.id = q.generation_id
  ),
  per_cap AS (
    SELECT
      fc.capital_id,
      count(*) FILTER (WHERE TRUE)                                                    AS captures,
      count(*) FILTER (WHERE fc.created_at >= p_today_start AND fc.created_at < p_today_end) AS captures_today
    FROM filtered_captures fc
    GROUP BY fc.capital_id
  ),
  per_cap_gen AS (
    SELECT
      fc.capital_id,
      count(fg.id)                                                                    AS generations,
      count(fg.id) FILTER (WHERE fg.created_at >= p_today_start AND fg.created_at < p_today_end) AS generations_today
    FROM filtered_captures fc
    LEFT JOIN filtered_gens fg ON fg.capture_id = fc.id
    GROUP BY fc.capital_id
  ),
  per_cap_queue AS (
    SELECT
      fc.capital_id,
      count(*) FILTER (WHERE fq.status = 'pending')  AS q_pending,
      count(*) FILTER (WHERE fq.status = 'printing') AS q_printing,
      count(*) FILTER (WHERE fq.status = 'printed')  AS q_printed
    FROM filtered_captures fc
    LEFT JOIN filtered_queue fq ON fq.capture_id = fc.id
    GROUP BY fc.capital_id
  ),
  per_cap_full AS (
    SELECT
      pc.capital_id,
      pc.captures,
      pc.captures_today,
      coalesce(pg.generations, 0)        AS generations,
      coalesce(pg.generations_today, 0)  AS generations_today,
      coalesce(pq.q_pending, 0)          AS queue_pending,
      coalesce(pq.q_printing, 0)         AS queue_printing,
      coalesce(pq.q_printed, 0)          AS queue_printed,
      cap.name                           AS capital_name,
      cap.is_system                      AS is_system,
      cap.selectable                     AS selectable,
      cap.active                         AS active,
      cap.display_order                  AS display_order
    FROM per_cap pc
    LEFT JOIN per_cap_gen   pg ON pg.capital_id = pc.capital_id
    LEFT JOIN per_cap_queue pq ON pq.capital_id = pc.capital_id
    LEFT JOIN public.pipoca_capitals cap ON cap.id = pc.capital_id
  )
  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'captures',                (SELECT count(*) FROM filtered_captures),
      'captures_today',          (SELECT count(*) FROM filtered_captures WHERE created_at >= p_today_start AND created_at < p_today_end),
      'generations',             (SELECT count(*) FROM filtered_gens),
      'generations_today',       (SELECT count(*) FROM filtered_gens WHERE created_at >= p_today_start AND created_at < p_today_end),
      'generations_completed',   (SELECT count(*) FROM filtered_gens WHERE status = 'completed'),
      'generations_failed',      (SELECT count(*) FROM filtered_gens WHERE status = 'failed'),
      'unique_visitors',         (SELECT count(DISTINCT coalesce(whatsapp_e164, visitor_id::text))
                                  FROM filtered_captures
                                  WHERE visitor_id IS NOT NULL),
      'queue_pending',           (SELECT count(*) FROM filtered_queue WHERE status = 'pending'),
      'queue_printing',          (SELECT count(*) FROM filtered_queue WHERE status = 'printing'),
      'queue_printed',           (SELECT count(*) FROM filtered_queue WHERE status = 'printed'),
      'captures_without_capital',    (SELECT count(*) FROM public.pipoca_captures    WHERE capital_id IS NULL),
      'generations_without_capital', (SELECT count(*) FROM public.pipoca_generations WHERE capital_id IS NULL),
      'queue_without_capital',       (SELECT count(*) FROM public.pipoca_print_queue WHERE capital_id IS NULL)
    ),
    'per_capital', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'capital_id',        capital_id,
        'capital_name',      coalesce(capital_name, '—'),
        'is_system',         coalesce(is_system, false),
        'selectable',        coalesce(selectable, false),
        'active',            coalesce(active, false),
        'captures',          captures,
        'captures_today',    captures_today,
        'generations',       generations,
        'generations_today', generations_today,
        'queue_pending',     queue_pending,
        'queue_printing',    queue_printing,
        'queue_printed',     queue_printed
      ) ORDER BY coalesce(is_system, false), coalesce(display_order, 0), capital_name)
      FROM per_cap_full
      WHERE capital_id IS NOT NULL
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END
$$;

REVOKE ALL ON FUNCTION public.pipoca_dados_summary(
  timestamptz, timestamptz, uuid, uuid, text, text, text, timestamptz, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pipoca_dados_summary(
  timestamptz, timestamptz, uuid, uuid, text, text, text, timestamptz, timestamptz
) TO service_role;

-- ─── Página detalhada (25 linhas + count exato) ─────────────────────────
CREATE OR REPLACE FUNCTION public.pipoca_dados_page(
  p_start         timestamptz,
  p_end           timestamptz,
  p_capital       uuid,
  p_film          uuid,
  p_gen_status    text,
  p_print_status  text,
  p_search        text,
  p_offset        integer,
  p_limit         integer
)
RETURNS TABLE (
  total                bigint,
  capture_id           uuid,
  created_at           timestamptz,
  capital_id           uuid,
  capital_name         text,
  visitor_first_name   text,
  visitor_full_name    text,
  whatsapp_e164        text,
  whatsapp_last4       text,
  film_id              uuid,
  film_title           text,
  generation_id        uuid,
  generation_status    text,
  generation_attempts  bigint,
  print_queue_id       uuid,
  print_status         text,
  public_token         uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(btrim(coalesce(p_search, '')), '');
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT c.id, c.created_at, c.capital_id, c.session_id
    FROM public.pipoca_captures c
    LEFT JOIN public.pipoca_sessions s ON s.id = c.session_id
    LEFT JOIN public.pipoca_visitors v ON v.id = s.visitor_id
    WHERE (p_start    IS NULL OR c.created_at >= p_start)
      AND (p_end      IS NULL OR c.created_at <  p_end)
      AND (p_capital  IS NULL OR c.capital_id = p_capital)
      AND (p_film     IS NULL OR s.selected_film_id = p_film)
      AND (v_search   IS NULL OR
           v.full_name      ILIKE '%' || v_search || '%' OR
           v.first_name     ILIKE '%' || v_search || '%' OR
           v.whatsapp_e164  ILIKE '%' || v_search || '%' OR
           v.whatsapp_last4 ILIKE '%' || v_search || '%')
      AND (p_gen_status IS NULL OR EXISTS (
            SELECT 1 FROM public.pipoca_generations g
            WHERE g.capture_id = c.id AND g.status = p_gen_status))
      AND (p_print_status IS NULL OR EXISTS (
            SELECT 1
            FROM public.pipoca_generations g
            JOIN public.pipoca_print_queue q ON q.generation_id = g.id
            WHERE g.capture_id = c.id AND q.status = p_print_status))
  ),
  total_cte AS (SELECT count(*)::bigint AS total FROM filtered),
  page_ids AS (
    SELECT id, created_at, capital_id, session_id
    FROM filtered
    ORDER BY created_at DESC
    OFFSET greatest(p_offset, 0)
    LIMIT  greatest(p_limit, 1)
  ),
  page_sessions AS (
    SELECT s.id, s.visitor_id, s.selected_film_id
    FROM public.pipoca_sessions s
    WHERE s.id IN (SELECT session_id FROM page_ids WHERE session_id IS NOT NULL)
  ),
  page_visitors AS (
    SELECT v.id, v.full_name, v.first_name, v.whatsapp_e164, v.whatsapp_last4
    FROM public.pipoca_visitors v
    WHERE v.id IN (SELECT visitor_id FROM page_sessions WHERE visitor_id IS NOT NULL)
  ),
  page_films AS (
    SELECT f.id, f.title
    FROM public.pipoca_films f
    WHERE f.id IN (SELECT selected_film_id FROM page_sessions WHERE selected_film_id IS NOT NULL)
  ),
  page_capitals AS (
    SELECT cap.id, cap.name
    FROM public.pipoca_capitals cap
    WHERE cap.id IN (SELECT capital_id FROM page_ids WHERE capital_id IS NOT NULL)
  ),
  page_attempts AS (
    SELECT g.capture_id, count(*)::bigint AS attempts
    FROM public.pipoca_generations g
    WHERE g.capture_id IN (SELECT id FROM page_ids)
    GROUP BY g.capture_id
  ),
  page_latest_gen AS (
    SELECT DISTINCT ON (g.capture_id)
      g.capture_id, g.id, g.status, g.public_token
    FROM public.pipoca_generations g
    WHERE g.capture_id IN (SELECT id FROM page_ids)
    ORDER BY g.capture_id, g.created_at DESC
  ),
  page_latest_queue AS (
    SELECT DISTINCT ON (q.generation_id)
      q.generation_id, q.id, q.status
    FROM public.pipoca_print_queue q
    WHERE q.generation_id IN (SELECT id FROM page_latest_gen)
    ORDER BY q.generation_id, q.requested_at DESC
  )
  SELECT
    (SELECT total FROM total_cte)        AS total,
    p.id                                  AS capture_id,
    p.created_at                          AS created_at,
    p.capital_id                          AS capital_id,
    pc.name                               AS capital_name,
    pv.first_name                         AS visitor_first_name,
    pv.full_name                          AS visitor_full_name,
    pv.whatsapp_e164                      AS whatsapp_e164,
    pv.whatsapp_last4                     AS whatsapp_last4,
    ps.selected_film_id                   AS film_id,
    pf.title                              AS film_title,
    plg.id                                AS generation_id,
    plg.status                            AS generation_status,
    coalesce(pa.attempts, 0)              AS generation_attempts,
    plq.id                                AS print_queue_id,
    plq.status                            AS print_status,
    plg.public_token                      AS public_token
  FROM page_ids p
  LEFT JOIN page_sessions     ps  ON ps.id = p.session_id
  LEFT JOIN page_visitors     pv  ON pv.id = ps.visitor_id
  LEFT JOIN page_films        pf  ON pf.id = ps.selected_film_id
  LEFT JOIN page_capitals     pc  ON pc.id = p.capital_id
  LEFT JOIN page_attempts     pa  ON pa.capture_id = p.id
  LEFT JOIN page_latest_gen   plg ON plg.capture_id = p.id
  LEFT JOIN page_latest_queue plq ON plq.generation_id = plg.id
  ORDER BY p.created_at DESC;
END
$$;

REVOKE ALL ON FUNCTION public.pipoca_dados_page(
  timestamptz, timestamptz, uuid, uuid, text, text, text, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pipoca_dados_page(
  timestamptz, timestamptz, uuid, uuid, text, text, text, integer, integer
) TO service_role;

-- ─── Índices úteis (idempotentes) ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pipoca_captures_created_desc
  ON public.pipoca_captures (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipoca_generations_capture
  ON public.pipoca_generations (capture_id);
CREATE INDEX IF NOT EXISTS idx_pipoca_generations_status
  ON public.pipoca_generations (status);
CREATE INDEX IF NOT EXISTS idx_pipoca_print_queue_generation_status
  ON public.pipoca_print_queue (generation_id, status);
