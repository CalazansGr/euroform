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

  // ===== Busca + filtros de produtos =====
  var campoBusca = document.getElementById('busca-produto-input');
  var cartoes = document.querySelectorAll('.produto-card');
  var chips = document.querySelectorAll('.filtro-chip');
  var resultado = document.getElementById('filtro-resultado');
  if (cartoes.length) {
    var filtroAtual = '';

    var nomeDe = function (cartao) {
      var nome = cartao.querySelector('.produto-nome');
      return nome ? nome.textContent.toLowerCase() : '';
    };

    // quantidade de modelos em cada filtro
    chips.forEach(function (chip) {
      var f = chip.getAttribute('data-filtro');
      var qtd = 0;
      cartoes.forEach(function (c) { if (nomeDe(c).indexOf(f) !== -1) qtd++; });
      var el = chip.querySelector('.filtro-qtd');
      if (el) el.textContent = qtd;
    });

    var aplicar = function () {
      var termo = campoBusca ? campoBusca.value.trim().toLowerCase() : '';
      var visiveis = 0;

      cartoes.forEach(function (cartao) {
        var texto = nomeDe(cartao);
        var corresponde = texto.indexOf(termo) !== -1 && texto.indexOf(filtroAtual) !== -1;
        cartao.style.display = corresponde ? '' : 'none';
        if (corresponde) visiveis++;
      });

      var semResultado = document.querySelector('.produto-sem-resultado');
      if (semResultado) semResultado.style.display = visiveis ? 'none' : 'block';
      if (resultado) resultado.textContent = visiveis + (visiveis === 1 ? ' cadeira encontrada' : ' cadeiras encontradas');
    };

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        filtroAtual = chip.getAttribute('data-filtro');
        chips.forEach(function (o) {
          var ativo = o === chip;
          o.classList.toggle('ativo', ativo);
          o.setAttribute('aria-pressed', ativo ? 'true' : 'false');
        });
        aplicar();
      });
    });

    if (campoBusca) campoBusca.addEventListener('input', aplicar);
    aplicar();
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
