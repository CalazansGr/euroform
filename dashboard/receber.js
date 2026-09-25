(function () {
  if (!window.EF) return;
  var E = EF, $ = E.$, db = E.db, brl = E.brl, r2 = E.r2, esc = E.esc;
  var linhas = [];
  var fixos = {};   // parcelas alteradas agora: continuam na tela até mudar o filtro (não "somem" ao clicar Sim)

  // Uma linha por parcela, a partir das OS já carregadas (cada OS traz seus recebimentos).
  function montar() {
    linhas = [];
    E.estado.servicos.forEach(function (s) {
      var rec = (s.recebimentos || []).slice().sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0; });
      rec.forEach(function (p, i) { linhas.push({ p: p, s: s, n: i + 1, de: rec.length }); });
    });
  }

  function diasEntre(a, b) {
    var x = a.split('-').map(Number), y = b.split('-').map(Number);
    return Math.round((Date.UTC(y[0], y[1] - 1, y[2]) - Date.UTC(x[0], x[1] - 1, x[2])) / 864e5);
  }

  function render() {
    var q = $('rc-busca').value.trim().toLowerCase(), sit = $('rc-sit').value, mes = $('rc-mes').value, hoje = E.hoje();
    var escopo = linhas.filter(function (l) {
      if (mes && l.p.vencimento.slice(0, 7) !== mes) return false;
      if (q && (l.s.clientes ? l.s.clientes.nome : '').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });

    var t = { ab: 0, nab: 0, at: 0, nat: 0, pg: 0, npg: 0 };
    escopo.forEach(function (l) {
      var v = Number(l.p.valor);
      if (l.p.pago) { t.pg += v; t.npg++; }
      else { t.ab += v; t.nab++; if (l.p.vencimento < hoje) { t.at += v; t.nat++; } }
    });
    function qtd(n) { return n ? n + (n > 1 ? ' parcelas' : ' parcela') : 'nenhuma parcela'; }
    $('rc-aberto').textContent = brl(r2(t.ab)); $('rc-aberto-n').textContent = qtd(t.nab);
    $('rc-atraso').textContent = brl(r2(t.at)); $('rc-atraso-n').textContent = qtd(t.nat);
    $('rc-pago').textContent = brl(r2(t.pg)); $('rc-pago-n').textContent = qtd(t.npg);

    var itens = escopo.filter(function (l) {
      if (fixos[l.p.id]) return true;
      if (sit === 'aberto') return !l.p.pago;
      if (sit === 'atraso') return !l.p.pago && l.p.vencimento < hoje;
      if (sit === 'pago') return l.p.pago;
      return true;
    });
    itens.sort(function (a, b) {
      var ka = sit === 'pago' ? (b.p.pago_em || b.p.vencimento) : a.p.vencimento, kb = sit === 'pago' ? (a.p.pago_em || a.p.vencimento) : b.p.vencimento;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

    $('rc-vazio').hidden = itens.length > 0;
    $('rc-lista').innerHTML = itens.map(function (l) {
      var p = l.p, s = l.s, atrasada = !p.pago && p.vencimento < hoje;
      var tags = (s.status === 'pendente' ? ' <span class="tag pendente">Serviço pendente</span>' : '') +
        (s.com_nf && !s.nf_emitida_em ? ' <span class="tag alerta-tag">NF a emitir</span>' : '');
      var situacao = atrasada ? '<small class="neg">atrasada há ' + diasEntre(p.vencimento, hoje) + ' dia(s)</small>'
        : (!p.pago && p.vencimento === hoje ? '<small class="aviso-txt">vence hoje</small>' : '');
      return '<tr data-id="' + p.id + '" class="' + (atrasada ? 'rc-atrasada' : '') + (p.pago ? ' rc-paga' : '') + '">' +
        '<td class="rc-cli"><button type="button" class="link rc-os" data-os="' + s.id + '" title="Abrir a OS">' + esc(s.clientes ? s.clientes.nome : '—') + '</button>' +
          '<small>' + esc(E.CATS[s.categoria] || s.categoria) + ' · ' + E.dataBR(s.data_servico) + tags + '</small></td>' +
        '<td>' + l.n + ' de ' + l.de + '</td>' +
        '<td class="rc-vcel"><input type="date" class="rc-venc" value="' + p.vencimento + '" aria-label="Vencimento">' + situacao + '</td>' +
        '<td class="num"><strong>' + brl(Number(p.valor)) + '</strong></td>' +
        '<td><div class="sn" role="group" aria-label="Recebido?"><button type="button" class="sn-nao' + (p.pago ? '' : ' on') + '">Não</button><button type="button" class="sn-sim' + (p.pago ? ' on' : '') + '">Sim</button></div></td>' +
        '<td>' + (p.pago ? '<input type="date" class="rc-em" value="' + (p.pago_em || '') + '" aria-label="Recebido em">' : '<span class="rc-traco">—</span>') + '</td></tr>';
    }).join('');
  }

  function achar(tr) { var id = tr.dataset.id; return linhas.find(function (l) { return l.p.id === id; }); }

  // Salva na hora (como numa planilha). Em caso de erro, recarrega do banco.
  function salvar(l, campos) {
    var antes = {};
    Object.keys(campos).forEach(function (k) { antes[k] = l.p[k]; });
    Object.assign(l.p, campos);
    fixos[l.p.id] = true;
    render();
    db.from('recebimentos').update(campos).eq('id', l.p.id).then(function (r) {
      if (r.error) {
        Object.assign(l.p, antes); render();
        alert('Não foi possível salvar: ' + r.error.message);
      }
    });
  }

  $('rc-lista').addEventListener('click', function (ev) {
    var os = ev.target.closest('.rc-os');
    if (os) { var s = E.estado.servicos.find(function (x) { return x.id === os.dataset.os; }); if (s) E.abrirOS(s); return; }
    var tr = ev.target.closest('tr'); if (!tr) return;
    var l = achar(tr); if (!l) return;
    if (ev.target.classList.contains('sn-sim') && !l.p.pago) salvar(l, { pago: true, pago_em: E.hoje() });
    if (ev.target.classList.contains('sn-nao') && l.p.pago) salvar(l, { pago: false, pago_em: null });
  });
  $('rc-lista').addEventListener('change', function (ev) {
    var tr = ev.target.closest('tr'); if (!tr) return;
    var l = achar(tr); if (!l) return;
    if (ev.target.classList.contains('rc-venc')) {
      if (!ev.target.value) { ev.target.value = l.p.vencimento; return; }
      salvar(l, { vencimento: ev.target.value });
    }
    if (ev.target.classList.contains('rc-em')) salvar(l, { pago_em: ev.target.value || E.hoje() });
  });
  ['rc-busca', 'rc-sit', 'rc-mes'].forEach(function (id) {
    $(id).addEventListener('input', function () { fixos = {}; render(); });
  });

  E.aoCarregarOS = function () { montar(); if (!$('aba-receber').hidden) render(); };
  E.abas.receber = function () { fixos = {}; montar(); render(); E.carregarOS(); };
})();
