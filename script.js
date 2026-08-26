/* ========================================================================
   Dra. Larissa Andrade — interações da home
   Depende de config.js (deve ser carregado antes deste arquivo).
   ======================================================================== */
(function () {
  "use strict";

  document.body.classList.remove("js-disabled");

  /* ----------------------------------------------------------------------
     WhatsApp — todos os CTAs constroem o link a partir de SITE_CONFIG
     ---------------------------------------------------------------------- */
  function buildWhatsappUrl(context) {
    var number = SITE_CONFIG.whatsappNumber;
    var message = SITE_CONFIG.whatsappMessages[context] || SITE_CONFIG.whatsappMessages.default;
    return "https://wa.me/" + number + "?text=" + encodeURIComponent(message);
  }

  var whatsappLinks = document.querySelectorAll("[data-whatsapp-cta]");
  whatsappLinks.forEach(function (link) {
    var context = link.getAttribute("data-whatsapp-cta");
    link.setAttribute("href", buildWhatsappUrl(context));
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener");
  });

  /* ----------------------------------------------------------------------
     Rodapé — oculta links institucionais sem dado real confirmado
     ---------------------------------------------------------------------- */
  function wireOptionalLink(elementId, url) {
    var el = document.getElementById(elementId);
    if (!el) return;
    if (url) {
      el.setAttribute("href", url);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");
    } else {
      el.closest("li").style.display = "none";
    }
  }

  wireOptionalLink("instagramLink", SITE_CONFIG.instagramUrl);
  wireOptionalLink("locationLink", SITE_CONFIG.locationUrl);
  wireOptionalLink("privacyLink", SITE_CONFIG.privacyUrl);
  wireOptionalLink("cookiesLink", SITE_CONFIG.cookiesUrl);

  var yearEl = document.getElementById("currentYear");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ----------------------------------------------------------------------
     Cabeçalho — transparente no hero, sólido ao rolar
     ---------------------------------------------------------------------- */
  var header = document.getElementById("siteHeader");
  function updateHeaderOnScroll() {
    if (window.scrollY > 24) {
      header.classList.add("is-scrolled");
    } else {
      header.classList.remove("is-scrolled");
    }
  }
  updateHeaderOnScroll();
  window.addEventListener("scroll", updateHeaderOnScroll, { passive: true });

  /* ----------------------------------------------------------------------
     Menu mobile
     ---------------------------------------------------------------------- */
  var menuToggle = document.getElementById("menuToggle");
  var mobileNav = document.getElementById("mobileNav");

  function closeMobileMenu() {
    mobileNav.classList.remove("is-open");
    header.classList.remove("is-menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Abrir menu");
  }

  function toggleMobileMenu() {
    var isOpen = mobileNav.classList.toggle("is-open");
    header.classList.toggle("is-menu-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
  }

  menuToggle.addEventListener("click", toggleMobileMenu);
  mobileNav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", closeMobileMenu);
  });

  /* ----------------------------------------------------------------------
     Revelação suave ao rolar (respeita prefers-reduced-motion via CSS)
     ---------------------------------------------------------------------- */
  var revealTargets = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealTargets.length) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    revealTargets.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    revealTargets.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  /* ----------------------------------------------------------------------
     Carrossel de resultados (mobile)
     ---------------------------------------------------------------------- */
  var track = document.getElementById("resultsTrack");
  var counter = document.getElementById("resultsCounter");
  var prevBtn = document.getElementById("resultsPrev");
  var nextBtn = document.getElementById("resultsNext");

  if (track && counter && prevBtn && nextBtn) {
    var total = track.children.length;

    function currentIndex() {
      var cardWidth = track.children[0].getBoundingClientRect().width + 16;
      return Math.round(track.scrollLeft / cardWidth);
    }

    function updateCounter() {
      var index = Math.min(Math.max(currentIndex(), 0), total - 1);
      counter.textContent = (index + 1) + " de " + total;
    }

    function scrollToIndex(index) {
      var clamped = Math.min(Math.max(index, 0), total - 1);
      var cardWidth = track.children[0].getBoundingClientRect().width + 16;
      track.scrollTo({ left: clamped * cardWidth, behavior: "smooth" });
    }

    prevBtn.addEventListener("click", function () {
      scrollToIndex(currentIndex() - 1);
    });
    nextBtn.addEventListener("click", function () {
      scrollToIndex(currentIndex() + 1);
    });
    track.addEventListener(
      "scroll",
      function () {
        window.requestAnimationFrame(updateCounter);
      },
      { passive: true }
    );
    updateCounter();
  }

  /* ----------------------------------------------------------------------
     Fallback de imagem: se assets/foto-larissa.jpg não existir, evita
     quebra visual (mantém o overlay do hero e o card "Sobre" utilizáveis).
     ---------------------------------------------------------------------- */
  document.querySelectorAll("img[data-fallback-hide]").forEach(function (img) {
    img.addEventListener("error", function () {
      img.style.display = "none";
    });
  });
})();
