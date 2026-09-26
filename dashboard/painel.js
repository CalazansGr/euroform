// Painel: resumo do mês escolhido.
// Lucro = dinheiro que ENTROU (parcelas recebidas no mês) − dinheiro que SAIU (despesas pagas no mês).
(function () {
  const { db, $, r2, brl, mesAtual, mesMais, fimDoMes, soma, esc } = App;
  const cfg = window.EUROFORM_CONFIG;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const TIPOS = [['venda', 'Venda de cadeiras'], ['manutencao', 'Manutenção / reforma'], ['higienizacao', 'Higienização']];
  const pct = (a) => (Math.round(a * 10000) / 100).toLocaleString('pt-BR') + '%';

  function card(rotulo, valor, sub, extra) {
    return `<div class="card${extra && extra.dest ? ' dest' : ''}"><span>${rotulo}</span>` +
      `<strong class="${(extra && extra.cls) || ''}">${brl(valor)}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
  }

  function carregar() {
    const mes = $('p-mes').value || mesAtual();
    if (!$('p-mes').value) $('p-mes').value = mes;
    const ini = mes + '-01', fim = fimDoMes(mes);
    $('p-sub').textContent = 'Resumo de ' + MESES[parseInt(mes.slice(5), 10) - 1] + ' de ' + mes.slice(0, 4);
    // despesas fixas do mês precisam existir para entrar no "falta pagar"
    const fixos = App.gerarFixos ? App.gerarFixos(mes).catch(() => {}) : Promise.resolve();
    return fixos.then(() => Promise.all([
      db.from('ordens').select('id, categoria, valor, nf_emitida, gastos(parcelas(valor))').gte('data', ini).lte('data', fim),
      db.from('parcelas').select('valor, ordem_id, gasto_id').eq('pago', true).gte('pago_em', ini).lte('pago_em', fim),
      db.from('parcelas').select('valor, ordem_id, gasto_id').eq('pago', false).gte('vencimento', ini).lte('vencimento', fim),
      db.from('parcelas').select('valor').not('ordem_id', 'is', null).eq('pago', false).is('vencimento', null)
    ])).then((r) => {
      const e = r.find((x) => x.error); if (e) { alert('Erro ao carregar o painel: ' + e.error.message); return; }
      const [ordens, pagas, abertas, semData] = r.map((x) => x.data);
      mostrarResumo(ordens, pagas, abertas, soma(semData));
      mostrarTipos(ordens);
      mostrarSimples(ordens);
    });
  }

  function mostrarResumo(ordens, pagas, abertas, semData) {
    const faturamento = soma(ordens);
    const entrou = soma(pagas.filter((p) => p.ordem_id)), saiu = soma(pagas.filter((p) => p.gasto_id));
    const faltaReceber = soma(abertas.filter((p) => p.ordem_id)), faltaPagar = soma(abertas.filter((p) => p.gasto_id));
    const lucro = r2(entrou - saiu);
    $('p-cards').innerHTML =
      card('Faturamento', faturamento, `${ordens.length} ${ordens.length === 1 ? 'serviço feito' : 'serviços feitos'} no mês`) +
      card('Entrou', entrou, (faltaReceber ? `recebido dos clientes · falta receber ${brl(faltaReceber)} que vence no mês` : 'recebido dos clientes no mês') +
        (semData ? `<br>+ ${brl(semData)} a receber com data a definir` : ''), { cls: 'pos' }) +
      card('Despesas pagas', saiu, faltaPagar ? `falta pagar ${brl(faltaPagar)} que vence no mês` : 'pagas no mês') +
      card('Lucro do mês', lucro, 'o que entrou − o que saiu', { dest: true, cls: lucro >= 0 ? 'pos' : 'neg' });
  }

  function mostrarTipos(ordens) {
    const linhas = TIPOS.map(([k, nome]) => {
      const os = ordens.filter((o) => o.categoria === k);
      const faturado = soma(os);
      const despesas = soma(os, (o) => soma((o.gastos || []).flatMap((g) => g.parcelas || [])));
      return { nome, qtd: os.length, faturado, despesas, lucro: r2(faturado - despesas) };
    });
    const maior = Math.max(0, ...linhas.map((l) => l.lucro));
    const campeao = maior > 0 ? linhas.find((l) => l.lucro === maior) : null;
    $('p-tipos').innerHTML =
      '<div class="tt-linha tt-cab"><span>Tipo</span><span class="n">Qtd.</span><span class="n">Valor dos serviços</span><span class="n">Despesas ligadas</span><span class="n">Lucro</span></div>' +
      linhas.map((l) => `<div class="tt-linha${l === campeao ? ' campeao' : ''}">` +
        `<span class="tt-nome">${esc(l.nome)}${l === campeao ? ' <em class="selo">★ mais lucro</em>' : ''}</span>` +
        `<span class="n" data-rot="Qtd.">${l.qtd}</span>` +
        `<span class="n" data-rot="Valor">${brl(l.faturado)}</span>` +
        `<span class="n" data-rot="Despesas">${l.despesas ? '− ' + brl(l.despesas) : '—'}</span>` +
        `<span class="n tt-lucro" data-rot="Lucro"><b class="${l.lucro < 0 ? 'neg' : ''}">${brl(l.lucro)}</b>` +
        `<i class="barra" style="width:${maior > 0 && l.lucro > 0 ? Math.max(4, l.lucro / maior * 100) : 0}%"></i></span></div>`).join('');
  }

  function mostrarSimples(ordens) {
    const comNF = ordens.filter((o) => o.nf_emitida);
    const baseVenda = soma(comNF.filter((o) => o.categoria === 'venda'));
    const baseServ = soma(comNF.filter((o) => o.categoria !== 'venda'));
    const semNF = soma(ordens.filter((o) => !o.nf_emitida));
    const iv = r2(baseVenda * cfg.ALIQUOTA_VENDA), is = r2(baseServ * cfg.ALIQUOTA_SERVICO);
    $('p-simples').innerHTML =
      `<div class="s-linha"><span>Vendas com NF emitida</span><span>${brl(baseVenda)} × ${pct(cfg.ALIQUOTA_VENDA)}</span><b>${brl(iv)}</b></div>` +
      `<div class="s-linha"><span>Serviços com NF emitida</span><span>${brl(baseServ)} × ${pct(cfg.ALIQUOTA_SERVICO)}</span><b>${brl(is)}</b></div>` +
      `<div class="s-linha s-total"><span>Simples estimado do mês</span><span></span><b>${brl(r2(iv + is))}</b></div>` +
      (semNF ? `<p class="nota">${brl(semNF)} em serviços sem NF emitida não entram na estimativa.</p>` : '');
  }

  $('p-mes').addEventListener('input', carregar);
  App.abas.painel = carregar;
})();
