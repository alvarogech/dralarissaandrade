# Repositório Dra. Larissa Andrade

Este repositório reúne os projetos digitais da operação da Dra. Larissa Andrade:

- **`/` (este diretório)** — home page pública em HTML/CSS/JS puro (documentada abaixo). **Atenção:**
  o domínio `larissaandrade.com.br` **não** está conectado ao deploy Netlify deste repositório
  (site `dralarissaandrade`, que só responde em `dralarissaandrade.netlify.app`). O domínio real
  está no site Netlify `stimma`, que deploya do repositório `alvarogech/alvarosia` — **um
  repositório diferente, sem relação de git com este**. Este repositório é mantido como espelho/
  staging da mesma home; toda publicação em produção precisa também ir para `alvarosia`. Ver
  "Site de produção real" abaixo antes de qualquer deploy.
- **[`anamnese-app/`](./anamnese-app/README.md)** — app Next.js + Supabase para anamnese digital
  (HOF e Odontologia) enviada ao paciente antes da consulta, com painel de revisão da equipe.
- **[`stimma-os/`](./stimma-os/README.md)** — **STIMMA OS**: camada de inteligência e automação
  interna sobre o Simples Dental, para o gestor da operação. Ver
  [`docs/PROJECT_SPEC.md`](./docs/PROJECT_SPEC.md) e [`CLAUDE.md`](./CLAUDE.md) para contexto
  completo, e [`docs/`](./docs/) para toda a documentação de arquitetura, banco, regras de
  negócio, integrações e segurança.
- `larissa-andrade-gerador-pos-procedimento.html` — gerador de instruções pós-procedimento
  (ver [`README-gerador-pos-procedimento.md`](./README-gerador-pos-procedimento.md)).

Cada subprojeto tem seu próprio `package.json`/deploy — são independentes entre si (ver
[`docs/DECISIONS.md`](./docs/DECISIONS.md) para o porquê).

---

# Home page - Dra. Larissa Andrade

Landing page institucional e autoral da Dra. Larissa Andrade, em HTML, CSS e JavaScript puro,
publicada em `https://larissaandrade.com.br`. Abordagem diagnóstica, um olhar integrado sobre o
rosto, harmonização facial, pele e tecnologias, estética do sorriso, cuidados complementares,
resultados reais, sobre, experiência, FAQ e contato — com conversão principal pelo WhatsApp.

A versão anterior deste repositório já não tinha mais a ferramenta de "análise facial online" nem
o branding da Clínica Stimma (removidos antes desta sessão) — mas isso **não** significava que a
versão pública em produção estivesse atualizada: era um repositório diferente. Ver a seção
abaixo.

## Site de produção real (`larissaandrade.com.br`)

Até 2026-08-26, o domínio `larissaandrade.com.br` estava conectado ao site Netlify `stimma`, que
deploya de `github.com/alvarogech/alvarosia` — um repositório separado, de um único arquivo
(`index.html` autocontido de ~1MB + `assets/` + `netlify.toml`), que **era exatamente** a versão
antiga "análise facial online / Clínica Stimma" descrita no início deste documento. Esse
repositório também tem um redirect em `netlify.toml` (`/chat/*` → o subdomínio Netlify deste
repositório) que não foi alterado.

Nesta sessão, a reformulação foi implementada aqui primeiro e depois replicada para o repositório
`alvarosia` (incluindo duas fotos editoriais reais e um 7º caso de resultado que só existiam lá,
e que foram trazidos para este repositório também). Os dois repositórios devem ficar em paridade
de conteúdo a partir de agora — se `alvarosia` for descontinuado em favor de conectar o domínio
diretamente a este repositório (`dralarissaandrade`), atualize este aviso.

## Como abrir localmente

Abra o arquivo `index.html` diretamente no navegador, ou sirva a pasta com qualquer servidor
estático (`python -m http.server`, `npx serve`, etc.) — não é necessário instalar dependências,
build, backend ou banco de dados.

## Configuração centralizada (`config.js`)

Todo dado de contato/negócio fica em `config.js` (carregado antes de `script.js`), no objeto
`SITE_CONFIG`:

```javascript
const SITE_CONFIG = {
  whatsappNumber: "5562981693898",
  professionalName: "Dra. Larissa Andrade",
  instagramUrl: "https://www.instagram.com/dralarissadeandrade/",
  locationUrl: "",    // PENDENTE
  privacyUrl: "",     // PENDENTE
  cookiesUrl: "",     // PENDENTE
  whatsappMessages: { default: "...", header: "...", hero: "...", /* ... */ }
};
```

