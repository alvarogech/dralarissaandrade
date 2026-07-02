/* ========================================================================
   1. CONFIGURAÇÕES
   ======================================================================== */
const CONFIG = {
  whatsappNumber: "5562981693898",
  clinicName: "Stimma",
  professionalName: "Dra. Larissa Andrade",
  instagramUrl: "#",
  locationUrl: "#",
  privacyUrl: "#",
  pilotMode: false
};

/* Cadência da conversa. Ajuste estes valores para deixar a experiência
   mais rápida ou mais pausada — evite descer demais para não voltar a
   ficar imperceptível, e evite subir demais para não cansar a visitante. */
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

/* ========================================================================
   2. DADOS DA JORNADA
   ======================================================================== */
const userJourney = {
  entryPath: null,
  concern: null,
  selectedSituation: null,
  resultViewed: null,
  contactIntent: null,
  whatsappClickedAt: null
};

/* ========================================================================
   3. SELETORES DO DOM
   ======================================================================== */
const conversation = document.querySelector("#conversation");
const backButton = document.querySelector("#backButton");
const restartButton = document.querySelector("#restartButton");
const composerHint = document.querySelector("#composerHint");
const snapshots = [];
const choiceActions = new Map();
let lockedChoiceGroups = new Set();
let stepId = 0;
let actionId = 0;

/* ========================================================================
   4. DADOS DAS MENSAGENS
   ======================================================================== */
const concernResponses = {
  "Meu rosto parece cansado": [
    "A aparência de cansaço pode estar relacionada às olheiras, à perda de sustentação, à qualidade da pele ou à mudança dos contornos faciais.",
    "O objetivo da avaliação é compreender quais fatores realmente estão contribuindo para essa percepção."
  ],
  "Sinto que perdi contorno": [
    "A perda de contorno pode aparecer na mandíbula, no queixo, nas bochechas ou na transição entre o rosto e o pescoço.",
    "Antes de indicar qualquer intervenção, é importante observar proporção, sustentação e equilíbrio."
  ],
  "Meus olhos parecem pesados": [
    "A região dos olhos pode transmitir cansaço mesmo quando você está descansada.",
    "Olheiras, flacidez, excesso de pele, perda de sustentação e qualidade da pele precisam ser analisados de formas diferentes."
  ],
  "Minha pele perdeu o viço": [
    "Textura, luminosidade, poros, manchas e hidratação influenciam diretamente a forma como percebemos a vitalidade da pele.",
    "O tratamento deve ser construído de acordo com a necessidade real da pele."
  ],
  "Percebo sinais do tempo": [
    "O envelhecimento não acontece em apenas uma região.",
    "Ele pode envolver pele, sustentação, volume, movimento e contorno. Por isso, o planejamento deve considerar o rosto de forma integrada."
  ],
  "Não sei explicar exatamente": [
    "Você não precisa saber nomear exatamente aquilo que sente.",
    "Muitas pacientes percebem que algo mudou, mas ainda não conseguem identificar onde essa mudança aconteceu.",
    "É justamente nesse momento que uma avaliação cuidadosa pode ajudar."
  ]
};

const specificConcerns = [
  "Rosto cansado",
  "Olheiras profundas",
  "Flacidez ao redor dos olhos",
  "Falta de contorno",
  "Papada ou pescoço",
  "Pele sem viço",
  "Manchas",
  "Acne",
  "Cicatrizes de acne",
  "Quero uma transformação mais completa"
];

/* ========================================================================
   5. DADOS DOS RESULTADOS
   ======================================================================== */
