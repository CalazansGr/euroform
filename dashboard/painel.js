(function () {
  if (!window.EF) return;
  var E = EF, $ = E.$, db = E.db, brl = E.brl, r2 = E.r2, esc = E.esc;

  function soma(arr, f) { return r2(arr.reduce(function (a, x) { return a + Number(f(x) || 0); }, 0)); }
  function card(rot, val, sub, dest, cls) {
    return '<div class="card' + (dest ? ' dest' : '') + '"><span>' + rot + '</span><strong class="' + (cls || '') + '">' + brl(val) + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  }

  function carregarPainel() {
    var mes = $('p-mes').value || E.mesAtual(), f = E.faixa(mes), hoje = E.hoje(), lim = E.somaDias(hoje, 7);
    return E.garantirMes(mes).catch(function () {}).then(function () {
      return Promise.all([
        db.from('servicos').select('valor_bruto,com_nf,custo_total,imposto').gte('data_servico', f[0]).lte('data_servico', f[1]),
        db.from('despesas').select('tipo,valor,pago').gte('vencimento', f[0]).lte('vencimento', f[1]),
        db.from('recebimentos').select('*, servicos(clientes(nome))').eq('pago', false).lte('vencimento', lim).order('vencimento'),
        db.from('despesas').select('*').eq('pago', false).lte('vencimento', lim).order('vencimento'),
        db.from('recebimentos').select('*, servicos(condicao_pagamento, detalhes, clientes(nome))').gte('vencimento', f[0]).lte('vencimento', f[1]).order('vencimento'),
        db.from('recebimentos').select('vencimento,valor,pago').gte('vencimento', E.mesAtual() + '-01').lte('vencimento', E.faixa(E.mesMais(E.mesAtual(), 5))[1])
      ]);
    }).then(function (r) {
      for (var i = 0; i < 6; i++) if (r[i].error) { alert('Erro ao carregar painel: ' + r[i].error.message); return; }
      var os = r[0].data, desp = r[1].data;
      var comNF = soma(os.filter(function (s) { return s.com_nf; }), function (s) { return s.valor_bruto; });
      var semNF = soma(os.filter(function (s) { return !s.com_nf; }), function (s) { return s.valor_bruto; });
      var custos = soma(os, function (s) { return s.custo_total; });
      var imp = soma(os, function (s) { return s.imposto; });
      var lucroOS = r2(comNF + semNF - custos - imp);
      var fixas = soma(desp.filter(function (d) { return d.tipo === 'recorrente'; }), function (d) { return d.valor; });
      var resultado = r2(lucroOS - fixas);
      $('p-cards').innerHTML =
        card('Faturado no mês', r2(comNF + semNF), 'Com NF ' + brl(comNF) + ' · Sem NF ' + brl(semNF)) +
        card('Custos diretos (serviços)', custos, 'Peças, insumos e terceiros') +
        card('Simples estimado', imp, '10,5% das NFs do mês') +
        card('Lucro dos serviços', lucroOS, 'Faturado − custos − Simples', false, lucroOS >= 0 ? 'pos' : 'neg') +
        card('Despesas fixas do mês', fixas, 'Salários, aluguel, etc.') +
        card('Lucro líquido do mês', resultado, 'Lucro dos serviços − despesas fixas', true, resultado >= 0 ? 'pos' : 'neg');

      var recMes = r[4].data, totRec = soma(recMes, function (x) { return x.valor; });
      var jaRec = soma(recMes.filter(function (x) { return x.pago; }), function (x) { return x.valor; });
      $('p-rec-cards').innerHTML = card('Total a receber no mês', totRec, recMes.length + ' parcela(s)', true) + card('Já recebido', jaRec, '', false, 'pos') + card('Falta receber', r2(totRec - jaRec), '', false, 'neg');
      $('p-rec-vazio').hidden = recMes.length > 0;
      var FORMAS = { pix: 'PIX', boleto: 'Boleto', ted: 'TED', cartao: 'Cartão', empenho: 'Empenho', dinheiro: 'Dinheiro', outro: 'Outro' };
      $('p-rec-lista').innerHTML = recMes.map(function (x) {
        var s = x.servicos || {}, cli = s.clientes ? s.clientes.nome : 'Cliente';
        var forma = (s.detalhes && FORMAS[s.detalhes.forma]) || '';
        var sit = x.pago ? '<span class="tag pago">Recebido</span>' : (x.vencimento < hoje ? '<span class="tag atraso">Atrasado</span>' : '<span class="tag">A receber</span>');
        return '<tr><td>' + E.dataBR(x.vencimento) + '</td><td>' + esc(cli) + '</td><td>' + esc((forma + ' ' + (s.condicao_pagamento || '')).trim()) + '</td><td class="num">' + brl(Number(x.valor)) + '</td><td>' + sit + '</td></tr>';
      }).join('');
      var MN = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'], hm = '';
      for (var k = 0; k < 6; k++) {
        var m = E.mesMais(E.mesAtual(), k), fm = E.faixa(m);
        var doMes = r[5].data.filter(function (x) { return x.vencimento >= fm[0] && x.vencimento <= fm[1]; });
        var t = soma(doMes, function (x) { return x.valor; });
        hm += card(MN[parseInt(m.slice(5), 10) - 1] + '/' + m.slice(0, 4), t, doMes.length ? doMes.length + ' parcela(s)' : 'nada previsto');
      }
      $('p-rec-meses').innerHTML = hm;

      $('p-receber').innerHTML = r[2].data.length ? r[2].data.map(function (x) {
        var cli = x.servicos && x.servicos.clientes ? x.servicos.clientes.nome : 'Cliente';
        return '<div class="pend' + (x.vencimento < hoje ? ' atraso' : '') + '"><div class="info"><strong>' + esc(cli) + '</strong><small>' + (x.vencimento < hoje ? 'Atrasado · ' : '') + 'vence ' + E.dataBR(x.vencimento) + '</small></div><strong>' + brl(Number(x.valor)) +
          '</strong><button type="button" data-tab="recebimentos" data-id="' + x.id + '">Recebido</button></div>';
      }).join('') : '<p class="vazio">Nada a receber nos próximos 7 dias.</p>';

      $('p-pagar').innerHTML = r[3].data.length ? r[3].data.map(function (x) {
        return '<div class="pend' + (x.vencimento < hoje ? ' atraso' : '') + '"><div class="info"><strong>' + esc(x.descricao) + '</strong><small>' + (x.vencimento < hoje ? 'Atrasada · ' : '') + 'vence ' + E.dataBR(x.vencimento) + (x.fornecedor ? ' · ' + esc(x.fornecedor) : '') + '</small></div><strong>' + brl(Number(x.valor)) +
          '</strong><button type="button" data-tab="despesas" data-id="' + x.id + '">Paga</button></div>';
      }).join('') : '<p class="vazio">Nada a pagar nos próximos 7 dias.</p>';
    });
  }

  document.getElementById('aba-painel').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-tab]'); if (!b) return;
    b.disabled = true;
    db.from(b.dataset.tab).update({ pago: true }).eq('id', b.dataset.id).then(function (r) {
      if (r.error) { alert('Erro: ' + r.error.message); b.disabled = false; return; }
      carregarPainel();
    });
  });
  $('p-mes').addEventListener('input', carregarPainel);
  E.abas.painel = function () { if (!$('p-mes').value) $('p-mes').value = E.mesAtual(); carregarPainel(); };
})();
