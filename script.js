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
      el.style.display = "none";
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
     Fallback de imagem: se a foto de fundo do hero não existir, evita
     quebra visual (mantém o overlay do hero utilizável).
     ---------------------------------------------------------------------- */
  document.querySelectorAll("img[data-fallback-hide]").forEach(function (img) {
    img.addEventListener("error", function () {
      img.style.display = "none";
    });
  });

  /* ----------------------------------------------------------------------
     Parallax sutil no hero (respeita prefers-reduced-motion)
     ---------------------------------------------------------------------- */
  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var parallaxTargets = document.querySelectorAll("[data-parallax]");

  if (!prefersReducedMotion && parallaxTargets.length) {
    var ticking = false;

    function updateParallax() {
      var vh = window.innerHeight;
      parallaxTargets.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > vh + 200) return;
        var factor = parseFloat(el.getAttribute("data-parallax")) || 0.12;
        var center = rect.top + rect.height / 2 - vh / 2;
        el.style.transform = "translate3d(0, " + (-center * factor).toFixed(2) + "px, 0)";
      });
      ticking = false;
    }

    function requestParallaxUpdate() {
      if (!ticking) {
        window.requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }

    updateParallax();
    window.addEventListener("scroll", requestParallaxUpdate, { passive: true });
    window.addEventListener("resize", requestParallaxUpdate);
  }

  /* ----------------------------------------------------------------------
     Lightbox de resultados (dialog nativo — foco preso e Esc já vêm do
     navegador via showModal(); aqui só populamos conteúdo, navegação e
     devolução de foco)
     ---------------------------------------------------------------------- */
  var lightbox = document.getElementById("resultsLightbox");
  var resultButtons = Array.prototype.slice.call(document.querySelectorAll(".result-frame"));

  if (lightbox && resultButtons.length && typeof lightbox.showModal === "function") {
    var lightboxImg = lightbox.querySelector(".lightbox-img");
    var lightboxNum = lightbox.querySelector(".lightbox-num");
    var lightboxCaption = lightbox.querySelector(".lightbox-caption");
    var closeBtn = lightbox.querySelector(".lightbox-close");
    var prevBtn = lightbox.querySelector(".lightbox-prev");
    var nextBtn = lightbox.querySelector(".lightbox-next");
    var currentIndex = 0;
    var lastTrigger = null;

    function renderLightbox(index) {
      currentIndex = (index + resultButtons.length) % resultButtons.length;
      var btn = resultButtons[currentIndex];
      var img = btn.querySelector("img");
      var captionEl = btn.closest(".result-figure").querySelector(".result-caption");
      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt;
      lightboxNum.textContent = String(currentIndex + 1).length < 2 ? "0" + (currentIndex + 1) : String(currentIndex + 1);
      lightboxCaption.textContent = captionEl ? captionEl.textContent : "";
    }

    function openLightbox(index, trigger) {
      lastTrigger = trigger || null;
      renderLightbox(index);
      lightbox.showModal();
      document.body.style.overflow = "hidden";
    }

    // Cleanup fica só aqui dentro (não depende do evento "close" do <dialog>, que em
    // alguns ambientes não dispara de forma confiável): todo caminho de fechamento
    // (botão, clique fora, Esc) chama closeLightbox() diretamente.
    function closeLightbox() {
      if (lightbox.open) lightbox.close();
      document.body.style.overflow = "";
      if (lastTrigger) {
        lastTrigger.focus();
        lastTrigger = null;
      }
    }

    resultButtons.forEach(function (btn, index) {
      btn.addEventListener("click", function () {
        openLightbox(index, btn);
      });
    });

    closeBtn.addEventListener("click", closeLightbox);
    prevBtn.addEventListener("click", function () {
      renderLightbox(currentIndex - 1);
    });
    nextBtn.addEventListener("click", function () {
      renderLightbox(currentIndex + 1);
    });

    // Clique fora do conteúdo (no próprio elemento dialog, fora da figure) fecha.
    lightbox.addEventListener("click", function (event) {
      if (event.target === lightbox) closeLightbox();
    });

    lightbox.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        renderLightbox(currentIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        renderLightbox(currentIndex + 1);
      } else if (event.key === "Escape") {
        // Fecha explicitamente em vez de depender só do comportamento nativo do
        // <dialog>, para garantir que o cleanup (scroll, foco) sempre rode.
        event.preventDefault();
        closeLightbox();
      }
    });
  }
})();