const RESULTS = [
  {
    id: "caso-01",
    title: "Qualidade e expressão facial",
    description:
      "Planejamento direcionado à harmonia global, preservando naturalidade e identidade da paciente.",
    category: "Harmonização facial",
    filters: ["Harmonização facial", "Qualidade da pele"],
    image: "assets/caso-01-antes-depois.jpg"
  },
  {
    id: "caso-02",
    title: "Equilíbrio e suavização facial",
    description:
      "Abordagem pensada para suavizar sinais percebidos no rosto e melhorar a harmonia sem perder expressão.",
    category: "Harmonização facial",
    filters: ["Harmonização facial", "Qualidade da pele"],
    image: "assets/caso-02-antes-depois.jpeg"
  },
  {
    id: "caso-03",
    title: "Contorno e sustentação facial",
    description:
      "Planejamento direcionado à sustentação, proporção e definição dos contornos, preservando a identidade da paciente.",
    category: "Contorno facial",
    filters: ["Harmonização facial", "Contorno facial"],
    image: "assets/caso-03-antes-depois.jpg"
  },
  {
    id: "caso-04",
    title: "Perfil e harmonia nasal",
    description: "Resultado voltado à leitura do perfil, equilíbrio das proporções e harmonia entre as regiões do rosto.",
    category: "Harmonização facial",
    filters: ["Harmonização facial", "Contorno facial"],
    image: "assets/caso-04-antes-depois.jpg"
  },
  {
    id: "caso-05",
    title: "Região dos olhos e expressão",
    description:
      "Tratamento pensado para suavizar a aparência de cansaço e melhorar a harmonia da região periocular.",
    category: "Região dos olhos",
    filters: ["Região dos olhos", "Plasma IQ"],
    image: "assets/caso-05-antes-depois.jpeg"
  },
  {
    id: "caso-06",
    title: "Qualidade, textura e viço da pele",
    description: "Planejamento direcionado à textura, luminosidade e aparência global da pele.",
    category: "Qualidade da pele",
    filters: ["Qualidade da pele", "Harmonização facial"],
    image: "assets/caso-06-antes-depois.jpeg"
  }
];

/* Vincula cada percepção/queixa a um resultado relacionado, para mostrar
   automaticamente um caso ao invés de perguntar se a visitante quer ver.
   Deixe uma entrada de fora do mapa para manter o comportamento padrão
   (abrir a galeria completa) quando não houver uma relação clara. */
const CONCERN_RESULT_MAP = {
  "Meu rosto parece cansado": "caso-05",
  "Sinto que perdi contorno": "caso-03",
  "Meus olhos parecem pesados": "caso-05",
  "Minha pele perdeu o viço": "caso-06",
  "Percebo sinais do tempo": "caso-01",
  "Rosto cansado": "caso-05",
  "Olheiras profundas": "caso-05",
  "Flacidez ao redor dos olhos": "caso-05",
  "Falta de contorno": "caso-03",
  "Papada ou pescoço": "caso-03",
  "Pele sem viço": "caso-06",
  "Manchas": "caso-06",
  "Acne": "caso-06",
  "Cicatrizes de acne": "caso-06",
  "Quero uma transformação mais completa": "caso-01"
};

/* ========================================================================
   6. UTILIDADES DE TEMPO E ANIMAÇÃO
   ======================================================================== */
function trackEvent(eventName, eventData = {}) {
  console.log("Evento:", eventName, eventData);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function typingDurationFor(text) {
  if (isReducedMotion()) {
    return Math.min(700, Math.max(280, text.length * 8));
  }
  return Math.min(
    CONVERSATION_TIMING.typingMaximum,
    Math.max(CONVERSATION_TIMING.typingMinimum, text.length * CONVERSATION_TIMING.typingPerCharacter)
  );
}

function pauseBetweenMessages() {
  return isReducedMotion() ? 90 : CONVERSATION_TIMING.pauseBetweenMessages;
}

function pauseAfterUserReply() {
  return isReducedMotion() ? 220 : CONVERSATION_TIMING.pauseAfterUserReply;
}

function scrollToEnd() {
  requestAnimationFrame(() => {
    conversation.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "end" });
  });
}

/* Usado para blocos altos (galeria de resultados): alinha o topo do
   bloco à tela, para a imagem não ser empurrada para fora pelo texto
   e pelos botões que vêm logo abaixo dela. */
