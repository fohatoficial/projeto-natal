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

export const FALLBACK_POSTER =
  "/__l5e/assets-v1/81005976-aa68-4880-90ed-e70f253ec886/deus-e-o-diabo.jpg";

export const FALLBACK_MOVIES: Movie[] = [
  {
    id: "718bc5e2-04d1-45ad-9ebd-0ba78f6db045",
    title: "Deus e o Diabo na Terra do Sol",
    slug: "deus-e-o-diabo-na-terra-do-sol",
    synopsis_short:
      "Um clássico do cinema brasileiro, marcado pelo sertão, pela travessia e pela força simbólica do Cinema Novo.",
    cover_url: FALLBACK_POSTER,
    catalog_url: null,
    active: true,
    display_order: 1,
    posterUrl: FALLBACK_POSTER,
    cardDescription:
      "Um clássico do cinema brasileiro, marcado pelo sertão, pela travessia e pela força simbólica do Cinema Novo.",
    shortDescription:
      "Um clássico do cinema brasileiro, marcado pelo sertão, pela travessia e pela força simbólica do Cinema Novo.",
  },
];

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
