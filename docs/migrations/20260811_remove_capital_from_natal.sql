-- =====================================================================
-- Projeto Natal — remoção completa do conceito de capital/localização
-- Executar no banco JÁ EXISTENTE que recebeu:
--   20260811_natal_base_schema.sql
--   20260618_pipoca_capitals.sql
--   20260619_pipoca_print_queue_capital.sql
--   20260620_pipoca_dados_rpcs.sql
-- Idempotente. Não apaga dados de negócio (visitantes, capturas, gerações).
-- =====================================================================

begin;

-- 1) RPCs antigas dependentes de capital ------------------------------
drop function if exists public.pipoca_dados_summary(
  timestamptz, timestamptz, uuid, uuid, text, text, text, timestamptz, timestamptz
);
drop function if exists public.pipoca_dados_page(
  timestamptz, timestamptz, uuid, uuid, text, text, text, integer, integer
);
-- fallback: qualquer outra assinatura remanescente
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('pipoca_dados_summary', 'pipoca_dados_page')
  loop
    execute format('drop function if exists %s', r.sig);
  end loop;
end $$;

-- 2) Índices dependentes de capital_id --------------------------------
drop index if exists public.pipoca_print_queue_capital_idx;
drop index if exists public.pipoca_generations_capital_idx;
drop index if exists public.pipoca_captures_capital_idx;
drop index if exists public.pipoca_sessions_capital_idx;

-- 3) Colunas capital_id ------------------------------------------------
alter table if exists public.pipoca_print_queue  drop column if exists capital_id;
alter table if exists public.pipoca_generations  drop column if exists capital_id;
alter table if exists public.pipoca_captures     drop column if exists capital_id;
alter table if exists public.pipoca_sessions     drop column if exists capital_id;

-- 4) Tabela pipoca_capitals -------------------------------------------
drop table if exists public.pipoca_capitals cascade;

-- 5) RPCs do dashboard, agora globais (sem capital) --------------------
create or replace function public.pipoca_dados_summary(
  p_start        timestamptz,
  p_end          timestamptz,
  p_film         uuid,
  p_gen_status   text,
  p_print_status text,
  p_search       text,
  p_today_start  timestamptz,
  p_today_end    timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with cap as (
    select c.id, c.created_at, s.visitor_id, s.selected_film_id
    from public.pipoca_captures c
    join public.pipoca_sessions s on s.id = c.session_id
    where (p_start is null or c.created_at >= p_start)
      and (p_end   is null or c.created_at <  p_end)
      and (p_film  is null or s.selected_film_id = p_film)
  ),
  gen as (
    select g.*
    from public.pipoca_generations g
    where (p_start is null or g.created_at >= p_start)
      and (p_end   is null or g.created_at <  p_end)
      and (p_film  is null or g.film_id = p_film)
      and (p_gen_status is null or g.status = p_gen_status)
  ),
  pq as (
    select q.*
    from public.pipoca_print_queue q
    where (p_print_status is null or q.status = p_print_status)
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'captures',              (select count(*) from cap),
      'captures_today',        (select count(*) from cap
                                 where (p_today_start is null or created_at >= p_today_start)
                                   and (p_today_end   is null or created_at <  p_today_end)),
      'generations',           (select count(*) from gen),
      'generations_today',     (select count(*) from gen
                                 where (p_today_start is null or created_at >= p_today_start)
                                   and (p_today_end   is null or created_at <  p_today_end)),
      'generations_completed', (select count(*) from gen where status = 'completed'),
      'generations_failed',    (select count(*) from gen where status = 'failed'),
      'unique_visitors',       (select count(distinct visitor_id) from cap where visitor_id is not null),
      'queue_pending',         (select count(*) from pq where status = 'pending'),
      'queue_printing',        (select count(*) from pq where status = 'printing'),
      'queue_printed',         (select count(*) from pq where status = 'printed')
    )
  );
$$;

revoke all on function public.pipoca_dados_summary(
  timestamptz, timestamptz, uuid, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.pipoca_dados_summary(
  timestamptz, timestamptz, uuid, text, text, text, timestamptz, timestamptz
) to service_role;

commit;
