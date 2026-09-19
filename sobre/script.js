(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function formatar(el, valor) {
    // "Desde 2015" fica sem separador de milhar; os demais usam ponto (1.934)
    el.textContent = el.hasAttribute('data-sem-milhar') ? String(valor) : valor.toLocaleString('pt-BR');
  }

  // ===== Contadores animados =====
  var contadores = document.querySelectorAll('.contador');
  if (contadores.length) {
    var animar = function (el) {
      var alvo = parseInt(el.getAttribute('data-alvo'), 10) || 0;
      if (prefersReducedMotion) { formatar(el, alvo); return; }

      var duracao = 1600;
      var inicio = null;
      function passo(t) {
        if (!inicio) inicio = t;
        var p = Math.min((t - inicio) / duracao, 1);
        var suave = 1 - Math.pow(1 - p, 2);
        formatar(el, Math.round(suave * alvo));
        if (p < 1) window.requestAnimationFrame(passo);
      }
      window.requestAnimationFrame(passo);
    };

    if ('IntersectionObserver' in window && !prefersReducedMotion) {
      var observer = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { animar(entry.target); obs.unobserve(entry.target); }
        });
      }, { threshold: 0.4 });
      contadores.forEach(function (el) { observer.observe(el); });
    } else {
      contadores.forEach(function (el) { formatar(el, parseInt(el.getAttribute('data-alvo'), 10) || 0); });
    }
  }

  // ===== Menu mobile =====
  var botaoMenu = document.querySelector('.novo-menu-btn');
  var menuMobile = document.querySelector('.novo-nav-mobile');
  if (botaoMenu && menuMobile) {
    botaoMenu.addEventListener('click', function () {
      var aberto = menuMobile.classList.toggle('aberto');
      botaoMenu.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    });
  }
})();
