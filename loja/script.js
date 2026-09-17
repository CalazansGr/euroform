(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ===== Contadores animados =====
  var contadores = document.querySelectorAll('.contador');
  if (contadores.length) {
    var animarContador = function (el) {
      var alvo = parseInt(el.getAttribute('data-alvo'), 10) || 0;

      if (prefersReducedMotion) {
        el.textContent = alvo;
        return;
      }

      var duracao = 1600;
      var inicio = null;

      function passo(timestamp) {
        if (!inicio) inicio = timestamp;
        var progresso = Math.min((timestamp - inicio) / duracao, 1);
        var progressoSuave = 1 - Math.pow(1 - progresso, 2); // easeOutQuad
        el.textContent = Math.round(progressoSuave * alvo);
        if (progresso < 1) {
          window.requestAnimationFrame(passo);
        }
      }
      window.requestAnimationFrame(passo);
    };

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animarContador(entry.target);
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4 });

      contadores.forEach(function (el) { observer.observe(el); });
    } else {
      contadores.forEach(function (el) { animarContador(el); });
    }
  }

  // ===== Busca de produtos =====
  var campoBusca = document.getElementById('busca-produto-input');
  var cartoes = document.querySelectorAll('.produto-card');
  if (campoBusca && cartoes.length) {
    campoBusca.addEventListener('input', function () {
      var termo = campoBusca.value.trim().toLowerCase();
      var algumVisivel = false;

      cartoes.forEach(function (cartao) {
        var nome = cartao.querySelector('.produto-nome');
        var texto = nome ? nome.textContent.toLowerCase() : '';
        var corresponde = texto.indexOf(termo) !== -1;
        cartao.style.display = corresponde ? '' : 'none';
        if (corresponde) algumVisivel = true;
      });

      var semResultado = document.querySelector('.produto-sem-resultado');
      if (semResultado) semResultado.style.display = algumVisivel ? 'none' : 'block';
    });
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
