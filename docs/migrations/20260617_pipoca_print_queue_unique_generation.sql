-- Pipoca & Cena — make pipoca_print_queue.generation_id globally unique so
-- the auto-enqueue (on generation completion) is idempotent across
-- polling/retries/refresh.
--
-- Execute this SQL in the EXTERNAL Supabase project
-- (project ref: brsplarbpylygnsakyjf). It is NOT executed automatically.

-- Drop the previous partial unique index (active rows only) and replace it
-- with a full unique index. There is one print-queue entry per generation,
-- ever — re-prints reuse the same row via UPDATE on the admin panel.
DROP INDEX IF EXISTS public.uq_pipoca_print_queue_active_generation;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pipoca_print_queue_generation
  ON public.pipoca_print_queue (generation_id);
