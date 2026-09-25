// Base do painel: conexão, utilidades, login, abas e o editor de parcelas (usado em serviços e despesas).
(function () {
  const cfg = window.EUROFORM_CONFIG;
  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = (id) => document.getElementById(id);

  // ---------- utilidades ----------
  const r2 = (n) => Math.round(n * 100) / 100;
  const num = (el) => { const v = parseFloat((typeof el === 'string' ? $(el) : el).value); return isNaN(v) ? 0 : v; };
  const brl = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dataBR = (iso) => iso ? iso.split('-').reverse().join('/') : '';
  const diaMes = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  const hoje = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const mesAtual = () => hoje().slice(0, 7);
  const somaDias = (iso, dias) => { const p = iso.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + dias)).toISOString().slice(0, 10); };
  const mesMais = (mes, n) => { const p = mes.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1 + n, 1)).toISOString().slice(0, 7); };
  const fimDoMes = (mes) => { const p = mes.split('-').map(Number); return mes + '-' + String(new Date(p[0], p[1], 0).getDate()).padStart(2, '0'); };
  const soma = (lista, f) => r2(lista.reduce((t, x) => t + Number(f ? f(x) : x.valor), 0));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const erro = (el, msg) => { el.textContent = msg || ''; el.hidden = !msg; };

  // Confirmação em 2 cliques (sem pop-up do navegador).
  function confirmar(btn, texto, fazer) {
    if (btn.dataset.armado) { clearTimeout(btn._t); delete btn.dataset.armado; btn.textContent = btn.dataset.rotulo; fazer(); return; }
    btn.dataset.rotulo = btn.textContent; btn.dataset.armado = '1'; btn.textContent = texto;
    btn._t = setTimeout(() => { delete btn.dataset.armado; btn.textContent = btn.dataset.rotulo; }, 4000);
  }

  // Botão Não/Sim (estilo planilha).
  function simNao(pago, attrs) {
    return `<span class="sn" ${attrs || ''}><button type="button" class="sn-nao${pago ? '' : ' on'}">Não</button><button type="button" class="sn-sim${pago ? ' on' : ''}">Sim</button></span>`;
  }

  const App = { db, $, r2, num, brl, dataBR, diaMes, hoje, mesAtual, somaDias, mesMais, fimDoMes, soma, esc, erro, confirmar, simNao, abas: {} };
  window.App = App;

  // ---------- abas ----------
  document.querySelectorAll('.aba').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.aba)));
  function abrirAba(nome) {
    document.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === nome));
    document.querySelectorAll('main.pagina').forEach((m) => { m.hidden = m.id !== 'aba-' + nome; });
    if (App.abas[nome]) App.abas[nome]();
  }
  App.abaAtual = () => document.querySelector('.aba.ativa').dataset.aba;

  // ---------- pop-ups ----------
  document.querySelectorAll('dialog').forEach((dlg) => {
    dlg.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    let fora = false;
    dlg.addEventListener('mousedown', (ev) => { fora = ev.target === dlg; });
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg && fora) dlg.close(); });
  });

  // ---------- login ----------
  let logado = false;
  function mostrar(sessao) {
    $('tela-login').hidden = !!sessao;
    $('app').hidden = !sessao;
    if (sessao && !logado) { logado = true; $('usuario').textContent = sessao.user.email; abrirAba('painel'); }
    if (!sessao) logado = false;
  }
  // espera servicos.js e despesas.js carregarem antes de abrir a primeira aba
  const pronto = new Promise((ok) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', ok) : ok()));
  db.auth.getSession().then((r) => pronto.then(() => mostrar(r.data.session)));
  db.auth.onAuthStateChange((_e, s) => pronto.then(() => mostrar(s)));
  $('form-login').addEventListener('submit', (ev) => {
    ev.preventDefault(); erro($('erro-login'));
    db.auth.signInWithPassword({ email: $('email').value.trim(), password: $('senha').value })
      .then((r) => { if (r.error) erro($('erro-login'), 'E-mail ou senha incorretos.'); });
  });
  $('btn-sair').addEventListener('click', () => db.auth.signOut());

  // ---------- editor de parcelas ----------
  // Monta os botões de prazo (à vista, 30, 30/60...) e as linhas editáveis (data, valor, pago?).
  // Enquanto a pessoa não mexe numa parcela, as parcelas se refazem sozinhas quando muda o valor, a data ou o prazo.
  App.editorParcelas = function (el, op) {
    el.innerHTML =
      '<div class="prazos"><span>Prazo:</span>' +
      ['0|À vista', '30|30 dias', '30/60|30/60', '30/60/90|30/60/90'].map((p) => { const [v, t] = p.split('|'); return `<button type="button" class="sec" data-prazo="${v}">${t}</button>`; }).join('') +
      '<label class="prazo-livre"><span>ou dias</span><input class="ed-prazos" placeholder="ex.: 15/45" inputmode="numeric"></label></div>' +
      '<div class="parcelas"></div>' +
      '<button type="button" class="sec mini ed-add">+ Adicionar parcela</button>' +
      '<p class="aviso ed-aviso" hidden></p>';
    const caixa = el.querySelector('.parcelas'), campoPrazo = el.querySelector('.ed-prazos'), aviso = el.querySelector('.ed-aviso');
    let manual = false;

    function linha(p) {
      const d = document.createElement('div');
      d.className = 'parcela' + (p.pago ? ' paga' : '');
      d.innerHTML = '<input type="date" class="p-venc" required aria-label="Vencimento"><input type="number" class="p-valor" min="0" step="0.01" inputmode="decimal" required aria-label="Valor">' +
        `<label class="p-lbl"><input type="checkbox" class="p-pago"> ${op.rotulo}</label><input type="date" class="p-em" aria-label="${op.rotulo} em">` +
        '<button type="button" class="perigo mini p-del" aria-label="Remover parcela">✕</button>';
      d.querySelector('.p-venc').value = p.vencimento || '';
      d.querySelector('.p-valor').value = p.valor;
      d.querySelector('.p-pago').checked = !!p.pago;
      d.querySelector('.p-em').value = p.pago ? (p.pago_em || '') : '';
      return d;
    }
    function ler() {
      return [...caixa.children].map((d) => {
        const pago = d.querySelector('.p-pago').checked;
        return { vencimento: d.querySelector('.p-venc').value, valor: r2(num(d.querySelector('.p-valor'))), pago, pago_em: pago ? (d.querySelector('.p-em').value || hoje()) : null };
      });
    }
    function conferir() {
      const ps = ler(), total = r2(op.total()), s = soma(ps);
      aviso.hidden = !ps.length || s === total;
      aviso.textContent = `As parcelas somam ${brl(s)}, mas o valor total é ${brl(total)}.`;
      el.querySelectorAll('[data-prazo]').forEach((b) => b.classList.toggle('on', !manual && b.dataset.prazo === campoPrazo.value));
    }
    function gerar() {
      const dias = (campoPrazo.value || '0').split(/[\/,\s-]+/).filter(Boolean).map(Number).filter((n) => !isNaN(n) && n >= 0);
      const lista = dias.length ? dias : [0], total = r2(op.total()), base = op.base() || hoje(), antigas = ler();
      const parte = r2(Math.floor(total / lista.length * 100) / 100);
      caixa.innerHTML = '';
      let acumulado = 0;
      lista.forEach((d, i) => {
        const v = i === lista.length - 1 ? r2(total - acumulado) : parte;   // centavos que sobram vão na última
        acumulado = r2(acumulado + v);
        const a = antigas[i] || {};
        caixa.appendChild(linha({ vencimento: somaDias(base, d), valor: v, pago: a.pago, pago_em: a.pago_em }));
      });
      manual = false; conferir();
    }

    el.querySelectorAll('[data-prazo]').forEach((b) => b.addEventListener('click', () => { campoPrazo.value = b.dataset.prazo; gerar(); }));
    campoPrazo.addEventListener('input', gerar);
    el.querySelector('.ed-add').addEventListener('click', () => {
      const ps = ler(), ult = ps.length ? ps[ps.length - 1].vencimento : (op.base() || hoje());
      caixa.appendChild(linha({ vencimento: somaDias(ult, 30), valor: 0 }));
      manual = true; conferir();
    });
    caixa.addEventListener('input', () => { manual = true; conferir(); });
    caixa.addEventListener('change', (ev) => {
      if (!ev.target.classList.contains('p-pago')) return;
      const d = ev.target.closest('.parcela'), em = d.querySelector('.p-em');
      d.classList.toggle('paga', ev.target.checked);
      em.value = ev.target.checked ? (em.value || hoje()) : '';
    });
    caixa.addEventListener('click', (ev) => {
      if (!ev.target.classList.contains('p-del')) return;
      ev.target.closest('.parcela').remove(); manual = true; conferir();
    });

    return {
      novo(prazo) { campoPrazo.value = prazo || '0'; gerar(); },
      carregar(ps) {
        campoPrazo.value = ''; caixa.innerHTML = '';
        ps.slice().sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1)).forEach((p) => caixa.appendChild(linha(p)));
        manual = true; conferir();
      },
      // chamado quando muda o valor total ou a data: refaz se ninguém mexeu nas parcelas à mão
      atualizar() { if (!manual) gerar(); else conferir(); },
      ler,
      validar() {
        const ps = ler(), total = r2(op.total());
        if (!ps.length) return 'Defina pelo menos uma parcela.';
        if (ps.some((p) => !p.vencimento)) return 'Toda parcela precisa de data.';
        if (soma(ps) !== total) return `As parcelas somam ${brl(soma(ps))}, mas o valor total é ${brl(total)}. Ajuste os valores ou clique num prazo para refazer.`;
        return '';
      }
    };
  };

  // Salva as parcelas de um serviço ou despesa: apaga as antigas e grava as da tela.
  App.salvarParcelas = function (campo, id, ps) {
    return db.from('parcelas').delete().eq(campo, id).then((r) => {
      if (r.error) throw r.error;
      return db.from('parcelas').insert(ps.map((p) => ({ [campo]: id, vencimento: p.vencimento, valor: p.valor, pago: p.pago, pago_em: p.pago_em })));
    }).then((r) => { if (r.error) throw r.error; });
  };

  // Marca uma parcela como paga/recebida (Sim) ou não (Não).
  App.marcarParcela = function (p, pago) {
    const campos = { pago, pago_em: pago ? hoje() : null };
    const antes = { pago: p.pago, pago_em: p.pago_em };
    Object.assign(p, campos);
    return db.from('parcelas').update(campos).eq('id', p.id).then((r) => {
      if (r.error) { Object.assign(p, antes); alert('Não foi possível salvar: ' + r.error.message); }
    });
  };
})();
