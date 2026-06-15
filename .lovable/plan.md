
# Sprint Pipoca & Cena — Cadastro, Consentimento, Impressão

Esta é uma sprint grande (14 partes). Antes de implementar, quero confirmar o escopo e algumas decisões.

## O que vou construir

### 1. Banco de dados (migration nova)
- Tabela `pipoca_visitors` (nome, primeiro nome, whatsapp normalizado + últimos 4, consentimentos com timestamp, versão do aviso, marketing separado).
- Tabela `pipoca_print_queue` (visitor + generation, status, timestamps, índice único parcial para impedir pedido ativo duplicado).
- Coluna `visitor_id` em `pipoca_sessions`.
- RLS habilitada em ambas, sem políticas públicas — todo acesso via server functions com `supabaseAdmin`.

### 2. Fluxo do totem
Novo passo `visitor_registration` entre `choose` e `story_1`:
- Form com Nome, WhatsApp (máscara `(00) 00000-0000` → `+55...`), checkbox de autorização (não pré-marcada), link para Aviso de Privacidade em modal.
- Botão CONTINUAR só habilita quando tudo válido.
- Chama `createPipocaVisitor` (server fn) → retorna `{ visitorId, firstName }`.
- Stories e telas seguintes personalizam pelo `firstName` (`THIAGO, VOCÊ ESCOLHEU`, `PREPARE-SE, THIAGO`, etc.).
- Upload/geração passam `visitorId` para vincular à sessão.

### 3. Resultado do totem (Stories)
Remover botão "Liberar QR Code". Dois slides:
- **Slide foto (10s, auto-avança)**: fundo full-bleed com a própria imagem blur/escurecida, foto principal `object-contain` por cima, sem clip-path, sem bordas decorativas. Toque livre avança.
- **Slide QR**: QR + "LEVE SUA CENA" + botão discreto "Nova experiência". Sem download/share no totem.

### 4. Página pública `/resultado/$publicToken` (mobile)
- Classe própria `pipoca-public-result-page`, libera scroll, `min-height: 100dvh`, safe-area iOS.
- Remove qualquer scroll-lock herdado do kiosk.
- Botão novo **SOLICITAR IMPRESSÃO** → server fn `requestPipocaPrint({ publicToken })` → cria item `pending` na fila (idempotente: se já existe ativo, retorna mensagem "já está na fila").
- Mantém download e compartilhar.
- Sem nome personalizado na pública (só "SUA CENA ESTÁ PRONTA").

### 5. Fila de impressão `/fila-de-impressao`
- Rota protegida por PIN (secret server-side `PIPOCA_PRINT_QUEUE_PIN`).
- Login: form de PIN → server fn valida → seta cookie HttpOnly assinado (session ~8h).
- Lista pendentes (mais antigos primeiro) com: nome, últimos 4 do WhatsApp, horário, filme, thumb signed-url, status, ações IMPRIMIR / MARCAR COMO ENTREGUE / CANCELAR.
- Busca por nome / últimos 4, filtro por status, refresh automático (10s) + botão refresh.
- Botão **ZERAR FILA** com modal dupla confirmação → status `cleared` + `cleared_at` (sem delete físico, histórico preservado).
- Botão IMPRIMIR abre página de impressão limpa (`/imprimir/$queueId`) 10×15cm, `@page` configurado, `object-contain`, esconde UI em `@media print`, chama `window.print()` após onload, marca `printing`.

### 6. Logs sem PII
Logs estruturados sem nome completo, whatsapp completo, imagens, PIN ou signed URLs.

## Decisões técnicas

- Todas server fns sob `src/lib/pipoca/` (`visitors.functions.ts`, `print-queue.functions.ts`, `print-auth.functions.ts`).
- `supabaseAdmin` importado dentro de `.handler()`.
- Página de impressão usa server route `/api/public/print-image/$queueId` com verificação por cookie da fila para criar signed URL.
- Migration entregue como SQL pronto (NÃO afirmarei que foi executada — você roda no Supabase).
- Aviso de Privacidade: componente com placeholders configuráveis em `src/lib/pipoca/privacy-notice.ts` (`{{NOME_DO_CONTROLADOR}}`, `{{EMAIL_DE_PRIVACIDADE}}`, `{{PRAZO_DE_RETENCAO}}`). Versão `1.0`.

## Secrets a configurar
- `PIPOCA_PRINT_QUEUE_PIN` — PIN da recepcionista
- `PIPOCA_PRINT_QUEUE_COOKIE_SECRET` — segredo para assinar cookie da sessão admin (HMAC)

## Restrições respeitadas
Não toco em: Replicate, modelos, prompts, Scene Packs, lógica de geração, upload, QR Code, seleção aleatória, buckets (continuam privados).

## Perguntas antes de começar

1. **Valores dos placeholders do Aviso de Privacidade** — posso usar defaults editáveis (`Tela Brasil`, `privacidade@telabrasil.org.br`, `90 dias após o evento`) e você ajusta depois no arquivo `privacy-notice.ts`? Ou prefere já me passar os valores finais?
2. **Página de impressão** — assumo papel 10×15cm landscape com a foto 4:5 centralizada com margem branca (sem moldura/legenda). OK?
3. **Posso seguir e gerar tudo nesta rodada?** É bastante código (≈12 arquivos novos, ~7 alterados). Confirmando, executo direto.
