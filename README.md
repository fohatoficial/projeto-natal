# PROJETO NATAL

Crie a primeira versão visual e navegável do MVP “Pipoca & Cena”, uma nova experiência interativa dentro do ecossistema Tela Brasil.

Importante:
Eu já tenho um projeto existente do Tela Brasil neste workspace/projeto da Lovable. Use esse projeto existente como referência para identidade visual, estrutura, padrões de layout, componentes, cores, tipografia, assets, logos e organização geral. @project:d6611878-a8e0-4d82-a752-0617cf5baf1a:"Quiz Brasil Fun" 

Não quebre, não sobrescreva e não remova fluxos existentes do projeto atual. Crie o Pipoca & Cena como um novo módulo/fluxo separado, reaproveitando o que fizer sentido da estrutura citada.

Neste primeiro momento, NÃO integre IA, Supabase, banco de dados, storage ou APIs externas novas. Quero apenas a interface funcional com fluxo simulado.

Contexto do produto:
O Pipoca & Cena permite que o visitante escolha um filme brasileiro, tire uma foto no tablet e receba uma imagem personalizada criada por IA em uma cena inspirada no filme escolhido. O resultado final será acessado por QR Code.

MVP:
O sistema deve estar preparado visualmente para múltiplos filmes, mas nesta versão terá apenas 1 filme ativo:

Filme:
Deus e o Diabo na Terra do Sol

Descrição:
Um clássico do cinema brasileiro, marcado pelo sertão, pela travessia e pela força simbólica do Cinema Novo.

Fluxo de telas:

Tela inicial

Escolha do filme

Filme escolhido

Orientação da foto

Captura da foto simulada

Confirmação da foto

Processamento com IA simulado

Resultado simulado

QR Code simulado

Página mobile de resultado simulada

Textos das telas:

Tela inicial:
Título: Pipoca & Cena
Chamada: Escolha um filme brasileiro. Tire sua foto. Entre em cena.
Texto: Escolha uma obra do catálogo Tela Brasil, tire sua foto e veja a IA transformar você em personagem de uma cena inspirada no filme escolhido.
Botão: Começar

Tela escolha do filme:
Título: Escolha seu filme
Texto: Selecione uma obra do catálogo Tela Brasil para inspirar sua cena personalizada.
Card do filme: Deus e o Diabo na Terra do Sol
Descrição do card: Um clássico do cinema brasileiro, marcado pelo sertão, pela travessia e pela força simbólica do Cinema Novo.
Botão do card: Escolher este filme

Tela filme escolhido:
Título: Filme escolhido
Texto: Agora vamos criar uma cena personalizada inspirada no universo visual desta obra.
Texto dinâmico: Inspirado em: Deus e o Diabo na Terra do Sol
Botão: Continuar

Tela orientação da foto:
Título: Prepare sua cena
Texto: Fique em pé, no centro da marcação, com o rosto visível e bem iluminado.
Texto secundário: Mantenha uma expressão natural. A IA usará sua foto para criar uma imagem inspirada no filme escolhido.
Botão: Abrir câmera

Tela captura da foto:
Criar uma tela simulando câmera do tablet.
Texto: Posicione seu rosto dentro da marcação.
Texto secundário: Evite cobrir o rosto e mantenha-se parado por alguns segundos.
Botão: Tirar foto
Ao clicar em “Tirar foto”, avançar para a tela de confirmação usando uma imagem placeholder.

Tela confirmação da foto:
Título: Gostou da sua foto?
Texto: Essa será a imagem usada para criar sua cena personalizada.
Botões:
Usar esta foto
Tirar novamente
Se clicar em “Tirar novamente”, voltar para a captura.
Se clicar em “Usar esta foto”, avançar para processamento.

Tela processamento:
Título: Luzes, câmera, ação...
Texto: Estamos criando sua cena personalizada inspirada no filme escolhido.
Mostrar frases de loading alternadas:
Preparando o cenário...
Ajustando luz, contraste e atmosfera...
Colocando você no centro da cena...
Finalizando sua imagem cinematográfica...
Depois de alguns segundos, avançar para resultado simulado.

Tela resultado:
Título: Você entrou em cena
Texto: Sua imagem foi recriada em um universo inspirado no cinema brasileiro.
Texto dinâmico: Inspirado em: Deus e o Diabo na Terra do Sol
Mostrar uma imagem placeholder em destaque.
Botões:
Gerar QR Code
Refazer experiência
Se clicar em “Gerar QR Code”, avançar para tela de QR Code.
Se clicar em “Refazer experiência”, voltar para o início.

Tela QR Code:
Título: Baixe e compartilhe sua cena
Texto: Escaneie o QR Code para acessar sua imagem personalizada.
Texto secundário: Depois, conheça também o filme que inspirou sua cena no catálogo Tela Brasil.
Mostrar um QR Code simulado.
Mostrar miniatura da imagem final simulada.
Botão: Nova experiência
Ao clicar, voltar para tela inicial.

Página mobile de resultado simulada:
Criar uma rota ou tela chamada “resultado”.
Título: Sua cena está pronta
Texto: Baixe sua imagem personalizada criada na experiência Pipoca & Cena.
Texto dinâmico: Inspirado em: Deus e o Diabo na Terra do Sol
Mostrar imagem final simulada.
Botões:
Baixar imagem
Compartilhar
Conhecer o filme

Direção visual:
A interface deve seguir a identidade visual já existente no projeto Tela Brasil, reaproveitando paleta, logo, estilo dos componentes, padrões de tela e estética geral.

A experiência deve parecer premium, cultural e cinematográfica.
Usar fundo escuro elegante, tons de preto, grafite, off-white e dourado discreto, se isso estiver alinhado à identidade atual.
Layout pensado para tablet em orientação vertical.
Botões grandes, legíveis e fáceis de tocar.
Tipografia clara, sofisticada e com boa leitura.
Evitar excesso de informação por tela.
A experiência deve parecer uma ativação cultural de cinema, não um formulário.

Importante:
Manter a estrutura preparada para receber múltiplos filmes depois.
Criar o card de filme como componente reutilizável.
Criar o fluxo de forma clara e simples.
Não implementar integração real de câmera ainda, apenas simulação visual.
Não implementar IA ainda, apenas loading e resultado placeholder.
Não implementar QR Code real ainda, apenas placeholder visual.
Não alterar nem apagar funcionalidades existentes do projeto Tela Brasil.
Criar este fluxo em rota ou seção separada chamada Pipoca & Cena.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9e372163-9e26-48a9-9712-e38119e310c9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