- `whatsappNumber`: apenas dígitos, com código do país e DDD (ex.: `5511999999999`). Valor atual
  vem do Portfolio Larissa Andrade (PDF), pág. 10 — **diverge** do número usado na versão anterior
  do site, que era da Clínica Stimma. Ver "Divergências encontradas" abaixo.
- `whatsappMessages`: uma mensagem pré-preenchida por contexto de CTA (`header`, `hero`,
  `menu_mobile`, `cta_final`, `footer`, `float`); `default` é usado se um contexto não tiver
  mensagem própria.
- `instagramUrl`, `locationUrl`, `privacyUrl`, `cookiesUrl`: enquanto estiverem vazios (`""`),
  o `script.js` **oculta automaticamente** o link correspondente no rodapé, em vez de publicar
  um link quebrado (`#`). Preencha para o link aparecer. `instagramUrl` já aponta para
  `@dralarissadeandrade` (fonte: portfólio) — **confirme o link antes de publicar em produção**,
  pois diverge do Instagram usado na versão anterior do site (`@stimma.clinica`).

Nenhum outro arquivo deveria precisar mudar só para atualizar esses dados.

## Como substituir as fotos da Dra. Larissa

O site usa duas fotos editoriais reais (vieram do repositório de produção `alvarogech/alvarosia`,
que é quem hoje serve `larissaandrade.com.br` — ver "Divergências encontradas"):

```text
assets/dra-larissa-editorial.jpeg   (preto e branco, usada no hero)
assets/dra-larissa-hero.jpeg        (colorida, usada em "Abordagem" e "Sobre")
```

Substitua mantendo os mesmos nomes de arquivo. Se `dra-larissa-editorial.jpeg` não existir, a
imagem de fundo do hero some silenciosamente (`data-fallback-hide` em `script.js`) em vez de
quebrar o layout — não há avatar de fallback.

## Como substituir o logotipo

O monograma "L·A" no cabeçalho tem duas variantes (uma para o cabeçalho transparente sobre o
hero escuro, outra para quando o cabeçalho fica sólido ao rolar — `script.js` alterna a classe
`is-scrolled` e o CSS troca qual delas aparece). Substitua os dois arquivos, mantendo os nomes:

```text
assets/logo-mark-cream.png   (sobre fundo escuro/hero)
assets/logo-mark-ink.png     (sobre fundo claro/rolado)
```

São os arquivos reais do monograma "L·A" (não uma recriação) — vieram de
`anamnese-app/public/brand/logo-larissa-dark.png` e `logo-larissa.png` respectivamente, onde já
existiam como parte da identidade "Arquitetura do Olhar". O rodapé também usa a variante ink
(`assets/logo-mark-ink.png`) ao lado do nome "Larissa Andrade".

## Como inserir imagens reais de antes e depois

A home usa 5 dos 7 casos disponíveis em `assets/` (curadoria de 2026-08-26 — ver comentário no
`index.html` acima da seção `#resultados`):

```text
assets/caso-04-antes-depois.jpg    (usado — 1º, span-6)
assets/caso-02-antes-depois.jpeg   (usado — span-3)
assets/caso-05-antes-depois.jpeg   (usado — span-3)
assets/caso-07-antes-depois.jpg    (usado — span-3)
assets/caso-06-antes-depois.jpeg   (usado — span-3)
assets/caso-01-antes-depois.jpg    (fora da home — antes/depois com luz e ângulo inconsistentes)
assets/caso-03-antes-depois.jpg    (fora da home — mesmo motivo)
```

Os arquivos de `caso-01` e `caso-03` continuam no repositório (não foram apagados) caso a Larissa
prefira usá-los mesmo assim, ou como material de referência.

Antes da publicação, use apenas casos reais com autorização de uso de imagem. Cada imagem já reúne antes e depois em um único arquivo.

Os casos usados formam uma única grade editorial assimétrica (`.results-editorial`, grid de 6 colunas com classes `.span-6` / `.span-3` / `.span-2` por `<figure>`, e `.ratio-wide` / `.ratio-landscape` / `.ratio-portrait` para o enquadramento). É responsiva por CSS puro — abaixo de 720px todo `<figure>` ocupa a largura cheia automaticamente, sem JavaScript. Ao adicionar ou remover um caso, ajuste os spans dos vizinhos para manter o ritmo.

## Como alterar textos das seções

**A partir de 2026-08-26, a estrutura e a copy seguem `kit-redesign-larissa/02-ARQUITETURA-E-COPY.md`**
(ver nota de nomes de arquivo trocados na conversa da sessão — o conteúdo real desse documento
teve que ser identificado por conteúdo, não pelo nome do arquivo recebido). Não reescreva essa
copy livremente; ajustes pequenos de extensão/quebra de linha são permitidos, mudanças de
sentido devem ser sinalizadas ao usuário.

