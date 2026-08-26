# Repositório Dra. Larissa Andrade

Este repositório reúne os projetos digitais da operação da Dra. Larissa Andrade:

- **`/` (este diretório)** — home page pública em HTML/CSS/JS puro, publicada em
  `https://larissaandrade.com.br` via Netlify (site `dralarissaandrade`, deploy contínuo a
  partir do branch `main`) (documentado abaixo).
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

A versão anterior do site era centrada em uma ferramenta de "análise facial online" com
identidade visual e branding da Clínica Stimma. Essa ferramenta e o branding da Stimma já não
existem no código deste repositório (foram removidos em versões anteriores, antes desta sessão) —
não há nenhuma automação de análise facial para migrar ou desligar.

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

## Como substituir a foto da Dra. Larissa

Coloque a foto em:

```text
assets/foto-larissa.jpg
```

Se o arquivo não existir, a imagem some silenciosamente (`data-fallback-hide` em `script.js`) em
vez de quebrar o layout — não há avatar de fallback.

## Como substituir o logotipo

O monograma "L·A" no cabeçalho tem duas variantes (uma para o cabeçalho transparente sobre o
hero escuro, outra para quando o cabeçalho fica sólido ao rolar — `script.js` alterna a classe
`is-scrolled` e o CSS troca qual delas aparece). Substitua os dois arquivos, mantendo os nomes:

```text
assets/logo-mark-cream.svg   (sobre fundo escuro/hero)
assets/logo-mark-ink.svg     (sobre fundo claro/rolado)
```

Os arquivos atuais são uma recriação vetorial feita a partir do moodboard da identidade
"Arquitetura do Olhar" — ver "Dados pendentes de confirmação" abaixo.

## Como inserir imagens reais de antes e depois

Substitua ou adicione imagens autorizadas nos seguintes caminhos. Nesta versão, cada arquivo pode ser uma imagem já montada com antes e depois lado a lado:

```text
assets/caso-01-antes-depois.jpg
assets/caso-02-antes-depois.jpeg
assets/caso-03-antes-depois.jpg
assets/caso-04-antes-depois.jpg
assets/caso-05-antes-depois.jpeg
assets/caso-06-antes-depois.jpeg
```

Antes da publicação, use apenas casos reais com autorização de uso de imagem. Cada imagem já reúne antes e depois em um único arquivo — a interface exibe a imagem inteira (`object-fit: contain`), sem cortes.

No celular, os resultados aparecem em um carrossel horizontal (`#resultsTrack`, com `scroll-snap`), com contador "X de 6" e botões "‹" / "›". No desktop (≥860px), os resultados aparecem em grade de duas colunas (`#resultsGrid`). Os dois conjuntos de cards ficam duplicados no HTML (um por breakpoint) — ao trocar um caso, atualize os dois.

## Como alterar textos das seções

Todo o texto das seções (hero, abordagem, um olhar integrado, harmonização facial, serviços de
harmonização, pele e tecnologias, estética do sorriso, cuidados complementares, resultados,
sobre, a experiência, FAQ, CTA final, rodapé) fica diretamente em `index.html`, em português,
organizado em `<section>` comentadas por nome.

## Depoimentos

Não existe seção de depoimentos na home — não há nenhum depoimento real e autorizado disponível
no projeto, e a política de comunicação do site não permite depoimentos inventados. Ao receber
depoimentos autorizados, adicione uma seção nova seguindo o mesmo padrão visual das demais
(ver `.tool-card` ou `.care-item` em `styles.css` como ponto de partida), sempre com `<cite>`
identificando a autorização.

## Como publicar

O domínio `larissaandrade.com.br` já está conectado ao site Netlify `dralarissaandrade`, com
deploy contínuo a partir do branch `main` deste repositório — basta dar push que o Netlify
publica automaticamente. Não é necessário `netlify.toml` (configuração feita pelo painel).

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
- Logotipo: `assets/logo-mark-ink.svg` e `assets/logo-mark-cream.svg` são uma recriação vetorial
  do monograma "L·A" a partir da referência visual (moodboard) enviada nesta sessão — não são o
  arquivo de origem (Illustrator/Figma) da identidade "Arquitetura do Olhar". Se esse arquivo
  original existir, substitua os dois SVGs por uma exportação fiel dele.

## Checklist antes de tráfego público

- [ ] Confirmar o WhatsApp `(62) 98169-3898` e o Instagram `@dralarissadeandrade` com a Dra.
      Larissa (ver "Divergências encontradas" acima).
- [ ] Preencher `locationUrl`, `privacyUrl`, `cookiesUrl` em `config.js`.
- [ ] Confirmar autorização de uso de imagem de cada caso em "Resultados reais".
- [ ] Adicionar depoimentos reais (ou manter a ausência da seção, que já é honesta).
- [ ] Confirmar CRO/formação da Dra. Larissa para eventual seção de credenciais.
- [ ] Substituir os SVGs do monograma por uma exportação oficial da identidade visual, se existir.
- [ ] Testar a página completa no celular (360px a 430px) e em desktop.
- [ ] Validar as mensagens de WhatsApp em cada CTA (cabeçalho, hero, menu mobile, CTA final, rodapé, botão flutuante).
- [ ] Testar navegação por teclado (Tab, Enter, foco visível) e o FAQ/tratamentos em leitor de tela.
- [ ] Rodar `node --check script.js` e `node --check config.js` para validar a sintaxe.
