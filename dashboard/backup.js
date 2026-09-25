(function () {
  if (!window.EF) return;
  var E = EF, $ = E.$, db = E.db;
  var CATS = { higienizacao: 'Higienização', manutencao: 'Manutenção', venda: 'Venda de cadeiras', revestimento: 'Revestimento / Reforma' };
  var FORMAS = { pix: 'PIX', boleto: 'Boleto', ted: 'TED', cartao: 'Cartão', empenho: 'Empenho', dinheiro: 'Dinheiro', outro: 'Outro' };
  var TIPOS = { variavel: 'Variável', recorrente: 'Fixa', imposto: 'Imposto' };

  // O Supabase devolve no máximo 1000 linhas por consulta: busca em páginas.
  function buscarTudo(tabela, select, ordem) {
    var todas = [];
    function pagina(ini) {
      return db.from(tabela).select(select).order(ordem).range(ini, ini + 999).then(function (r) {
        if (r.error) throw r.error;
        todas = todas.concat(r.data);
        return r.data.length === 1000 ? pagina(ini + 1000) : todas;
      });
    }
    return pagina(0);
  }

  function carregarBiblioteca() {
    if (window.XLSX) return Promise.resolve();
    return new Promise(function (ok, erro) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = ok; s.onerror = function () { erro(new Error('Não foi possível carregar o gerador de Excel (sem internet?).')); };
      document.head.appendChild(s);
    });
  }

  function exportar() {
    var btn = $('btn-exportar'), rotulo = btn.textContent;
    btn.disabled = true; btn.textContent = 'Gerando...';
    Promise.all([
      carregarBiblioteca(),
      buscarTudo('servicos', '*, clientes(nome,tipo,documento)', 'data_servico'),
      buscarTudo('recebimentos', '*, servicos(data_servico, clientes(nome))', 'vencimento'),
      buscarTudo('despesas', '*, servicos(data_servico, clientes(nome))', 'vencimento'),
      buscarTudo('recorrentes', '*', 'descricao'),
      buscarTudo('clientes', '*', 'nome')
    ]).then(function (r) {
      var sim = function (b) { return b ? 'Sim' : 'Não'; };
      var abas = {
        'Serviços': r[1].map(function (s) {
          return { 'Data': s.data_servico, 'Cliente': s.clientes ? s.clientes.nome : '', 'Tipo': s.clientes ? s.clientes.tipo : '', 'Categoria': CATS[s.categoria] || s.categoria,
            'Situação': s.status === 'pendente' ? 'Pendente' : 'Realizado',
            'Com NF': sim(s.com_nf), 'NF emitida em': s.nf_emitida_em || (s.com_nf ? 'a emitir' : ''), 'Nº NF': (s.detalhes && s.detalhes.nf_numero) || '', 'Preço cobrado': Number(s.valor_bruto), 'Simples': E.simplesDe(s),
            'Forma de pagamento': (s.detalhes && FORMAS[s.detalhes.forma]) || '', 'Prazo (dias)': s.condicao_pagamento || '', 'Observações': s.observacoes || '' };
        }),
        'Recebimentos': r[2].map(function (x) {
          return { 'Vencimento': x.vencimento, 'Cliente': x.servicos && x.servicos.clientes ? x.servicos.clientes.nome : '', 'Data do serviço': x.servicos ? x.servicos.data_servico : '',
            'Valor': Number(x.valor), 'Recebido': sim(x.pago), 'Recebido em': x.pago_em || '' };
        }),
        'Despesas': r[3].map(function (d) {
          return { 'Vencimento': d.vencimento, 'Descrição': d.descricao, 'Fornecedor': d.fornecedor || '', 'Tipo': TIPOS[d.tipo] || d.tipo, 'Valor': Number(d.valor), 'Paga': sim(d.pago),
            'OS (cliente)': d.servicos && d.servicos.clientes ? d.servicos.clientes.nome : '' };
        }),
        'Despesas fixas': r[4].map(function (x) {
          return { 'Descrição': x.descricao, 'Valor mensal': Number(x.valor), 'Dia do vencimento': x.dia_vencimento, 'Ativa': sim(x.ativo) };
        }),
        'Clientes': r[5].map(function (c) { return { 'Nome': c.nome, 'Tipo': c.tipo, 'Documento': c.documento || '' }; })
      };
      var wb = XLSX.utils.book_new();
      Object.keys(abas).forEach(function (nome) {
        var linhas = abas[nome].length ? abas[nome] : [{ 'Sem registros': '' }];
        var ws = XLSX.utils.json_to_sheet(linhas);
        ws['!cols'] = Object.keys(linhas[0]).map(function (k) { return { wch: Math.max(12, k.length + 2) }; });
        XLSX.utils.book_append_sheet(wb, ws, nome);
      });
      XLSX.writeFile(wb, 'euroform-backup-' + E.hoje() + '.xlsx');
    }).catch(function (e) {
      alert('Erro ao exportar: ' + (e.message || e));
    }).then(function () { btn.disabled = false; btn.textContent = rotulo; });
  }
  $('btn-exportar').addEventListener('click', exportar);
})();
