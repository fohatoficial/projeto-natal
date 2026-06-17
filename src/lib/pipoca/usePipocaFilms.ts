import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FALLBACK_MOVIES, mapFilmRow, type Movie } from "@/lib/pipoca/movies";

type State = {
  films: Movie[];
  loading: boolean;
  error: string | null;
};

export function usePipocaFilms(): State {
  const [state, setState] = useState<State>({
    films: FALLBACK_MOVIES,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

    const loadFilms = async (attempt = 0) => {
      const { data, error } = await supabase
        .from("pipoca_films")
        .select(
          "id, title, slug, synopsis_short, cover_url, catalog_url, active, display_order",
        )
        .eq("active", true)
        .order("display_order", { ascending: true });

      if (cancelled) return;

      if (error) {
        // eslint-disable-next-line no-console
        console.error("[pipoca_films] erro ao carregar:", error);
        if (attempt < 3) {
          retryTimer = window.setTimeout(() => void loadFilms(attempt + 1), 1500 * (attempt + 1));
        }
        setState({
          films: FALLBACK_MOVIES,
          loading: false,
          error: null,
        });
        return;
      }

      setState({
        films: data && data.length > 0 ? data.map(mapFilmRow) : FALLBACK_MOVIES,
        loading: false,
        error: null,
      });
    };

    void loadFilms();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, []);

  return state;
}
