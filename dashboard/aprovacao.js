// Aguardando aprovação: contatos de clientes ainda não confirmados. Não contam no faturamento do Painel.
(function () {
  const { db, $, brl, dataBR, esc, soma } = App;

  function pendentes() {
    return (App.ordens || []).filter((o) => !o.aprovado);
  }

  function listar() {
    const q = $('ap-busca').value.trim().toLowerCase(), mes = $('ap-mes').value;
    const itens = pendentes().filter((o) => {
      if (mes && o.data.slice(0, 7) !== mes) return false;
      if (q && [o.cliente, o.descricao, o.obs].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    $('ap-resumo').innerHTML = itens.length
      ? `<b>${itens.length}</b> ${itens.length > 1 ? 'contatos' : 'contato'} · total <b>${brl(soma(itens))}</b>`
      : '';
    $('ap-vazio').hidden = itens.length > 0;
    $('ap-lista').innerHTML = itens.map((o) => `<article class="item" data-id="${o.id}">` +
      `<div class="item-topo"><div><b class="item-nome">${esc(o.cliente)}</b> <small class="tipo">${o.cliente_tipo === 'PJ' ? 'Empresa' : 'PF'}</small>` +
      ' <span class="tag-pendente">Aguardando aprovação</span>' +
      `<div class="item-sub">${App.CATS[o.categoria]}${o.descricao ? ' · ' + esc(o.descricao) : ''} · ${dataBR(o.data)}</div></div>` +
      `<b class="item-valor">${brl(Number(o.valor))}</b></div>` +
      `<div class="item-acoes"><button type="button" class="sec mini btn-aprovar">Aprovar</button></div>` +
      '</article>').join('');
  }

  $('ap-lista').addEventListener('click', (ev) => {
    const card = ev.target.closest('.item'); if (!card) return;
    const o = pendentes().find((x) => x.id === card.dataset.id);
    if (!o) return;
    if (ev.target.closest('.btn-aprovar')) {
      db.from('ordens').update({ aprovado: true }).eq('id', o.id).then((r) => {
        if (r.error) { alert('Erro ao aprovar: ' + r.error.message); return; }
        App.carregarServicos().then(listar);
      });
      return;
    }
    App.abrirServico(o);
  });

  $('btn-novo-contato').addEventListener('click', () => App.abrirServico(null, false));
  ['ap-busca', 'ap-mes'].forEach((id) => $(id).addEventListener('input', listar));

  App.renderAprovacao = listar;
  App.abas.aprovacao = () => App.carregarServicos().then(listar);
})();