Ordem das seções em `index.html` (Blocos do kit): hero → manifesto → **I** Método LA™ (nome
final pendente, ver "Dados pendentes") → **II** resultados desejados/queixas → **III** resultados
reais (identificadores neutros "Caso 01"–"07", sem legenda descritiva — mapeamento de casos
pendente) → **IV** jornada (da queixa ao planejamento) → **V** recursos e tratamentos (3 grupos:
expressão/proporção/contorno, qualidade e firmeza da pele, sorriso) → face/pele/sorriso (bloco
curto, sem numeral) → **VI** Dra. Larissa → FAQ (6 perguntas, conforme o kit) → CTA final →
rodapé. Não existe seção "Sobre" nem "Abordagem" separadas — foram substituídas pela estrutura
acima.

Componentes reaproveitados: `.accordion`/`.accordion-item` (`<details>`/`<summary>` nativos, sem
JS) para o accordion de recursos e o FAQ; `.sequence`/`.sequence-item` (lista numerada sempre
visível, sem esconder atrás de clique) para o Método LA™ e a Jornada — o kit pede explicitamente
que esses dois blocos não virem "mais um accordion". Marcadores de pendência ficam como
comentários HTML no próprio `index.html`, logo acima do bloco afetado.

## Depoimentos

Não existe seção de depoimentos na home — não há nenhum depoimento real e autorizado disponível
no projeto, e a política de comunicação do site não permite depoimentos inventados. Ao receber
depoimentos autorizados, adicione uma seção nova seguindo o mesmo padrão visual das demais (uma
`.split` com `.heading-row`/`.heading-num`, ou um `.accordion` — ver `styles.css`), sempre com
`<cite>` identificando a autorização.

## Como publicar

Este repositório tem deploy contínuo Netlify (site `dralarissaandrade`) a partir do branch
`main` — basta dar push. Mas isso **não** publica em `larissaandrade.com.br` (ver "Site de
produção real" acima): para isso, o mesmo conteúdo precisa ser levado ao repositório
`alvarogech/alvarosia`, que é quem o domínio real usa.

## Divergências encontradas entre a versão anterior do site e o portfólio

- **WhatsApp**: a versão anterior do site (Clínica Stimma) usava `+55 62 99696-5656`. O
  portfólio da Dra. Larissa (fonte de conteúdo desta reformulação) traz `+55 62 98169-3898`.
  `config.js` já usa o número do portfólio — confirme com a Dra. Larissa antes de publicar.
- **Instagram**: a versão anterior usava `@stimma.clinica`. O portfólio traz
  `@dralarissadeandrade`. `config.js` já usa `https://www.instagram.com/dralarissadeandrade/` —
  **o link não foi verificado ao vivo** (sem acesso à conta); confirme que existe e está correto
  antes de publicar.

## Dados pendentes de confirmação

- Localização (mapa), política de privacidade e cookies: campos vazios em `config.js`
  (`locationUrl`, `privacyUrl`, `cookiesUrl`). Enquanto vazios, os links somem do rodapé
  automaticamente.
- Endereço completo, horário de atendimento e CRO/formação da Dra. Larissa: não constam em
  nenhum lugar do repositório nem no portfólio — não devem ser inventados; a home não afirma
  nada sobre eles até serem confirmados. Por isso a home identifica a profissional apenas como
  "Dra. Larissa Andrade — Estética facial, pele e sorriso", sem citar "médica" ou uma
  especialidade específica.
- Depoimentos reais de pacientes (ver seção acima).
## Checklist antes de tráfego público

- [ ] Confirmar o WhatsApp `(62) 98169-3898` e o Instagram `@dralarissadeandrade` com a Dra.
      Larissa (ver "Divergências encontradas" acima).
- [ ] Preencher `locationUrl`, `privacyUrl`, `cookiesUrl` em `config.js`.
- [ ] Confirmar autorização de uso de imagem de cada caso em "Resultados reais".
- [ ] Adicionar depoimentos reais (ou manter a ausência da seção, que já é honesta).
- [ ] Confirmar CRO/formação da Dra. Larissa para eventual seção de credenciais.
- [ ] Testar a página completa no celular (360px a 430px) e em desktop.
- [ ] Validar as mensagens de WhatsApp em cada CTA (cabeçalho, hero, menu mobile, CTA final, rodapé, botão flutuante).
- [ ] Testar navegação por teclado (Tab, Enter, foco visível) e o FAQ/tratamentos em leitor de tela.
- [ ] Rodar `node --check script.js` e `node --check config.js` para validar a sintaxe.
