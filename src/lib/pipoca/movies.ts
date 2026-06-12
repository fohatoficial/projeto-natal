export type Movie = {
  id: string;
  title: string;
  shortDescription: string;
  cardDescription: string;
  posterUrl: string;
  active: boolean;
};

// Estrutura preparada para múltiplos filmes — basta adicionar novos itens.
export const movies: Movie[] = [
  {
    id: "deus-e-o-diabo",
    title: "Deus e o Diabo na Terra do Sol",
    shortDescription:
      "Um clássico do cinema brasileiro, marcado pelo sertão, pela travessia e pela força simbólica do Cinema Novo.",
    cardDescription:
      "Um clássico do cinema brasileiro, marcado pelo sertão, pela travessia e pela força simbólica do Cinema Novo.",
    posterUrl:
      "/__l5e/assets-v1/de37c2a3-37e1-4362-939b-17608c38ef7b/deus-e-o-diabo.jpg",
    active: true,
  },
];

export const getActiveMovies = () => movies.filter((m) => m.active);
export const getMovieById = (id: string) => movies.find((m) => m.id === id);
