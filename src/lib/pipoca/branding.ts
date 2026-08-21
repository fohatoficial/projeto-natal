/**
 * Projeto Natal — camada de marca configurável.
 *
 * O patrocinador da ação ainda NÃO foi definido. Tudo aqui é placeholder
 * estrutural: quando a marca for definida, basta preencher estes valores
 * (ou ligá-los a variáveis de ambiente) — nenhuma tela precisa ser
 * redesenhada.
 */

export const EXPERIENCE_NAME = "";
export const EXPERIENCE_TAGLINE = "Cartão-postal natalino com inteligência artificial";

/** Marcador visível apenas em ambiente interno enquanto nada foi definido. */
export const SPONSOR_PENDING = true;

export type SponsorBranding = {
  /** Nome da ação/campanha exibido no topo. */
  actionName: string | null;
  /** Nome do patrocinador ("oferecido por"). */
  sponsorName: string | null;
  /** URL do logo do patrocinador (PNG/SVG com fundo transparente). */
  sponsorLogoUrl: string | null;
  /** Mensagem institucional curta exibida no resultado/impressão. */
  institutionalMessage: string | null;
};

export const SPONSOR: SponsorBranding = {
  actionName: null,
  sponsorName: null,
  sponsorLogoUrl: null,
  institutionalMessage: null,
};

/**
 * Controlador dos dados pessoais (LGPD).
 * A DEFINIR: será o patrocinador da ação. Enquanto nulo, o aviso de
 * privacidade usa uma expressão neutra e sinaliza pendência.
 */
export const DATA_CONTROLLER_NAME: string | null = null;
export const DATA_CONTROLLER_PRIVACY_EMAIL: string | null = null;
