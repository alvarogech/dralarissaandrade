# Piloto interativo - Dra. Larissa Andrade

Página piloto em HTML, CSS e JavaScript puro para uso como link principal da bio do Instagram. A experiência simula uma conversa de orientação facial, com caminhos para avaliação, queixas, resultados e contato com a equipe.

## Como abrir localmente

Abra o arquivo `index.html` diretamente no navegador. Não é necessário instalar dependências, rodar servidor, backend ou banco de dados.

## Como alterar o número do WhatsApp

No início de `script.js`, dentro do objeto `CONFIG`, substitua:

```javascript
const CONFIG = {
  whatsappNumber: "55XXXXXXXXXXX",
  ...
};
```

Use somente números, com código do país e DDD. Exemplo: `5511999999999`. Enquanto o número não for configurado (mantiver o `X`), a página não abre o WhatsApp e mostra um aviso discreto (toast) na tela, sem usar `alert()`.

## Configurações centralizadas (`CONFIG`)

Todo o essencial do piloto fica no topo de `script.js`, no objeto `CONFIG`:

```javascript
const CONFIG = {
  whatsappNumber: "55XXXXXXXXXXX",
  clinicName: "Stimma",
  professionalName: "Dra. Larissa Andrade",
  instagramUrl: "#",
  locationUrl: "#",
  privacyUrl: "#",
  pilotMode: true
};
```

- `clinicName` e `professionalName` alimentam automaticamente todas as mensagens da conversa e do WhatsApp.
- `instagramUrl`, `locationUrl` e `privacyUrl` alimentam os links do rodapé.
- `pilotMode` controla o modo piloto (ver seção abaixo).

## Modo piloto (`pilotMode`)

Enquanto `CONFIG.pilotMode` estiver `true`, a galeria de resultados exibe um aviso extra:
"Página em fase de validação. Confirmar autorizações e informações dos casos antes da publicação definitiva."

Antes de publicar definitivamente, mude para `pilotMode: false`.

## Como ajustar a cadência da conversa

Os tempos da animação ficam centralizados em `CONVERSATION_TIMING`, no início de `script.js`:

```javascript
const CONVERSATION_TIMING = {
  initialDelay: 600,
  typingMinimum: 900,
  typingMaximum: 1800,
  typingPerCharacter: 18,
  pauseBetweenMessages: 120,
  pauseAfterUserReply: 650,
  bubbleAnimationDuration: 420,
  deliveryStatusDelay: 450
};
```

- `initialDelay`: espera antes da primeira mensagem aparecer.
- `typingMinimum` / `typingMaximum` / `typingPerCharacter`: controlam quanto tempo o indicador de digitação fica visível (proporcional ao tamanho da mensagem) — é aqui que mora a maior parte da cadência perceptível.
- `pauseBetweenMessages`: intervalo curto entre uma mensagem terminar de aparecer e o próximo indicador de digitação começar (mantido baixo de propósito, para o ritmo vir do tempo de digitação, não de uma pausa fixa).
- `pauseAfterUserReply`: pausa depois que a visitante responde, antes da próxima etapa começar.
- `bubbleAnimationDuration`: duração da animação de entrada dos balões.
- `deliveryStatusDelay`: tempo até o status da mensagem da visitante mudar de "enviado" para "entregue".

A experiência respeita `prefers-reduced-motion`: quando ativado no sistema operacional, os tempos são reduzidos automaticamente e as animações praticamente removidas.

## Como substituir a foto da Dra. Larissa

Coloque a foto em:

```text
assets/foto-larissa.jpg
```

Se a imagem não existir, a interface mostra um avatar elegante com as iniciais `LA`.

## Como substituir o logotipo

Substitua o arquivo:

```text
assets/logo-larissa.svg
```

Mantenha o mesmo nome para não precisar alterar o HTML.

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

