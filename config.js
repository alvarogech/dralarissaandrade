/* ========================================================================
   CONFIGURAÇÃO CENTRAL DO SITE — Dra. Larissa Andrade
   Edite apenas este arquivo para atualizar WhatsApp, Instagram, endereço
   e mensagens pré-preenchidas. Nenhum outro arquivo deveria precisar
   mudar por causa desses dados.

   Campos marcados com "" (vazio) ainda não têm dado real confirmado.
   Enquanto estiverem vazios, o script.js oculta o link correspondente
   no rodapé em vez de publicar um link quebrado ("#").

   Fonte dos dados de contato: Portfolio Larissa Andrade (PDF), pág. 10.
   Diverge do WhatsApp e do Instagram usados na versão anterior do site
   (que eram da Clínica Stimma) — ver relatório de entrega para detalhes.
   ======================================================================== */
const SITE_CONFIG = {
  whatsappNumber: "5562981693898",
  professionalName: "Dra. Larissa Andrade",

  instagramUrl: "https://www.instagram.com/dralarissadeandrade/",

  locationUrl: "https://share.google/11WOC5o76bUK0yV6W",

  // PENDENTE — preencher com dados reais antes da publicação definitiva.
  privacyUrl: "",
  cookiesUrl: "",

  whatsappMessages: {
    default: "Olá! Conheci o trabalho da Dra. Larissa pelo site e gostaria de entender como funciona a avaliação.",
    header: "Olá! Conheci o trabalho da Dra. Larissa pelo site e gostaria de agendar minha avaliação.",
    hero: "Olá! Conheci o trabalho da Dra. Larissa pelo site e gostaria de agendar minha avaliação.",
    menu_mobile: "Olá! Conheci o trabalho da Dra. Larissa pelo site e gostaria de agendar minha avaliação.",
    cta_final: "Olá! Conheci o trabalho da Dra. Larissa pelo site e gostaria de agendar minha avaliação.",
    footer: "Olá! Conheci o trabalho da Dra. Larissa pelo site e gostaria de entender como funciona a avaliação.",
    float: "Olá! Conheci o trabalho da Dra. Larissa pelo site e gostaria de conversar com a equipe."
  }
};
