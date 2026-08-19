/** Mensagens, estilos tipográficos e divisores do cartão-postal (Projeto Natal). */

export const POSTCARD_MESSAGE_MAX = 100;

export type PostcardMessageType = "preset" | "custom";
export type PostcardFontStyle = "classic" | "script" | "modern";
export type PostcardDividerStyle = "snowflake" | "star" | "branch" | "ornament";

export const PRESET_MESSAGES: {
  id: string;
  text: string;
  /** Apresentação tipográfica curada de cada mensagem (sensação editorial). */
  font: PostcardFontStyle;
  divider: PostcardDividerStyle;
}[] = [
  {
    id: "p1",
    text: "Que seu Natal seja cheio de amor, alegria e momentos inesquecíveis.",
    font: "classic",
    divider: "snowflake",
  },
  {
    id: "p2",
    text: "Que a magia do Natal ilumine seu coração e sua família.",
    font: "script",
    divider: "star",
  },
  {
    id: "p3",
    text: "Onde há amor, há Natal. Que ele esteja presente em cada momento.",
    font: "classic",
    divider: "branch",
  },
  {
    id: "p4",
    text: "Que este Natal renove a esperança e traga paz para você e sua família.",
    font: "modern",
    divider: "ornament",
  },
  {
    id: "p5",
    text: "Feliz Natal! Que não faltem motivos para celebrar, sorrir e agradecer.",
    font: "script",
    divider: "snowflake",
  },
];

export const FONT_STYLES: {
  id: PostcardFontStyle;
  label: string;
  hint: string;
  /** Família CSS usada tanto no seletor quanto no canvas. */
  css: string;
}[] = [
  {
    id: "classic",
    label: "Clássica",
    hint: "Serifada e editorial",
    css: '"Cormorant Garamond", Georgia, serif',
  },
  {
    id: "script",
    label: "Manuscrita",
    hint: "Afetiva e elegante",
    css: '"Pinyon Script", "Cormorant Garamond", cursive',
  },
  {
    id: "modern",
    label: "Contemporânea",
    hint: "Limpa e sofisticada",
    css: '"DM Sans", system-ui, sans-serif',
  },
];

export const DIVIDER_STYLES: {
  id: PostcardDividerStyle;
  label: string;
}[] = [
  { id: "snowflake", label: "Floco" },
  { id: "star", label: "Estrela" },
  { id: "branch", label: "Ramo" },
  { id: "ornament", label: "Ornamento" },
];

/** Identificação fixa exibida no cartão neste sprint. */
export const POSTCARD_PLACE_LABEL = "BRASÍLIA • NATAL 2026";

export function sanitizeMessage(input: string): string {
  return input.replace(/\s+/g, " ").trimStart().slice(0, POSTCARD_MESSAGE_MAX);
}