Enquanto os arquivos não existirem, o piloto mantém fallback visual neutro. Antes da publicação, use apenas casos reais com autorização de uso de imagem. Cada imagem já reúne antes e depois em um único arquivo — a interface exibe a imagem inteira (`object-fit: contain`), sem cortes.

No celular, os resultados aparecem em um carrossel horizontal (um caso por vez, com `scroll-snap`), com contador "X de 6" e botões "‹" / "Próximo resultado". No desktop, os resultados aparecem lado a lado em duas colunas.

## Como alterar textos e resultados

Os textos da conversa ficam em `script.js`, principalmente nas constantes:

- `concernResponses`
- `specificConcerns`
- `RESULTS` (título, categoria, descrição e imagem de cada um dos seis casos)

Textos estruturais do cabeçalho e rodapé ficam em `index.html`.

## Resultado automático vinculado à dor selecionada

Quando a visitante escolhe uma percepção (ex.: "Meu rosto parece cansado") ou uma queixa específica (ex.: "Olheiras profundas"), a experiência já mostra automaticamente um resultado relacionado, sem perguntar antes. Esse vínculo é configurado em `CONCERN_RESULT_MAP`, no início de `script.js`:

```javascript
const CONCERN_RESULT_MAP = {
  "Meu rosto parece cansado": "caso-05",
  "Rosto cansado": "caso-05",
  ...
};
```

Cada chave precisa ser exatamente igual ao texto da opção (label) e o valor precisa ser o `id` de um item em `RESULTS`. Se uma percepção ou queixa não estiver no mapa, o comportamento padrão é usado (a conversa segue normalmente, sem mostrar um caso automaticamente).

## Como publicar gratuitamente

GitHub Pages:

1. Crie um repositório no GitHub.
2. Envie `index.html`, `styles.css`, `script.js`, `README.md` e a pasta `assets`.
3. Ative Pages em `Settings > Pages`.

Netlify:

1. Acesse o Netlify.
2. Arraste a pasta do projeto para a área de deploy.
3. Configure o domínio desejado.

Vercel:

1. Crie um projeto novo.
2. Importe o repositório ou envie os arquivos.
3. Publique como projeto estático.

## Dados para substituir antes da publicação

- Número real do WhatsApp em `CONFIG.whatsappNumber`, no início de `script.js`.
- Foto real da Dra. Larissa em `assets/foto-larissa.jpg`.
- Logotipo final em `assets/logo-larissa.svg`.
- Imagens reais autorizadas dos casos em `assets/caso-*-antes-depois.jpg` ou `.jpeg`, conforme configurado em `RESULTS` (`script.js`).
- Links reais de Instagram, localização e política de privacidade em `CONFIG.instagramUrl`, `CONFIG.locationUrl` e `CONFIG.privacyUrl`, em `script.js`.
- `CONFIG.pilotMode` para `false` quando a página estiver pronta para publicação definitiva.
- Revisão jurídica/ética dos textos e autorizações de imagem antes de tráfego público.

## Checklist antes da publicação

- [ ] Configurar `CONFIG.whatsappNumber` com o número real (somente dígitos, com DDI e DDD).
- [ ] Revisar os links do rodapé (`instagramUrl`, `locationUrl`, `privacyUrl`).
- [ ] Revisar títulos e descrições dos seis resultados em `RESULTS`.
- [ ] Confirmar autorização de uso de imagem de cada caso.
- [ ] Revisar a política de privacidade vinculada.
- [ ] Testar a experiência completa no celular (320px a 430px de largura).
- [ ] Validar as mensagens geradas para o WhatsApp em cada caminho (cabeçalho, botão fixo, resultados, agendamento, queixa específica).
- [ ] Testar a navegação por teclado (Tab, Enter, foco visível).
- [ ] Decidir se `CONFIG.pilotMode` deve permanecer `true` ou mudar para `false`.
- [ ] Rodar `node --check script.js` para validar a sintaxe.
