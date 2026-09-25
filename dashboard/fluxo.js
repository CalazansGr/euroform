(function () {
  if (!window.EF) return;
  var E = EF, $ = E.$, db = E.db, brl = E.brl, r2 = E.r2, esc = E.esc;
  var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var CHAVE = 'saldo_inicial';

  function meses(ini, fim) { var a = [], m = ini.slice(0, 7), ultimo = fim.slice(0, 7); while (m <= ultimo) { a.push(m); m = E.mesMais(m, 1); } return a; }
  function soma(arr, f) { return r2(arr.reduce(function (a, x) { return a + f(x); }, 0)); }

  function carregarFluxo() {
    var dias = parseInt($('fx-horizonte').value, 10), hoje = E.hoje(), fim = E.somaDias(hoje, dias);
    var ms = meses(hoje, fim);
    $('fx-msg').hidden = true;
    return Promise.all(ms.map(function (m) { return E.garantirMes(m).catch(function () {}); })).then(function () {
      return Promise.all([
        db.from('recebimentos').select('*, servicos(clientes(nome))').eq('pago', false).lte('vencimento', fim),
        db.from('despesas').select('*').eq('pago', false).lte('vencimento', fim),
        db.from('recorrentes').select('*').eq('ativo', true),
        db.from('configuracoes').select('valor').eq('chave', CHAVE).maybeSingle()
      ]);
    }).then(function (r) {
      for (var i = 0; i < 3; i++) if (r[i].error) { alert('Erro ao carregar fluxo: ' + r[i].error.message); return; }
      if (r[3].error) { $('fx-msg').textContent = 'Para guardar o saldo em caixa, falta criar a tabela "configuracoes" no Supabase (peça o SQL ao Claude). Por enquanto o saldo vale só nesta tela.'; $('fx-msg').hidden = false; }
      else if (r[3].data && document.activeElement !== $('fx-saldo')) { $('fx-saldo').value = r[3].data.valor; }

      var ev = [];
      r[0].data.forEach(function (x) {
        ev.push({ dia: x.vencimento < hoje ? hoje : x.vencimento, orig: x.vencimento, in: Number(x.valor), out: 0,
          txt: 'Receber de ' + (x.servicos && x.servicos.clientes ? x.servicos.clientes.nome : 'cliente') });
      });
      r[1].data.forEach(function (x) {
        ev.push({ dia: x.vencimento < hoje ? hoje : x.vencimento, orig: x.vencimento, in: 0, out: Number(x.valor), txt: 'Pagar: ' + x.descricao });
      });
      // meses além do próximo: projeta fixas que ainda não foram geradas
      var limiteGerado = E.mesMais(E.mesAtual(), 1);
      ms.filter(function (m) { return m > limiteGerado; }).forEach(function (m) {
        r[2].data.forEach(function (rec) {
          var d = E.dataNoMes(m, rec.dia_vencimento);
          if (d >= hoje && d <= fim) ev.push({ dia: d, orig: d, in: 0, out: Number(rec.valor), txt: 'Pagar: ' + rec.descricao, virt: true });
        });
      });

      var saldo0 = parseFloat($('fx-saldo').value) || 0;
      var porDia = {};
      ev.forEach(function (e) { (porDia[e.dia] = porDia[e.dia] || []).push(e); });

      // percorre todos os dias do período
      var saldo = saldo0, minimo = { v: saldo0, dia: hoje }, primeiroNeg = null, dd = {}, linhas = [];
      for (var i = 0; i <= dias; i++) {
        var dia = E.somaDias(hoje, i), es = porDia[dia] || [];
        var ent = soma(es, function (e) { return e.in; }), sai = soma(es, function (e) { return e.out; });
        saldo = r2(saldo + ent - sai);
        dd[dia] = { ent: ent, sai: sai, saldo: saldo };
        if (saldo < minimo.v) minimo = { v: saldo, dia: dia };
        if (saldo < 0 && !primeiroNeg) primeiroNeg = dia;
        if (es.length) linhas.push({ dia: dia, es: es, ent: ent, sai: sai, saldo: saldo });
      }

      var totEnt = soma(ev, function (e) { return e.in; }), totSai = soma(ev, function (e) { return e.out; });
      $('fx-alerta').hidden = false;
      $('fx-alerta').className = 'alerta ' + (primeiroNeg ? 'ruim' : 'bom');
      $('fx-alerta').textContent = primeiroNeg
        ? '⚠ Atenção: o caixa fica negativo a partir de ' + E.dataBR(primeiroNeg) + '. Menor saldo previsto: ' + brl(minimo.v) + ' em ' + E.dataBR(minimo.dia) + '.'
        : '✔ O caixa não fica negativo nos próximos ' + dias + ' dias. Menor saldo previsto: ' + brl(minimo.v) + '.';
      $('fx-cards').innerHTML =
        '<div class="card"><span>Saldo em caixa hoje</span><strong>' + brl(saldo0) + '</strong></div>' +
        '<div class="card"><span>A receber no período</span><strong class="pos">' + brl(totEnt) + '</strong></div>' +
        '<div class="card"><span>A pagar no período</span><strong class="neg">' + brl(totSai) + '</strong></div>' +
        '<div class="card dest"><span>Saldo previsto no fim</span><strong class="' + (saldo >= 0 ? 'pos' : 'neg') + '">' + brl(saldo) + '</strong></div>';

      // calendários
      $('fx-calendarios').innerHTML = ms.map(function (m) {
        var p = m.split('-').map(Number), primeiro = new Date(p[0], p[1] - 1, 1).getDay(), n = new Date(p[0], p[1], 0).getDate();
        var h = '<div class="cal-mes"><h3>' + MESES[p[1] - 1] + ' ' + p[0] + '</h3><div class="cal">' +
          ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(function (x) { return '<div class="dow">' + x + '</div>'; }).join('');
        for (var k = 0; k < primeiro; k++) h += '<div class="dia fora"></div>';
        for (var d = 1; d <= n; d++) {
          var iso = m + '-' + String(d).padStart(2, '0'), x = dd[iso];
          h += '<div class="dia' + (x && x.saldo < 0 ? ' neg' : '') + (iso === hoje ? ' hoje' : '') + '"><b>' + d + '</b>' +
            (x && x.ent ? '<span class="in">+' + Math.round(x.ent).toLocaleString('pt-BR') + '</span>' : '') +
            (x && x.sai ? '<span class="out">−' + Math.round(x.sai).toLocaleString('pt-BR') + '</span>' : '') + '</div>';
        }
        return h + '</div></div>';
      }).join('');

      // lista dia a dia
      $('fx-vazio').hidden = linhas.length > 0;
      $('fx-lista').innerHTML = linhas.map(function (l) {
        var mov = l.es.map(function (e) {
          return '<div class="' + (e.virt ? 'virt' : '') + '">' + (e.in ? '＋ ' : '－ ') + esc(e.txt) + (e.orig < hoje ? ' <small>(atrasado, vencia ' + E.dataBR(e.orig) + ')</small>' : '') + (e.virt ? ' <small>(previsto)</small>' : '') + '</div>';
        }).join('');
        return '<tr class="' + (l.saldo < 0 ? 'neg-linha' : '') + '"><td>' + E.dataBR(l.dia) + '</td><td style="white-space:normal">' + mov + '</td><td class="num pos">' + (l.ent ? brl(l.ent) : '') +
          '</td><td class="num neg">' + (l.sai ? brl(l.sai) : '') + '</td><td class="num ' + (l.saldo >= 0 ? 'pos' : 'neg') + '">' + brl(l.saldo) + '</td></tr>';
      }).join('');
    });
  }

  if (window.innerWidth <= 640) $('fx-cal-det').open = false;
  var timer;
  $('fx-saldo').addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      db.from('configuracoes').upsert({ chave: CHAVE, valor: parseFloat($('fx-saldo').value) || 0 }).then(function () { carregarFluxo(); });
    }, 700);
  });
  $('fx-horizonte').addEventListener('change', carregarFluxo);
  E.abas.fluxo = carregarFluxo;
})();
