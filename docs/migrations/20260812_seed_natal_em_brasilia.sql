-- =========================================================================
-- Projeto Natal — SEED: cenário "Natal em Brasília"
-- Arquivo: docs/migrations/20260812_seed_natal_em_brasilia.sql
--
-- Executar MANUALMENTE no Supabase do Projeto Natal, DEPOIS de:
--   1) 20260811_natal_base_schema.sql
--   2) 20260811_remove_capital_from_natal.sql
--
-- Este seed cadastra o ÚNICO cenário público do sprint Brasília MVP.
-- Idempotente: pode ser executado mais de uma vez.
--
-- ANTES DE EXECUTAR:
--   Faça upload da imagem-base (4:5 vertical, Catedral Metropolitana de
--   Brasília frontal e centralizada, sem pessoas) no bucket
--   `pipoca-reference-assets` com o caminho:
--
--     cenarios/brasilia/brasilia_catedral_natal_base_4x5.jpg
--
--   e substitua <SUPABASE_URL> abaixo pela URL do projeto.
-- =========================================================================

BEGIN;

-- 1) Cenário (usa a tabela existente pipoca_films — nome interno mantido)
INSERT INTO public.pipoca_films (title, slug, synopsis_short, cover_url, active, display_order)
VALUES (
  'Natal em Brasília',
  'natal-em-brasilia',
  'Um cartão-postal natalino em frente à Catedral Metropolitana de Brasília, com neve suave e luzes de Natal.',
  '<SUPABASE_URL>/storage/v1/object/public/pipoca-reference-assets/cenarios/brasilia/brasilia_catedral_natal_base_4x5.jpg',
  true,
  1
)
ON CONFLICT (slug) DO UPDATE SET
  title          = EXCLUDED.title,
  synopsis_short = EXCLUDED.synopsis_short,
  cover_url      = EXCLUDED.cover_url,
  active         = true,
  display_order  = EXCLUDED.display_order,
  updated_at     = now();

-- 2) Garante que nenhum outro cenário fique visível neste sprint
UPDATE public.pipoca_films
SET active = false, updated_at = now()
WHERE slug <> 'natal-em-brasilia' AND active = true;

-- 3) Scene pack oficial
WITH film AS (
  SELECT id FROM public.pipoca_films WHERE slug = 'natal-em-brasilia'
), existing AS (
  SELECT sp.id
  FROM public.pipoca_scene_packs sp, film
  WHERE sp.film_id = film.id AND sp.scene_name = 'brasilia_catedral_natal'
  LIMIT 1
), upd AS (
  UPDATE public.pipoca_scene_packs sp SET
    prompt = jsonb_build_object(
      'scene_description',
      'Retrato fotográfico natalino em frente à Catedral Metropolitana de Brasília, Distrito Federal, Brasil. A Catedral deve permanecer claramente reconhecível e centralizada como principal marco visual do cenário. A composição deve ser frontal, clássica e com aparência de cartão-postal. Criar uma atmosfera de inverno encantado, com neve suave caindo, chão levemente coberto de neve, iluminação natalina elegante e clima abaixo de zero. Preservar fielmente todas as pessoas da foto original. Se houver uma pessoa, manter protagonismo individual. Se houver casal, família ou grupo, manter exatamente a quantidade de pessoas, rostos distintos e reconhecíveis, proporções naturais entre adultos e crianças e composição equilibrada de retrato em grupo. Adaptar a vestimenta para um contexto de inverno natalino premium, com casacos, cachecóis e toucas ou gorros elegantes, mantendo naturalidade e harmonia visual. O enquadramento deve manter as pessoas em destaque sem esconder a Catedral. Resultado fotográfico, realista, premium, cinematográfico e com aparência de cartão-postal natalino brasileiro.',
      'landmark', 'Catedral Metropolitana de Brasília',
      'group_support', 'individual, casal, família ou grupo pequeno',
      'prop_references', jsonb_build_object('hat_reference_images', '[]'::jsonb)
    ),
    negative_prompt = 'arquitetura genérica, catedral deformada, monumento irreconhecível, cenário genérico, excesso de neve, close excessivo, enquadramento apertado, pessoas extras, pessoas desaparecendo, rostos fundidos, anatomia incorreta, mãos deformadas, grupo cortado, crianças deformadas, decoração exagerada, poluição visual, iluminação estourada, cartoon, ilustração, caricatura, estética infantil, baixa nitidez, roupas incoerentes com frio, acessórios aleatórios sem contexto, monumento escondido',
    reference_image_url = '<SUPABASE_URL>/storage/v1/object/public/pipoca-reference-assets/cenarios/brasilia/brasilia_catedral_natal_base_4x5.jpg',
    visual_style = 'fotográfico premium, cinematográfico, cartão-postal natalino',
    color_mode   = 'color',
    framing      = 'retrato vertical 4:5, composição frontal clássica',
    pose_type    = 'individual ou grupo, em pé, frontal',
    active       = true,
    status       = 'active',
    updated_at   = now()
  FROM film, existing
  WHERE sp.id = existing.id
  RETURNING sp.id
)
INSERT INTO public.pipoca_scene_packs (
  film_id, scene_name, prompt, negative_prompt, reference_image_url,
  visual_style, color_mode, framing, pose_type, active, status
)
SELECT
  film.id,
  'brasilia_catedral_natal',
  jsonb_build_object(
    'scene_description',
    'Retrato fotográfico natalino em frente à Catedral Metropolitana de Brasília, Distrito Federal, Brasil. A Catedral deve permanecer claramente reconhecível e centralizada como principal marco visual do cenário. A composição deve ser frontal, clássica e com aparência de cartão-postal. Criar uma atmosfera de inverno encantado, com neve suave caindo, chão levemente coberto de neve, iluminação natalina elegante e clima abaixo de zero. Preservar fielmente todas as pessoas da foto original. Se houver uma pessoa, manter protagonismo individual. Se houver casal, família ou grupo, manter exatamente a quantidade de pessoas, rostos distintos e reconhecíveis, proporções naturais entre adultos e crianças e composição equilibrada de retrato em grupo. Adaptar a vestimenta para um contexto de inverno natalino premium, com casacos, cachecóis e toucas ou gorros elegantes, mantendo naturalidade e harmonia visual. O enquadramento deve manter as pessoas em destaque sem esconder a Catedral. Resultado fotográfico, realista, premium, cinematográfico e com aparência de cartão-postal natalino brasileiro.',
    'landmark', 'Catedral Metropolitana de Brasília',
    'group_support', 'individual, casal, família ou grupo pequeno',
    'prop_references', jsonb_build_object('hat_reference_images', '[]'::jsonb)
  ),
  'arquitetura genérica, catedral deformada, monumento irreconhecível, cenário genérico, excesso de neve, close excessivo, enquadramento apertado, pessoas extras, pessoas desaparecendo, rostos fundidos, anatomia incorreta, mãos deformadas, grupo cortado, crianças deformadas, decoração exagerada, poluição visual, iluminação estourada, cartoon, ilustração, caricatura, estética infantil, baixa nitidez, roupas incoerentes com frio, acessórios aleatórios sem contexto, monumento escondido',
  '<SUPABASE_URL>/storage/v1/object/public/pipoca-reference-assets/cenarios/brasilia/brasilia_catedral_natal_base_4x5.jpg',
  'fotográfico premium, cinematográfico, cartão-postal natalino',
  'color',
  'retrato vertical 4:5, composição frontal clássica',
  'individual ou grupo, em pé, frontal',
  true,
  'active'
FROM film
WHERE NOT EXISTS (SELECT 1 FROM existing);

COMMIT;