function scrollToTop(target) {
  requestAnimationFrame(() => {
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/* Mostra o avatar e o horário apenas na última mensagem de um grupo
   consecutivo da Dra. Larissa, em vez de repetir em cada balão. */
function refreshMessageGrouping() {
  const messages = conversation.querySelectorAll(".message.bot:not(.typing-wrapper)");
  messages.forEach((el) => {
    const next = el.nextElementSibling;
    const isGrouped = !!(next && next.classList.contains("message") && next.classList.contains("bot") && !next.classList.contains("typing-wrapper"));
    el.classList.toggle("is-grouped", isGrouped);
  });
}

function updateComposerHint() {
  if (!composerHint) return;
  composerHint.textContent = document.body.classList.contains("has-active-choices") ? "Escolha uma opção para continuar" : "";
}

/* ========================================================================
   7. TOAST (feedback discreto, sem alert())
   ======================================================================== */
let toastTimer = null;

function showToast(message) {
  let toast = document.querySelector(".app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "app-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 4200);
}

/* ========================================================================
   8. INDICADOR DE DIGITAÇÃO E RENDERIZAÇÃO DE MENSAGENS
   ======================================================================== */
function showTypingIndicator(shouldScroll = true) {
  const wrapper = document.createElement("div");
  wrapper.className = "message bot typing-wrapper";
  wrapper.innerHTML = `
    <div class="typing" aria-label="Preparando a próxima mensagem">
      <span></span><span></span><span></span>
    </div>
  `;
  conversation.append(wrapper);
  if (shouldScroll) scrollToEnd();
  return wrapper;
}

function hideTypingIndicator(wrapper) {
  wrapper.remove();
}

async function addAssistantMessage(text, options = {}) {
  const shouldScroll = options.scroll !== false;
  const typing = showTypingIndicator(shouldScroll);
  await wait(typingDurationFor(text));
  hideTypingIndicator(typing);

  const message = document.createElement("article");
  message.className = `message bot${options.quote ? " quote-bubble" : ""}`;
  message.style.setProperty("--bubble-duration", `${CONVERSATION_TIMING.bubbleAnimationDuration}ms`);
  message.innerHTML = `
    <div class="bubble">
      ${text}
      <span class="message-meta">agora</span>
    </div>
  `;
  conversation.append(message);
  refreshMessageGrouping();
  if (shouldScroll) scrollToEnd();
}

function addUserMessage(text) {
  const message = document.createElement("article");
  message.className = "message user";
  message.style.setProperty("--bubble-duration", `${CONVERSATION_TIMING.bubbleAnimationDuration}ms`);
  message.innerHTML = `
    <div class="bubble">
      ${text}
      <span class="message-meta">enviado</span>
    </div>
  `;
  conversation.append(message);
  scrollToEnd();
  if (!isReducedMotion()) {
    window.setTimeout(() => {
      const meta = message.querySelector(".message-meta");
      if (meta) meta.textContent = "entregue";
    }, CONVERSATION_TIMING.deliveryStatusDelay);
  }
}

async function addAssistantMessages(messages) {
  for (let index = 0; index < messages.length; index += 1) {
    if (index > 0) await wait(pauseBetweenMessages());
    const item = messages[index];
    if (typeof item === "string") {
      await addAssistantMessage(item);
    } else {
      await addAssistantMessage(item.text, item);
    }
  }
}

/* ========================================================================
   9. NAVEGAÇÃO ENTRE ETAPAS (voltar / recomeçar)
   ======================================================================== */
function saveSnapshot() {
  snapshots.push({
    html: conversation.innerHTML,
    journey: structuredClone(userJourney),
    locks: Array.from(lockedChoiceGroups)
  });
  backButton.hidden = snapshots.length === 0;
}

function restoreSnapshot() {
  const snapshot = snapshots.pop();
  if (!snapshot) return;
  conversation.innerHTML = snapshot.html;
  Object.assign(userJourney, snapshot.journey);
  lockedChoiceGroups = new Set(snapshot.locks);
  backButton.hidden = snapshots.length === 0;
  document.body.classList.toggle("has-active-choices", !!conversation.querySelector(".choices.is-active:not(.is-locked)"));
  updateComposerHint();
  refreshMessageGrouping();
  conversation.querySelectorAll(".results-panel").forEach(attachCarouselControls);
  scrollToEnd();
}

function goBack() {
  trackEvent("conversation_back", { journey: { ...userJourney } });
  restoreSnapshot();
}

function restartExperience() {
  trackEvent("conversation_restarted", { journey: { ...userJourney } });
  startExperience();
}

/* ========================================================================
   10. RESPOSTAS RÁPIDAS
   ======================================================================== */
function clearActiveChoices() {
  conversation.querySelectorAll(".choices").forEach((group) => {
    group.classList.add("is-locked");
    group.classList.remove("is-active");
    group.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    });
  });
  document.body.classList.remove("has-active-choices");
  updateComposerHint();
}

function renderQuickReplies(choices, options = {}) {
  const groupId = `step-${++stepId}`;
  const group = document.createElement("div");
  group.className = "choices is-active";
  group.dataset.groupId = groupId;
  group.setAttribute("aria-label", options.label || "Escolha uma resposta");

  choices.forEach((choice) => {
    const currentActionId = `action-${++actionId}`;
    choiceActions.set(currentActionId, choice);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `choice${choice.whatsapp ? " whatsapp-choice" : ""}`;
    button.textContent = choice.label;
    button.dataset.event = choice.event || "";
    button.dataset.actionId = currentActionId;
    group.append(button);
  });

  conversation.append(group);
  document.body.classList.add("has-active-choices");
  updateComposerHint();
  if (options.scroll !== false) scrollToEnd();
}

/* Bloco de maior carga editorial, usado nos momentos de fechamento
   da narrativa (ex.: a frase de método da Dra. Larissa). */
function addClosingCard(title, text) {
  const card = document.createElement("div");
  card.className = "closing-card";
  card.innerHTML = `
    <span class="closing-mark" aria-hidden="true">LA</span>
    <h2 class="closing-title">${title}</h2>
    <p class="closing-text">${text}</p>
  `;
  conversation.append(card);
  scrollToEnd();
}

function addFinalChoices() {
  renderQuickReplies([
    { label: "Recomeçar experiência", event: "reiniciar_final", skipUserMessage: true, action: startExperience },
    {
      label: "Falar com a equipe",
      event: "whatsapp_final",
      whatsapp: true,
      action: () => openWhatsApp(buildContextMessage("general"), "whatsapp_final", "general")
    }
  ]);
}

/* ========================================================================
   11. RESULTADOS (carrossel + filtros)
   ======================================================================== */
async function showResultsIntro() {
  userJourney.entryPath = userJourney.entryPath || "resultados";
  await addAssistantMessages([
    "Os resultados ajudam a visualizar possibilidades, mas cada rosto exige um planejamento individual.",
    "Selecione o tipo de resultado que gostaria de conhecer."
  ]);
  trackEvent("results_opened", { entryPath: userJourney.entryPath });
  renderResults("Todos");
}

function renderResults(activeFilter) {
  const filters = ["Todos", "Harmonização facial", "Região dos olhos", "Contorno facial", "Qualidade da pele", "Plasma IQ"];
  const panel = document.createElement("section");
  panel.className = "results-panel";
  panel.innerHTML = `
    <div class="filter-row" aria-label="Filtros de resultados">
      ${filters
        .map(
          (filter) =>
            `<button class="filter-button${filter === activeFilter ? " is-active" : ""}" type="button" data-filter="${filter}" data-event="filtro_${slug(filter)}">${filter}</button>`
        )
        .join("")}
    </div>
    <div class="carousel-nav">
      <button class="carousel-prev" type="button" aria-label="Resultado anterior">‹</button>
      <span class="carousel-progress" aria-live="polite">1 de ${RESULTS.length}</span>
      <button class="carousel-next" type="button" aria-label="Próximo resultado">Próximo resultado ›</button>
    </div>
    <div class="cases-grid results-list" role="list" aria-label="Galeria de resultados"></div>
    <p class="note">Os resultados variam de acordo com as características e necessidades de cada paciente. As imagens não representam garantia de resultado.</p>
    ${CONFIG.pilotMode ? '<p class="note pilot-note">Página em fase de validação. Confirmar autorizações e informações dos casos antes da publicação definitiva.</p>' : ""}
  `;

  conversation.append(panel);
  attachCarouselControls(panel);
  populateCases(panel, activeFilter);
  scrollToTop(panel);
}

function populateCases(panel, activeFilter) {
  const list = panel.querySelector(".results-list");
  const visible = RESULTS.filter((item) => activeFilter === "Todos" || item.filters.includes(activeFilter));
  list.innerHTML = visible.map(createCaseCard).join("");

  list.querySelectorAll("img").forEach((image) => {
    image.addEventListener("error", () => image.classList.add("is-missing"), { once: true });
  });

  panel._carouselTotal = visible.length || 1;
  list.scrollLeft = 0;
  panel._updateCarouselProgress?.();
}

function attachCarouselControls(panel) {
  const list = panel.querySelector(".results-list");
  const progress = panel.querySelector(".carousel-progress");
  const prevBtn = panel.querySelector(".carousel-prev");
  const nextBtn = panel.querySelector(".carousel-next");
  if (!list) return;

  function updateProgress() {
    const total = panel._carouselTotal || 1;
    const index = list.clientWidth ? Math.round(list.scrollLeft / list.clientWidth) : 0;
    const current = Math.min(total, index + 1);
    if (progress) progress.textContent = `${current} de ${total}`;
    if (prevBtn) prevBtn.disabled = current <= 1;
    if (nextBtn) nextBtn.disabled = current >= total;
  }

  list.addEventListener("scroll", () => {
    window.clearTimeout(panel._scrollTimer);
    panel._scrollTimer = window.setTimeout(updateProgress, 80);
  });
  prevBtn?.addEventListener("click", () => list.scrollBy({ left: -list.clientWidth, behavior: "smooth" }));
  nextBtn?.addEventListener("click", () => list.scrollBy({ left: list.clientWidth, behavior: "smooth" }));

  panel._updateCarouselProgress = updateProgress;
  updateProgress();
}

function renderSingleResult(result) {
  const panel = document.createElement("section");
  panel.className = "results-panel";
  panel.innerHTML = `
    <div class="cases-grid results-list"></div>
    <p class="note">Os resultados variam de acordo com as características e necessidades de cada paciente. As imagens não representam garantia de resultado.</p>
    ${CONFIG.pilotMode ? '<p class="note pilot-note">Página em fase de validação. Confirmar autorizações e informações dos casos antes da publicação definitiva.</p>' : ""}
  `;
  conversation.append(panel);

  const list = panel.querySelector(".results-list");
  list.innerHTML = createCaseCard(result);
  list.querySelectorAll("img").forEach((image) => {
    image.addEventListener("error", () => image.classList.add("is-missing"), { once: true });
  });
  scrollToTop(panel);
}

async function showRelatedResult(label) {
  const caseId = CONCERN_RESULT_MAP[label];
  const result = caseId && RESULTS.find((item) => item.id === caseId);
  if (!result) return;
  userJourney.resultViewed = result.title;
  trackEvent("result_viewed", { result: result.title, caseId, source: "concern_match" });
  await addAssistantMessage("Aqui está um resultado real relacionado a isso:");
  renderSingleResult(result);
}

function createCaseCard(item) {
  const caseNumber = item.id.replace("caso-", "");
  return `
    <article class="case-card" role="listitem">
      <figure class="combined-result">
        <img
          class="combined-image"
          src="${item.image}"
          alt="Imagem comparativa de antes e depois do caso ${caseNumber}: ${item.title}"
          loading="lazy"
        />
        <figcaption>Resultado real · Caso ${caseNumber}</figcaption>
      </figure>
      <div class="case-content">
        <span class="case-category">${item.category}</span>
        <h2>${item.title}</h2>
        <p>${item.description}</p>
        <button class="case-action" type="button" data-case-id="${item.id}" data-event="resultado_${item.id.replace("-", "_")}">Quero entender este resultado</button>
      </div>
    </article>
  `;
}

async function handleResultSelection(caseId) {
  const selected = RESULTS.find((item) => item.id === caseId);
  if (!selected) return;
  userJourney.resultViewed = selected.title;
  trackEvent("result_viewed", { result: selected.title, caseId });
  saveSnapshot();
  clearActiveChoices();
  addUserMessage("Quero entender este resultado");
  await wait(pauseAfterUserReply());
  await addAssistantMessages([
    "Este resultado foi construído a partir de uma avaliação individual.",
    "O planejamento considera as características, necessidades e objetivos de cada paciente.",
    "Como você gostaria de continuar?"
  ]);
  renderQuickReplies([
    {
      label: "Quero conversar sobre um caso semelhante",
      event: "whatsapp_resultado_conversar",
      whatsapp: true,
      action: () => {
        const caseNumber = caseId.replace("caso-", "");
        openWhatsApp(
          `Olá! Vim pelo Instagram da ${CONFIG.professionalName} e gostaria de entender melhor um caso semelhante ao resultado ${caseNumber} apresentado na página.`,
          "result_contact_clicked",
          "relatedConcern"
        );
      }
    },
    { label: "Quero ver outro resultado", event: "continuar_conhecendo", action: showResultsIntro },
    {
      label: "Quero agendar uma avaliação",
      event: "whatsapp_agendamento",
      whatsapp: true,
      action: () => openWhatsApp(buildContextMessage("assessment"), "evaluation_clicked", "assessment")
    },
    { label: "Voltar ao início", event: "voltar_inicio", skipUserMessage: true, action: startExperience }
  ]);
}

/* ========================================================================
   12. WHATSAPP
   ======================================================================== */
function isWhatsAppNumberConfigured() {
  return /^\d{10,15}$/.test(CONFIG.whatsappNumber);
}

function buildWhatsAppUrl(message) {
  return `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function buildContextMessage(intent = "general") {
  const parts = [`Olá! Vim pelo Instagram da ${CONFIG.professionalName}.`];

  if (userJourney.concern) {
    parts.push(`Na experiência de orientação, selecionei: ${userJourney.concern}.`);
  }

  if (userJourney.resultViewed) {
    parts.push(`Gostaria de entender melhor um caso relacionado a ${userJourney.resultViewed}.`);
  }

  const intentMessages = {
    general: "Gostaria de conversar com a equipe.",
    assessment: "Gostaria de agendar uma avaliação facial.",
    values: "Gostaria de entender melhor os valores e as possibilidades de tratamento.",
    treatmentQuestion: "Tenho uma dúvida sobre um tratamento.",
    patient: `Já sou paciente da clínica ${CONFIG.clinicName} e gostaria de falar com a equipe.`,
    service: "Gostaria de falar com a equipe sobre meu atendimento.",
    evaluationMethod: "Gostaria de entender melhor como funciona a avaliação.",
    relatedConcern: "Gostaria de entender quais possibilidades fazem sentido para o meu rosto."
  };

  parts.push(intentMessages[intent] || intentMessages.general);
  return parts.join(" ");
}

function openWhatsApp(message, eventName = "whatsapp_clicked", intent = "general") {
  if (!isWhatsAppNumberConfigured()) {
    console.warn("O número de WhatsApp ainda não foi configurado em CONFIG.whatsappNumber.");
    showToast("O número de atendimento ainda precisa ser configurado.");
    return;
  }
  userJourney.contactIntent = intent;
  userJourney.whatsappClickedAt = new Date().toISOString();
  trackEvent(eventName, { intent, journey: { ...userJourney } });
  window.open(buildWhatsAppUrl(message), "_blank", "noopener,noreferrer");
}

function wireGlobalLinks() {
  document.querySelectorAll("[data-whatsapp]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      openWhatsApp(buildContextMessage(element.dataset.whatsapp), element.dataset.event, element.dataset.whatsapp);
    });
  });

  const instagramLink = document.querySelector('.footer-links a[aria-label="Instagram provisório"]');
  const footerLinks = document.querySelectorAll('.footer-links a[href="#"]');
  if (instagramLink) instagramLink.href = CONFIG.instagramUrl;
  if (footerLinks[1]) footerLinks[1].href = CONFIG.locationUrl;
  if (footerLinks[2]) footerLinks[2].href = CONFIG.privacyUrl;
}

function handleImageFallback() {
  document.querySelectorAll("img").forEach((image) => {
    image.addEventListener("error", () => {
      image.classList.add("is-missing");
      image.setAttribute("aria-hidden", "true");
    });
  });
}

/* ========================================================================
   13. FLUXO DA CONVERSA
   ======================================================================== */
async function startExperience() {
  conversation.innerHTML = '<p class="system-note">Suas respostas são confidenciais.</p>';
  snapshots.length = 0;
  lockedChoiceGroups = new Set();
  stepId = 0;
  document.body.classList.remove("has-active-choices");
  updateComposerHint();
  Object.assign(userJourney, {
    entryPath: null,
    concern: null,
    selectedSituation: null,
    resultViewed: null,
    contactIntent: null,
    whatsappClickedAt: null
  });
  backButton.hidden = true;

  trackEvent("conversation_started");
  await wait(isReducedMotion() ? 300 : CONVERSATION_TIMING.initialDelay);

  await addAssistantMessages([
    "Olá, seja bem-vinda.",
    `Esta experiência foi criada para ajudar você a conhecer o olhar e o trabalho da ${CONFIG.professionalName}.`,
    "Antes de escolher um procedimento, talvez seja mais importante entender o que você percebe quando se olha no espelho.",
    "O que trouxe você até aqui hoje?"
  ]);

  renderQuickReplies([
    { label: "Quero entender o que meu rosto precisa", event: "inicio_entender_rosto", action: startFaceUnderstanding },
    { label: "Existe algo específico que me incomoda", event: "inicio_queixa_especifica", action: startSpecificConcern },
    { label: "Quero ver resultados", event: "inicio_resultados", action: showResultsIntro },
    { label: "Quero falar com a equipe", event: "inicio_contato", action: startContactPath }
  ]);
}

async function startFaceUnderstanding() {
  userJourney.entryPath = "entender_rosto";
  await addAssistantMessages([
    "Nem sempre aquilo que nos incomoda é exatamente o que precisa ser tratado.",
    "Por isso, a avaliação começa pela compreensão do rosto como um conjunto, e não pela escolha isolada de um procedimento.",
    "Qual destas situações mais se aproxima do que você sente?"
  ]);
  renderQuickReplies(
    Object.keys(concernResponses).map((label) => ({
      label,
      event: `percepcao_${slug(label)}`,
      action: handlePerception
    }))
  );
}

async function handlePerception(label) {
  userJourney.selectedSituation = label;
  userJourney.concern = label;
  trackEvent("situation_selected", { situation: label });
  await addAssistantMessages(concernResponses[label]);
  await showRelatedResult(label);
  await addAssistantMessage("Prefere conversar diretamente com a equipe?", { scroll: false });
  renderQuickReplies(
    [
      { label: "Ver mais resultados", event: "ver_mais_resultados", action: showResultsIntro },
      { label: "Entender como funciona a avaliação", event: "entender_avaliacao", action: showEvaluationMethod },
      {
        label: "Continuar pelo WhatsApp",
        event: "whatsapp_contextual",
        whatsapp: true,
        action: () => openWhatsApp(buildContextMessage("relatedConcern"), "whatsapp_contextual", "relatedConcern")
      },
      {
        label: "Conversar com a equipe",
        event: "whatsapp_equipe_concern",
        whatsapp: true,
        action: () => openWhatsApp(buildContextMessage("general"), "whatsapp_equipe_concern", "general")
      }
    ],
    { scroll: false }
  );
}

async function showEvaluationMethod() {
  trackEvent("evaluation_clicked");
  await addAssistantMessage("Antes de qualquer procedimento, a avaliação começa por aqui:");
  addClosingCard(
    "Meu trabalho não começa quando eu pego uma seringa. Começa quando eu aprendo a enxergar.",
    "A avaliação observa proporção, sustentação, movimento, passagem do tempo, qualidade da pele e harmonia entre as diferentes regiões do rosto."
  );
  await wait(pauseBetweenMessages());
  await addAssistantMessage("A partir dessa leitura, a conversa sobre procedimentos fica mais clara, individualizada e coerente.");
  addFinalChoices();
}

async function startSpecificConcern() {
  userJourney.entryPath = "queixa_especifica";
  await addAssistantMessage("Claro. Selecione a região ou situação que mais se aproxima do que você percebe.");
  renderQuickReplies(
    specificConcerns.map((label) => ({
      label,
      event: `queixa_${slug(label)}`,
      action: handleSpecificConcern
    }))
  );
}

async function handleSpecificConcern(label) {
  userJourney.concern = label;
  trackEvent("concern_selected", { concern: label });
  await addAssistantMessages([
    `Você selecionou: ${label}.`,
    "Essa percepção pode estar associada a diferentes fatores. A avaliação permite compreender a origem da queixa e quais possibilidades fazem sentido para o seu rosto."
  ]);
  await showRelatedResult(label);
  renderQuickReplies(
    [
      { label: "Ver mais resultados", event: "ver_mais_resultados", action: showResultsIntro },
      { label: "Conhecer possibilidades de tratamento", event: "conhecer_possibilidades", action: showTreatmentPossibilities },
      {
        label: "Enviar minha queixa para a equipe",
        event: "whatsapp_queixa",
        whatsapp: true,
        action: () =>
          openWhatsApp(
            `Olá! Vim pelo Instagram da ${CONFIG.professionalName} e gostaria de entender melhor uma questão relacionada a ${label.toLowerCase()}.`,
            "whatsapp_queixa",
            "relatedConcern"
          )
      }
    ],
    { scroll: false }
  );
}

async function showTreatmentPossibilities() {
  await addAssistantMessages([
    "As possibilidades podem envolver pele, sustentação, contorno, região dos olhos ou combinações diferentes entre essas dimensões.",
    "Nesta experiência, a ideia não é indicar um procedimento, mas mostrar como a avaliação organiza o caminho com mais precisão."
  ]);
  addFinalChoices();
}

async function startContactPath() {
  userJourney.entryPath = "contato";
  await addAssistantMessage("Claro. Para direcionarmos você da melhor forma, qual destas opções descreve o seu momento?");
  renderQuickReplies([
    {
      label: "Quero agendar uma avaliação",
      event: "whatsapp_agendamento",
      whatsapp: true,
      action: () =>
        openWhatsApp(
          `Olá! Vim pelo Instagram da ${CONFIG.professionalName} e gostaria de agendar uma avaliação facial.`,
          "whatsapp_agendamento",
          "assessment"
        )
    },
    {
      label: "Quero entender valores",
      event: "whatsapp_valores",
      whatsapp: true,
      action: () =>
        openWhatsApp(
          `Olá! Vim pelo Instagram da ${CONFIG.professionalName} e gostaria de entender melhor os valores e as possibilidades de tratamento.`,
          "whatsapp_valores",
          "values"
        )
    },
    {
      label: "Tenho dúvida sobre um tratamento",
      event: "whatsapp_duvida_tratamento",
      whatsapp: true,
      action: () =>
        openWhatsApp(
          `Olá! Vim pelo Instagram da ${CONFIG.professionalName} e tenho uma dúvida sobre um tratamento.`,
          "whatsapp_duvida_tratamento",
          "treatmentQuestion"
        )
    },
    {
      label: "Já sou paciente",
      event: "whatsapp_paciente",
      whatsapp: true,
      action: () =>
        openWhatsApp(`Olá! Já sou paciente da clínica e gostaria de falar com a equipe.`, "whatsapp_paciente", "patient")
    },
    {
      label: "Quero falar sobre meu atendimento",
      event: "whatsapp_atendimento",
      whatsapp: true,
      action: () =>
        openWhatsApp(`Olá! Gostaria de falar com a equipe sobre meu atendimento.`, "whatsapp_atendimento", "service")
    }
  ]);
}

function slug(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/* ========================================================================
   14. INICIALIZAÇÃO E EVENTOS GLOBAIS
   ======================================================================== */
backButton.addEventListener("click", goBack);
restartButton.addEventListener("click", restartExperience);

conversation.addEventListener("click", async (event) => {
  const choiceButton = event.target.closest(".choice");
  if (choiceButton) {
    const groupId = choiceButton.closest(".choices")?.dataset.groupId;
    const choice = choiceActions.get(choiceButton.dataset.actionId);
    if (!choice || lockedChoiceGroups.has(groupId)) return;
    lockedChoiceGroups.add(groupId);
    trackEvent(choice.event || "choice_click", { label: choice.label, journey: { ...userJourney } });
    saveSnapshot();
    clearActiveChoices();
    if (!choice.skipUserMessage) addUserMessage(choice.label);
    await wait(pauseAfterUserReply());
    await choice.action(choice.label);
    return;
  }

  const filterButton = event.target.closest(".filter-button");
  if (filterButton) {
    const panel = filterButton.closest(".results-panel");
    trackEvent(filterButton.dataset.event, { filter: filterButton.dataset.filter });
    panel.querySelectorAll(".filter-button").forEach((item) => item.classList.remove("is-active"));
    filterButton.classList.add("is-active");
    populateCases(panel, filterButton.dataset.filter);
    return;
  }

  const caseButton = event.target.closest(".case-action");
  if (caseButton) {
    await handleResultSelection(caseButton.dataset.caseId);
  }
});

handleImageFallback();
wireGlobalLinks();
trackEvent("page_view");
startExperience();
