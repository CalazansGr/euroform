(function () {
  if (!window.EF) return;
  var E = EF, $ = E.$, db = E.db, brl = E.brl, r2 = E.r2, esc = E.esc;
  var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var FORMAS = { pix: 'PIX', boleto: 'Boleto', ted: 'TED', cartao: 'Cartão', empenho: 'Empenho', dinheiro: 'Dinheiro', outro: 'Outro' };

  function soma(arr, f) { return r2(arr.reduce(function (a, x) { return a + Number(f(x) || 0); }, 0)); }
  function card(rot, val, sub, dest, cls) {
    return '<div class="card' + (dest ? ' dest' : '') + '"><span>' + rot + '</span><strong class="' + (cls || '') + '">' + brl(val) + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  }
  function nomeMes(m) { return MESES[parseInt(m.slice(5), 10) - 1] + ' de ' + m.slice(0, 4); }

  function carregarPainel() {
    var mes = $('p-mes').value || E.mesAtual(), f = E.faixa(mes), hoje = E.hoje(), lim = E.somaDias(hoje, 7);
    $('p-subtitulo').textContent = 'Resumo de ' + nomeMes(mes);
    return E.garantirMes(mes).catch(function () {}).then(function () {
      var av = E.textoAvisoSimples(); $('p-aviso').textContent = '⚠ ' + av; $('p-aviso').hidden = !av;
      return Promise.all([
        db.from('servicos').select('valor_bruto,com_nf,custo_total,imposto,status').gte('data_servico', f[0]).lte('data_servico', f[1]),
        db.from('despesas').select('tipo,valor,pago,servico_id').gte('vencimento', f[0]).lte('vencimento', f[1]),
        db.from('recebimentos').select('*, servicos(clientes(nome))').eq('pago', false).lte('vencimento', lim).order('vencimento'),
        db.from('despesas').select('*').eq('pago', false).lte('vencimento', lim).order('vencimento'),
        db.from('recebimentos').select('*, servicos(condicao_pagamento, detalhes, clientes(nome))').gte('vencimento', f[0]).lte('vencimento', f[1]).order('vencimento'),
        db.from('recebimentos').select('vencimento,valor,pago').gte('vencimento', E.mesAtual() + '-01').lte('vencimento', E.faixa(E.mesMais(E.mesAtual(), 5))[1])
      ]);
    }).then(function (r) {
      for (var i = 0; i < 6; i++) if (r[i].error) { alert('Erro ao carregar painel: ' + r[i].error.message); return; }
      // serviço pendente (ainda a fazer) não conta como faturado no mês
      var pendentes = r[0].data.filter(function (s) { return s.status === 'pendente'; });
      var os = r[0].data.filter(function (s) { return s.status !== 'pendente'; }), desp = r[1].data, recMes = r[4].data;
      var valPend = soma(pendentes, function (s) { return s.valor_bruto; });
      var comNF = soma(os.filter(function (s) { return s.com_nf; }), function (s) { return s.valor_bruto; });
      var semNF = soma(os.filter(function (s) { return !s.com_nf; }), function (s) { return s.valor_bruto; });
      var custos = soma(os, function (s) { return s.custo_total; });
      var imp = soma(os, function (s) { return s.imposto; });
      var lucroOS = r2(comNF + semNF - custos - imp);
      var fixas = soma(desp.filter(function (d) { return d.tipo === 'recorrente'; }), function (d) { return d.valor; });
      // despesa variável SEM OS (combustível, ferramenta...) desconta do lucro; COM OS não, porque o custo já está na OS
      var outras = soma(desp.filter(function (d) { return d.tipo === 'variavel' && !d.servico_id; }), function (d) { return d.valor; });
      var resultado = r2(lucroOS - fixas - outras);
      var totRec = soma(recMes, function (x) { return x.valor; });
      var faltaRec = soma(recMes.filter(function (x) { return !x.pago; }), function (x) { return x.valor; });
      var totDesp = soma(desp, function (d) { return d.valor; });
      var faltaPag = soma(desp.filter(function (d) { return !d.pago; }), function (d) { return d.valor; });

      $('p-cards').innerHTML =
        card('Faturado', r2(comNF + semNF), 'Com NF ' + brl(comNF) + '<br>Sem NF ' + brl(semNF) +
          (pendentes.length ? '<br>+ ' + brl(valPend) + ' em ' + pendentes.length + ' serviço(s) pendente(s), fora da conta' : '')) +
        card('Lucro líquido', resultado, 'Depois de custos, Simples, despesas fixas e outras despesas', true, resultado >= 0 ? 'pos' : 'neg') +
        card('Falta receber no mês', faltaRec, 'de ' + brl(totRec) + ' previstos no mês') +
        card('Falta pagar no mês', faltaPag, 'de ' + brl(totDesp) + ' em despesas no mês');

      $('p-detalhes').innerHTML =
        card('Faturado', r2(comNF + semNF)) + card('− Custos dos serviços', custos, 'Peças, insumos e terceiros') +
        card('− Simples estimado', imp, '10,5% das NFs do mês') + card('= Lucro dos serviços', lucroOS, '', false, lucroOS >= 0 ? 'pos' : 'neg') +
        card('− Despesas fixas', fixas, 'Salários, aluguel etc.') + card('− Outras despesas', outras, 'Variáveis sem OS (combustível, ferramentas...)') +
        card('= Lucro líquido', resultado, '', true, resultado >= 0 ? 'pos' : 'neg');

      // recebimentos por mês (seleção de mês)
      var hm = '';
      for (var k = 0; k < 6; k++) {
        var m = E.mesMais(E.mesAtual(), k), fm = E.faixa(m);
        var doMes = r[5].data.filter(function (x) { return x.vencimento >= fm[0] && x.vencimento <= fm[1]; });
        var t = soma(doMes, function (x) { return x.valor; });
        hm += '<button type="button" class="mes-chip' + (m === mes ? ' sel' : '') + (t ? '' : ' vazio-chip') + '" data-mes="' + m + '"><span>' + MESES[parseInt(m.slice(5), 10) - 1].slice(0, 3) + '/' + m.slice(2, 4) + '</span><strong>' + (t ? brl(t) : '—') + '</strong></button>';
      }
      $('p-rec-meses').innerHTML = hm;
      $('p-rec-vazio').hidden = recMes.length > 0;
      $('p-rec-lista').innerHTML = recMes.map(function (x) {
        var s = x.servicos || {}, cli = s.clientes ? s.clientes.nome : 'Cliente';
        var forma = (s.detalhes && FORMAS[s.detalhes.forma]) || '';
        var sit = x.pago ? '<span class="tag pago">Recebido</span>' : (x.vencimento < hoje ? '<span class="tag atraso">Atrasado</span>' : '<span class="tag">A receber</span>');
        return '<tr><td>' + E.dataBR(x.vencimento) + '</td><td>' + esc(cli) + '</td><td>' + esc(E.prazoTxt(forma, s.condicao_pagamento)) + '</td><td class="num">' + brl(Number(x.valor)) + '</td><td>' + sit + '</td></tr>';
      }).join('');

      function pend(x, titulo, sub, tab, rot, atrasado) {
        return '<div class="pend' + (atrasado ? ' atraso' : '') + '"><div class="info"><strong>' + titulo + '</strong><small>' + (atrasado ? 'Atrasado · ' : '') + 'vence ' + E.dataBR(x.vencimento) + sub + '</small></div><b>' + brl(Number(x.valor)) +
          '</b><button type="button" class="btn-sec" data-tab="' + tab + '" data-id="' + x.id + '">' + rot + '</button></div>';
      }
      $('p-receber').innerHTML = r[2].data.length ? r[2].data.map(function (x) {
        return pend(x, esc(x.servicos && x.servicos.clientes ? x.servicos.clientes.nome : 'Cliente'), '', 'recebimentos', 'Recebido', x.vencimento < hoje);
      }).join('') : '<p class="vazio-bloco">Nada a receber nos próximos 7 dias.</p>';
      $('p-pagar').innerHTML = r[3].data.length ? r[3].data.map(function (x) {
        return pend(x, esc(x.descricao), x.fornecedor ? ' · ' + esc(x.fornecedor) : '', 'despesas', 'Paga', x.vencimento < hoje);
      }).join('') : '<p class="vazio-bloco">Nada a pagar nos próximos 7 dias.</p>';
    });
  }

  $('aba-painel').addEventListener('click', function (ev) {
    var chip = ev.target.closest('.mes-chip');
    if (chip) { $('p-mes').value = chip.dataset.mes; carregarPainel(); return; }
    var b = ev.target.closest('button[data-tab]'); if (!b) return;
    b.disabled = true;
    var campos = b.dataset.tab === 'recebimentos' ? { pago: true, pago_em: E.hoje() } : { pago: true };
    db.from(b.dataset.tab).update(campos).eq('id', b.dataset.id).then(function (r) {
      if (r.error) { alert('Erro: ' + r.error.message); b.disabled = false; return; }
      carregarPainel();
    });
  });
  $('p-mes').addEventListener('input', carregarPainel);
  E.abas.painel = function () { if (!$('p-mes').value) $('p-mes').value = E.mesAtual(); carregarPainel(); };
  // Se o login já foi resolvido antes deste script carregar, abre o painel agora.
  if (!$('app').hidden) E.abas.painel();
})();
