// Tipos do catálogo Pipoca & Cena.
// Os dados agora vêm do Supabase (tabela public.pipoca_films).

export type Movie = {
  id: string;
  title: string;
  slug: string;
  synopsis_short: string | null;
  cover_url: string | null;
  catalog_url: string | null;
  active: boolean;
  display_order: number;

  // Campos derivados para compatibilidade com componentes existentes (MovieCard).
  posterUrl: string;
  cardDescription: string;
  shortDescription: string;
};

const FALLBACK_POSTER =
  "/__l5e/assets-v1/81005976-aa68-4880-90ed-e70f253ec886/deus-e-o-diabo.jpg";

export function mapFilmRow(row: {
  id: string;
  title: string;
  slug: string;
  synopsis_short: string | null;
  cover_url: string | null;
  catalog_url: string | null;
  active: boolean;
  display_order: number;
}): Movie {
  const poster = row.cover_url && row.cover_url.trim() ? row.cover_url : FALLBACK_POSTER;
  const description = row.synopsis_short ?? "";
  return {
    ...row,
    posterUrl: poster,
    cardDescription: description,
    shortDescription: description,
  };
}
