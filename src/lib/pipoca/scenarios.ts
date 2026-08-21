/**
 * Cenários da experiência nacional do Projeto Natal (home).
 *
 * Isto é APENAS escolha de cenário para a montagem do cartão-postal — não
 * representa capital, cidade ou localização do visitante, nem configuração
 * de totem. `slug` corresponde ao slug do cenário em `pipoca_films`.
 *
 * No MVP atual, apenas Brasília possui scene pack funcional; os demais
 * aparecem na home como "Em breve" e não iniciam geração.
 */

export type ScenarioDef = {
  /** Slug do cenário no banco (pipoca_films.slug). */
  slug: string;
  /** Nome grande exibido no card. */
  city: string;
  /** Marco icônico exibido sob o nome. */
  landmark: string;
  /** Se false, o card aparece desabilitado com o selo "Em breve". */
  available: boolean;
};

export const SCENARIOS: ScenarioDef[] = [
  {
    slug: "natal-em-brasilia",
    city: "Brasília",
    landmark: "Catedral Metropolitana",
    available: true,
  },
  {
    slug: "natal-em-gramado",
    city: "Gramado",
    landmark: "Rua Coberta",
    available: false,
  },
  {
    slug: "natal-em-sao-paulo",
    city: "São Paulo",
    landmark: "MASP",
    available: false,
  },
  {
    slug: "natal-em-curitiba",
    city: "Curitiba",
    landmark: "Palácio Avenida",
    available: false,
  },
];
