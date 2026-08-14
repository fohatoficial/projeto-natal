import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { mapFilmRow, type Movie } from "@/lib/pipoca/movies";

type State = {
  films: Movie[];
  loading: boolean;
  error: string | null;
};

export function usePipocaFilms(): State {
  const [state, setState] = useState<State>({
    films: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
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
        setState({
          films: [],
          loading: false,
          error: "Não foi possível carregar os filmes. Tente novamente.",
        });
        return;
      }

      setState({
        films: (data ?? []).map(mapFilmRow),
        loading: false,
        error: null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
