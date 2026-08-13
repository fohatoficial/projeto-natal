// Aviso de privacidade do Projeto Natal.
// Bump PRIVACY_NOTICE_VERSION sempre que o texto substantivo mudar; a versão
// é registrada junto com o consentimento de cada visitante para auditoria.

import {
  DATA_CONTROLLER_NAME,
  DATA_CONTROLLER_PRIVACY_EMAIL,
} from "@/lib/pipoca/branding";

export const PRIVACY_NOTICE_VERSION = "2.0";

// PENDENTE: o controlador dos dados será o patrocinador da ação.
// Enquanto não definido, usamos uma expressão neutra e um marcador explícito.
export const PRIVACY_CONTROLLER_PENDING = DATA_CONTROLLER_NAME === null;

export const PRIVACY_PLACEHOLDERS = {
  NOME_DO_CONTROLADOR:
    DATA_CONTROLLER_NAME ?? "o responsável pela ação (a definir antes do evento)",
  EMAIL_DE_PRIVACIDADE:
    DATA_CONTROLLER_PRIVACY_EMAIL ?? "o canal de privacidade informado no local",
  PRAZO_DE_RETENCAO: "pelo período do evento e até 90 dias após o encerramento",
};

function fill(text: string): string {
  return text
    .replaceAll("{{NOME_DO_CONTROLADOR}}", PRIVACY_PLACEHOLDERS.NOME_DO_CONTROLADOR)
    .replaceAll("{{EMAIL_DE_PRIVACIDADE}}", PRIVACY_PLACEHOLDERS.EMAIL_DE_PRIVACIDADE)
    .replaceAll("{{PRAZO_DE_RETENCAO}}", PRIVACY_PLACEHOLDERS.PRAZO_DE_RETENCAO);
}

export const PRIVACY_NOTICE_TITLE = "AVISO DE PRIVACIDADE";

export const PRIVACY_NOTICE_PARAGRAPHS: string[] = [
  "Para realizar esta experiência, {{NOME_DO_CONTROLADOR}} coleta seu nome, número de WhatsApp e as imagens capturadas no local.",
  "Esses dados serão utilizados para criar seu cartão-postal natalino personalizado, disponibilizá-lo por QR Code, identificar eventual solicitação de impressão e manter a segurança e o funcionamento da experiência.",
  "Suas imagens podem ser processadas por fornecedores tecnológicos contratados para armazenamento e geração da imagem personalizada.",
  "Seus dados não serão usados para campanhas de marketing sem uma autorização separada.",
  "Os dados serão mantidos somente {{PRAZO_DE_RETENCAO}} e pelas obrigações aplicáveis.",
  "Você pode solicitar confirmação do tratamento, acesso, correção, revogação da autorização ou exclusão dos seus dados pelo contato: {{EMAIL_DE_PRIVACIDADE}}.",
  "Ao marcar a autorização e continuar, você declara ter lido e compreendido este aviso.",
].map(fill);

export const PRIVACY_CHECKBOX_LABEL =
  "Li o Aviso de Privacidade e autorizo o tratamento do meu nome, WhatsApp e imagens para criar e disponibilizar meu cartão-postal natalino e, caso eu solicite, identificar e imprimir minha foto.";
