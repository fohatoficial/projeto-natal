/** Mensagens prontas do cartão-postal (Projeto Natal). */

export const POSTCARD_MESSAGE_MAX = 100;

export type PostcardMessageType = "preset" | "custom";

export const PRESET_MESSAGES: { id: string; text: string }[] = [
  { id: "p1", text: "Que seu Natal seja cheio de amor, alegria e momentos inesquecíveis." },
  { id: "p2", text: "Que a magia do Natal ilumine seu coração e sua família." },
  { id: "p3", text: "Onde há amor, há Natal. Que ele esteja presente em cada momento." },
  { id: "p4", text: "Que este Natal renove a esperança e traga paz para você e sua família." },
  { id: "p5", text: "Feliz Natal! Que não faltem motivos para celebrar, sorrir e agradecer." },
];

/** Identificação fixa exibida no cartão neste sprint. */
export const POSTCARD_PLACE_LABEL = "BRASÍLIA • NATAL 2026";

export function sanitizeMessage(input: string): string {
  return input.replace(/\s+/g, " ").trimStart().slice(0, POSTCARD_MESSAGE_MAX);
}
