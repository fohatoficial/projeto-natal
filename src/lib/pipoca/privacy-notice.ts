// Privacy notice content for Pipoca & Cena. Bump PRIVACY_NOTICE_VERSION
// whenever the substantive text changes; the version is recorded with each
// visitor consent for auditing.

export const PRIVACY_NOTICE_VERSION = "1.0";

// Editable placeholders. Adjust here, no need to touch components.
export const PRIVACY_PLACEHOLDERS = {
  NOME_DO_CONTROLADOR: "Tela Brasil",
  EMAIL_DE_PRIVACIDADE: "privacidade@telabrasil.org.br",
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
  "Para realizar esta experiência, {{NOME_DO_CONTROLADOR}} coleta seu nome, número de WhatsApp e as imagens capturadas no totem.",
  "Esses dados serão utilizados para criar sua imagem personalizada, disponibilizá-la por QR Code, identificar eventual solicitação de impressão e manter a segurança e o funcionamento da experiência.",
  "Suas imagens podem ser processadas por fornecedores tecnológicos contratados para armazenamento e geração da cena personalizada.",
  "Seus dados não serão usados para campanhas de marketing sem uma autorização separada.",
  "Os dados serão mantidos somente {{PRAZO_DE_RETENCAO}} e pelas obrigações aplicáveis.",
  "Você pode solicitar confirmação do tratamento, acesso, correção, revogação da autorização ou exclusão dos seus dados pelo contato: {{EMAIL_DE_PRIVACIDADE}}.",
  "Ao marcar a autorização e continuar, você declara ter lido e compreendido este aviso.",
].map(fill);

export const PRIVACY_CHECKBOX_LABEL =
  "Li o Aviso de Privacidade e autorizo o tratamento do meu nome, WhatsApp e imagens para criar e disponibilizar minha cena personalizada e, caso eu solicite, identificar e imprimir minha foto.";
