// Tipos do catálogo de cenários do Projeto Natal.
// Os dados vêm do Supabase (tabela public.pipoca_films — nome interno mantido
// nesta fase; cada linha representa um CENÁRIO da experiência de Natal).

export type Movie = {
  id: string;
  title: string;
  slug: string;
  synopsis_short: string | null;
  cover_url: string | null;
  catalog_url: string | null;
  active: boolean;
  display_order: number;

  // Campos derivados usados pela UI.
  posterUrl: string;
  cardDescription: string;
  shortDescription: string;
};

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
  const poster = row.cover_url && row.cover_url.trim() ? row.cover_url : "";
  const description = row.synopsis_short ?? "";
  return {
    ...row,
    posterUrl: poster,
    cardDescription: description,
    shortDescription: description,
  };
}
