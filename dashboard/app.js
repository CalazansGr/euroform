(function () {
  var cfg = window.EUROFORM_CONFIG;
  var $ = function (id) { return document.getElementById(id); };
  var ALIQ = cfg.ALIQUOTA_SIMPLES;
  var CATS = { higienizacao: 'Higienização', manutencao: 'Manutenção', venda: 'Venda de cadeiras', revestimento: 'Revestimento / Reforma' };
  var FORMAS = { pix: 'PIX', boleto: 'Boleto', ted: 'TED', cartao: 'Cartão', empenho: 'Empenho', dinheiro: 'Dinheiro', outro: 'Outro' };

  function mostrarErro(el, m) { el.textContent = m; el.hidden = !m; }
  if (!cfg || cfg.SUPABASE_URL.indexOf('COLE_AQUI') === 0) {
    mostrarErro($('erro'), 'Sistema ainda não configurado (config.js).');
    return;
  }
  var db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // ---------- utilidades ----------
  function num(id) { var v = parseFloat($(id).value); return isNaN(v) ? 0 : v; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function brl(n) { return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace('-', '−'); }
  function dataBR(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function hoje() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function somaDias(iso, dias) {
    var p = iso.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2] + dias)).toISOString().slice(0, 10);
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  // ---------- login ----------
  var estado = { servicos: [], clientes: [], editando: null, logado: false };
  window.EF = { db: db, $: $, num: num, r2: r2, brl: brl, dataBR: dataBR, hoje: hoje, somaDias: somaDias, esc: esc, mostrarErro: mostrarErro, ALIQ: ALIQ, estado: estado, cfg: cfg, abas: {} };

  document.querySelectorAll('.aba[data-aba]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.aba').forEach(function (x) { x.classList.toggle('ativa', x === b); });
      document.querySelectorAll('main.conteudo').forEach(function (m) { m.hidden = m.id !== 'aba-' + b.dataset.aba; });
      if (EF.abas[b.dataset.aba]) EF.abas[b.dataset.aba]();
    });
  });

  function render(session) {
    var logado = !!session;
    $('tela-login').hidden = logado;
    $('app').hidden = !logado;
    if (logado) {
      $('usuario').textContent = session.user.email;
      if (!estado.logado) { estado.logado = true; checarBanco(); carregar(); if (EF.abas.painel) EF.abas.painel(); }
    } else { estado.logado = false; }
  }
  db.auth.getSession().then(function (r) { render(r.data.session); });
  db.auth.onAuthStateChange(function (_e, s) { render(s); });

  $('form-login').addEventListener('submit', function (ev) {
    ev.preventDefault();
    mostrarErro($('erro'), '');
    db.auth.signInWithPassword({ email: $('email').value.trim(), password: $('senha').value })
      .then(function (r) { if (r.error) mostrarErro($('erro'), 'E-mail ou senha incorretos.'); });
  });
  $('btn-sair').addEventListener('click', function () { db.auth.signOut(); });

  // Confirmação em 2 cliques (o confirm() do navegador é bloqueado em alguns ambientes).
  EF.confirmar = function (btn, texto, fazer) {
    if (btn.dataset.armado) { clearTimeout(btn._t); delete btn.dataset.armado; btn.textContent = btn.dataset.rotulo; fazer(); return; }
    btn.dataset.rotulo = btn.textContent; btn.dataset.armado = '1'; btn.textContent = texto;
    btn._t = setTimeout(function () { delete btn.dataset.armado; btn.textContent = btn.dataset.rotulo; }, 4000);
  };

  // Rotula as células das tabelas (usado no layout de cartões do celular).
  document.querySelectorAll('.tabela').forEach(function (t) {
    var heads = Array.prototype.map.call(t.querySelectorAll('thead th'), function (th) { return th.textContent; });
    new MutationObserver(function () {
      t.querySelectorAll('tbody tr').forEach(function (tr) {
        Array.prototype.forEach.call(tr.children, function (td, i) { if (!td.dataset.label) td.dataset.label = heads[i] || ''; });
      });
    }).observe(t.querySelector('tbody'), { childList: true });
  });

  // Clicar fora da caixa (no fundo escuro) fecha o pop-up; Esc também fecha (nativo).
  document.querySelectorAll('dialog').forEach(function (dlg) {
    var iniciouFora = false;
    dlg.addEventListener('mousedown', function (ev) { iniciouFora = ev.target === dlg; });
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg && iniciouFora) dlg.close(); });
  });

  // ---------- carregar / listar ----------
  // O Supabase devolve no máximo 1000 linhas por consulta: busca em páginas.
  function todas(tabela, select, filtro) {
    var lista = [];
    function pega(ini) {
      return filtro(db.from(tabela).select(select)).range(ini, ini + 999).then(function (r) {
        if (r.error) throw r.error;
        lista = lista.concat(r.data);
        return r.data.length === 1000 ? pega(ini + 1000) : lista;
      });
    }
    return pega(0);
  }
  function carregar() {
    return Promise.all([
      db.from('servicos').select('*, clientes(nome,tipo,documento), recebimentos(*)').order('data_servico', { ascending: false }).order('criado_em', { ascending: false }),
      db.from('clientes').select('*').order('nome'),
      todas('despesas', 'servico_id,valor', function (q) { return q.not('servico_id', 'is', null); }).then(function (d) { return { data: d }; }, function (e) { return { error: e }; })
    ]).then(function (r) {
      if (r[0].error || r[1].error || r[2].error) { alert('Erro ao carregar dados: ' + ((r[0].error || r[1].error || r[2].error).message)); return; }
      estado.servicos = r[0].data;
      estado.lancado = {};
      r[2].data.forEach(function (d) { estado.lancado[d.servico_id] = r2((estado.lancado[d.servico_id] || 0) + Number(d.valor)); });
      estado.clientes = r[1].data;
      $('lista-clientes').innerHTML = estado.clientes.map(function (c) { return '<option value="' + esc(c.nome) + '">'; }).join('');
      listar();
      if (EF.aoCarregarOS) EF.aoCarregarOS();
    });
  }
  // Colunas novas (situação, emissão da NF, data do recebimento): avisa se o banco ainda não foi atualizado.
  function checarBanco() {
    Promise.all([
      db.from('servicos').select('status,nf_emitida_em').limit(1),
      db.from('recebimentos').select('pago_em').limit(1)
    ]).then(function (r) {
      $('aviso-banco').hidden = !r.some(function (x) { return x.error; });
    });
  }

  function prazoTxt(forma, prazo) { return (forma + ' ' + (prazo === '0' ? 'à vista' : (prazo || ''))).trim(); }
  EF.prazoTxt = prazoTxt;
  function lucroDe(s) { return r2(Number(s.valor_bruto) - Number(s.custo_total) - Number(s.imposto)); }
  function nfPendente(s) { return s.com_nf && !s.nf_emitida_em; }
  function nfTag(s) {
    if (!s.com_nf) return '<span class="tag">Sem NF</span>';
    return s.nf_emitida_em ? '<span class="tag nf">Com NF</span>' : '<span class="tag alerta-tag">NF a emitir</span>';
  }
  // resumo das parcelas de recebimento de uma OS
  function recInfo(s) {
    var rec = s.recebimentos || [], h = hoje(), i = { n: rec.length, pagas: 0, recebido: 0, aberto: 0, atrasadas: 0 };
    rec.forEach(function (p) {
      if (p.pago) { i.pagas++; i.recebido += Number(p.valor); }
      else { i.aberto += Number(p.valor); if (p.vencimento < h) i.atrasadas++; }
    });
    i.recebido = r2(i.recebido); i.aberto = r2(i.aberto);
    return i;
  }
  function recTag(i) {
    if (!i.n) return '';
    if (!i.aberto) return '<span class="tag pago">Quitado</span>';
    if (i.atrasadas) return '<span class="tag atraso">' + i.atrasadas + (i.atrasadas > 1 ? ' atrasadas' : ' atrasada') + '</span>';
    return '<span class="tag">' + (i.pagas ? 'Recebido ' + i.pagas + ' de ' + i.n : 'A receber') + '</span>';
  }
  // Custo da OS (previsto, usado no lucro) × despesas de fornecedor lançadas e vinculadas a ela (o que vai sair do caixa).
  function custoInfo(s) {
    var prev = r2(Number(s.custo_total) || 0), lanc = r2((estado.lancado || {})[s.id] || 0);
    return { prev: prev, lanc: lanc, falta: prev > 0 && lanc === 0, dif: r2(lanc - prev) };
  }
  function custoNota(i) {
    if (i.falta) return '<small class="custo-aviso">nada lançado em despesas</small>';
    if (i.lanc && i.dif) return '<small class="custo-aviso">lançado ' + brl(i.lanc) + '</small>';
    return '';
  }
  EF.nfTag = nfTag; EF.recInfo = recInfo; EF.CATS = CATS;

  function listar() {
    var q = $('busca').value.trim().toLowerCase();
    var cat = $('filtro-cat').value, nf = $('filtro-nf').value, stt = $('filtro-status').value, fr = $('filtro-rec').value, fc = $('filtro-custo').value;
    var itens = estado.servicos.filter(function (s) {
      if (cat && s.categoria !== cat) return false;
      if ($('filtro-mes').value && s.data_servico.slice(0, 7) !== $('filtro-mes').value) return false;
      if (nf === 'pend') { if (!nfPendente(s)) return false; }
      else if (nf !== '' && String(s.com_nf ? 1 : 0) !== nf) return false;
      if (stt && (s.status || 'realizado') !== stt) return false;
      if (fc === 'falta') { var ci = custoInfo(s); if (!ci.falta && !(ci.lanc && ci.dif)) return false; }
      if (fr) {
        var ri = recInfo(s);
        if (fr === 'aberto' && !ri.aberto) return false;
        if (fr === 'atraso' && !ri.atrasadas) return false;
        if (fr === 'quitado' && (!ri.n || ri.aberto)) return false;
      }
      if (q) {
        var txt = ((s.clientes ? s.clientes.nome : '') + ' ' + (s.observacoes || '')).toLowerCase();
        if (txt.indexOf(q) < 0) return false;
      }
      return true;
    });
    $('vazio').hidden = itens.length > 0;
    var tb = 0, tl = 0, ta = 0;
    itens.forEach(function (s) { tb += Number(s.valor_bruto); tl += lucroDe(s); ta += recInfo(s).aberto; });
    $('resumo-os').innerHTML = itens.length ? '<strong>' + itens.length + '</strong> OS · total <strong>' + brl(r2(tb)) + '</strong> · lucro estimado <strong class="' + (tl >= 0 ? 'pos' : 'neg') + '">' + brl(r2(tl)) + '</strong>' +
      (ta ? ' · falta receber <strong>' + brl(r2(ta)) + '</strong>' : '') : '';
    $('lista').innerHTML = itens.map(function (s) {
      var l = lucroDe(s);
      var forma = (s.detalhes && FORMAS[s.detalhes.forma]) || '';
      return '<tr data-id="' + s.id + '"><td>' + dataBR(s.data_servico) + '</td>' +
        '<td>' + esc(s.clientes ? s.clientes.nome : '—') + ' <small>' + esc(s.clientes ? s.clientes.tipo : '') + '</small></td>' +
        '<td>' + CATS[s.categoria] + (s.status === 'pendente' ? ' <span class="tag pendente">Pendente</span>' : '') + '</td>' +
        '<td>' + nfTag(s) + '</td>' +
        '<td class="num">' + brl(Number(s.valor_bruto)) + '</td>' +
        '<td class="num">' + brl(Number(s.custo_total)) + custoNota(custoInfo(s)) + '</td>' +
        '<td class="num ' + (l >= 0 ? 'pos' : 'neg') + '">' + brl(l) + '</td>' +
        '<td>' + esc(prazoTxt(forma, s.condicao_pagamento)) + ' ' + recTag(recInfo(s)) + '</td></tr>';
    }).join('');
  }
  ['busca', 'filtro-mes', 'filtro-cat', 'filtro-nf', 'filtro-status', 'filtro-rec', 'filtro-custo'].forEach(function (id) { $(id).addEventListener('input', listar); });
  $('lista').addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr'); if (!tr) return;
    abrirForm(estado.servicos.find(function (s) { return s.id === tr.dataset.id; }));
  });

  // ---------- formulário ----------
  var dlg = $('dlg-os');
  function radio(name) { return document.querySelector('input[name=' + name + ']:checked').value; }
  function setRadio(name, v) { document.querySelector('input[name=' + name + '][value="' + v + '"]').checked = true; }

  function atualizarTipo() {
    var pj = radio('tipo') === 'PJ';
    $('lbl-nome').textContent = pj ? 'Razão social' : 'Nome';
    $('lbl-doc').textContent = (pj ? 'CNPJ' : 'CPF') + ' (opcional)';
  }

  function recalcular() {
    var comNF = radio('nf') === '1';
    $('r-box-imp').hidden = !comNF;
    var imposto = comNF ? r2(num('f-bruto') * ALIQ) : 0;
    var lucro = r2(num('f-bruto') - num('f-custo') - imposto);
    $('r-imp').textContent = brl(imposto);
    $('r-lucro').textContent = brl(lucro);
    $('r-lucro').className = lucro >= 0 ? 'pos' : 'neg';
    avisoParcelas();
    mostrarCustoLancado();
  }
  function mostrarCustoLancado() {
    var s = estado.editando, prev = r2(num('f-custo')), el = $('custo-lancado-txt');
    $('btn-lancar-custo').hidden = !s;
    if (!s) {
      el.textContent = prev > 0 ? 'Depois de salvar, lance a despesa do fornecedor (com a data de vencimento) e vincule a esta OS: ela vai para o caixa sem descontar o lucro de novo.' : '';
      $('custo-lancado').className = 'custo-lancado'; return;
    }
    var lanc = r2((estado.lancado || {})[s.id] || 0), dif = r2(lanc - prev), ok = prev > 0 && !dif;
    var t = 'Custo previsto ' + brl(prev) + ' · lançado em despesas ' + brl(lanc);
    if (ok) t += ' ✓';
    else if (!lanc && prev > 0) t += '. Falta lançar a despesa do fornecedor (pra ela aparecer no caixa e no "a pagar").';
    else if (dif > 0) t += '. Saiu ' + brl(dif) + ' a mais que o previsto: se o custo real mudou, atualize o campo Custo para o lucro ficar certo.';
    else if (dif < 0 && lanc) t += '. Falta lançar ' + brl(-dif) + ' (ou ajuste o Custo, se ficou mais barato).';
    el.textContent = prev > 0 || lanc ? t : '';
    $('custo-lancado').className = 'custo-lancado' + (ok ? ' ok' : (prev > 0 || lanc ? ' pendente' : ''));
    $('btn-lancar-custo').textContent = dif < 0 ? '+ Lançar despesa do fornecedor (' + brl(-dif) + ')' : '+ Lançar outra despesa desta OS';
  }
  $('btn-lancar-custo').addEventListener('click', function () {
    var s = estado.editando; if (!s || !EF.novaDespesaDaOS) return;
    var falta = r2(num('f-custo') - ((estado.lancado || {})[s.id] || 0));
    EF.novaDespesaDaOS(s, falta > 0 ? falta : 0);
  });
  // depois de lançar/editar uma despesa, atualiza o que foi lançado para esta OS
  EF.aposDespesa = function () {
    return carregar().then(function () {
      if (estado.editando) { var novo = estado.servicos.find(function (x) { return x.id === estado.editando.id; }); if (novo) estado.editando = novo; }
      if (dlg.open) mostrarCustoLancado();
    });
  };
  function nfEmitida() { return radio('nf') === '1' && radio('nfe') === '1'; }
  // Os prazos (30/60/90) contam da emissão da NF, se já saiu; senão, da data do serviço.
  function dataBase() { return (nfEmitida() && $('f-nf-data').value) || $('f-data').value || hoje(); }
  function basePrazo() {
    var daNF = nfEmitida() && $('f-nf-data').value;
    var t = 'Os prazos contam a partir de ' + dataBR(dataBase()) + (daNF ? ' (emissão da NF).' : ' (data do serviço).');
    if (radio('nf') === '1' && !nfEmitida()) t += ' Quando a NF sair, marque "NF já emitida" e clique em "Gerar parcelas" para recontar a partir dela.';
    $('base-prazo').textContent = t;
  }
  function atualizarNF() {
    var emitida = nfEmitida();
    $('nf-emissao').hidden = radio('nf') !== '1';
    $('nf-data-campo').hidden = !emitida;
    $('f-nf-data').required = emitida;
    if (emitida && !$('f-nf-data').value) $('f-nf-data').value = hoje();
    basePrazo();
  }
  function atualizarStatus() {
    $('lbl-data').textContent = radio('status') === 'pendente' ? 'Data prevista' : 'Data de realização';
  }
  document.querySelectorAll('input[name=tipo]').forEach(function (r) { r.addEventListener('change', atualizarTipo); });
  ['f-bruto', 'f-custo'].forEach(function (id) { $(id).addEventListener('input', recalcular); });
  document.querySelectorAll('input[name=nf]').forEach(function (r) { r.addEventListener('change', function () { atualizarNF(); recalcular(); }); });
  document.querySelectorAll('input[name=nfe]').forEach(function (r) { r.addEventListener('change', atualizarNF); });
  document.querySelectorAll('input[name=status]').forEach(function (r) { r.addEventListener('change', atualizarStatus); });
  ['f-data', 'f-nf-data'].forEach(function (id) { $(id).addEventListener('input', basePrazo); });

  // --- parcelas editáveis ---
  function linhaParcela(p) {
    var d = document.createElement('div'); d.className = 'parcela';
    d.innerHTML = '<input type="date" class="p-venc" required aria-label="Vencimento"><input type="number" class="p-valor" min="0" step="0.01" inputmode="decimal" required aria-label="Valor">' +
      '<label class="p-lbl"><input type="checkbox" class="p-pago"> Recebido</label><input type="date" class="p-pagoem" aria-label="Recebido em" title="Dia em que o cliente pagou">' +
      '<button type="button" class="btn-perigo p-del" aria-label="Remover parcela">✕</button>';
    d.querySelector('.p-venc').value = p.vencimento || '';
    d.querySelector('.p-valor').value = p.valor;
    d.querySelector('.p-pago').checked = !!p.pago;
    d.querySelector('.p-pagoem').value = p.pago ? (p.pago_em || '') : '';
    d.classList.toggle('recebida', !!p.pago);
    return d;
  }
  function lerParcelas() {
    return Array.prototype.map.call($('parcelas').children, function (d) {
      var pago = d.querySelector('.p-pago').checked;
      return { vencimento: d.querySelector('.p-venc').value, valor: r2(parseFloat(d.querySelector('.p-valor').value) || 0), pago: pago,
        pago_em: pago ? (d.querySelector('.p-pagoem').value || hoje()) : null };
    });
  }
  function avisoParcelas() {
    var ps = lerParcelas(), soma = r2(ps.reduce(function (a, p) { return a + p.valor; }, 0)), bruto = r2(num('f-bruto'));
    $('aviso-parcelas').hidden = !(ps.length && r2(soma - bruto) !== 0);
    $('aviso-parcelas').textContent = 'As parcelas somam ' + brl(soma) + ', diferente do preço cobrado (' + brl(bruto) + ').';
  }
  function gerarParcelas() {
    var txt = $('f-prazos').value.trim() || '0';
    var prazos = txt.split(/[\/,\s-]+/).filter(Boolean).map(Number).filter(function (n) { return !isNaN(n) && n >= 0; });
    if (!prazos.length) prazos = [0];
    var total = num('f-bruto'), base = r2(total / prazos.length), soma = 0, data = dataBase();
    var antigas = lerParcelas();   // quem já estava marcado como recebido continua recebido
    $('parcelas').innerHTML = '';
    prazos.forEach(function (p, i) {
      var v = i === prazos.length - 1 ? r2(total - soma) : base; soma = r2(soma + v);
      var a = antigas[i] || {};
      $('parcelas').appendChild(linhaParcela({ vencimento: somaDias(data, p), valor: v, pago: !!a.pago, pago_em: a.pago_em }));
    });
    avisoParcelas();
  }
  $('btn-gerar').addEventListener('click', gerarParcelas);
  document.querySelectorAll('[data-prazo]').forEach(function (b) {
    b.addEventListener('click', function () { $('f-prazos').value = b.dataset.prazo; gerarParcelas(); });
  });
  $('btn-add-parcela').addEventListener('click', function () {
    $('parcelas').appendChild(linhaParcela({ vencimento: $('f-data').value || hoje(), valor: 0, pago: false })); avisoParcelas();
  });
  $('parcelas').addEventListener('click', function (ev) {
    if (ev.target.classList.contains('p-del')) { ev.target.closest('.parcela').remove(); avisoParcelas(); }
  });
  $('parcelas').addEventListener('input', avisoParcelas);
  $('parcelas').addEventListener('change', function (ev) {
    if (!ev.target.classList.contains('p-pago')) return;
    var linha = ev.target.closest('.parcela'), em = linha.querySelector('.p-pagoem');
    linha.classList.toggle('recebida', ev.target.checked);
    em.value = ev.target.checked ? (em.value || hoje()) : '';
  });

  function limpar() {
    $('form-os').reset();
    $('f-data').value = hoje();
    $('parcelas').innerHTML = '';
    setRadio('tipo', 'PF'); setRadio('nf', '0'); setRadio('nfe', '0'); setRadio('status', 'realizado');
    mostrarErro($('os-erro'), '');
  }

  function abrirForm(s) {
    limpar();
    estado.editando = s || null;
    $('os-titulo').textContent = s ? 'Editar OS' : 'Nova OS';
    $('btn-excluir').hidden = !s;
    $('os-info-excluir').hidden = true;
    if (s) {
      db.from('despesas').select('valor,pago').eq('servico_id', s.id).then(function (r) {
        var rec = s.recebimentos || [], recebido = r2(rec.filter(function (p) { return p.pago; }).reduce(function (t, p) { return t + Number(p.valor); }, 0));
        var abertas = (r.data || []).filter(function (d) { return !d.pago; }), pagas = (r.data || []).length - abertas.length;
        var partes = ['Excluir esta OS remove ' + rec.length + ' parcela(s) de recebimento' + (recebido ? ' (' + brl(recebido) + ' já marcado como recebido)' : '')];
        if (abertas.length) partes.push(abertas.length + ' despesa(s) em aberto ligada(s) a ela');
        if (pagas) partes.push('(' + pagas + ' despesa(s) já paga(s) ficam no histórico)');
        if (s.com_nf && s.nf_emitida_em) partes.push('e o Simples do mês seguinte é recalculado');
        $('os-info-excluir').textContent = partes.join(', ').replace(', (', ' (').replace(', e o', ' e o') + '.';
        $('os-info-excluir').hidden = false;
      });
      var d = s.detalhes || {};
      setRadio('tipo', s.clientes ? s.clientes.tipo : 'PF');
      $('f-nome').value = s.clientes ? s.clientes.nome : '';
      $('f-doc').value = (s.clientes && s.clientes.documento) || '';
      $('f-cat').value = s.categoria;
      $('f-data').value = s.data_servico;
      setRadio('nf', s.com_nf ? '1' : '0');
      setRadio('nfe', s.nf_emitida_em ? '1' : '0');
      $('f-nf-data').value = s.nf_emitida_em || '';
      $('f-nf-num').value = d.nf_numero || '';
      setRadio('status', s.status || 'realizado');
      $('f-bruto').value = s.valor_bruto;
      $('f-custo').value = s.custo_total;
      $('f-forma').value = d.forma || 'pix';
      $('f-prazos').value = s.condicao_pagamento || '';
      $('f-obs').value = s.observacoes || '';
      (s.recebimentos || []).slice().sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : 1; })
        .forEach(function (p) { $('parcelas').appendChild(linhaParcela({ vencimento: p.vencimento, valor: Number(p.valor), pago: p.pago, pago_em: p.pago_em })); });
    } else {
      $('f-prazos').value = '0';
    }
    atualizarTipo(); atualizarNF(); atualizarStatus(); recalcular();
    dlg.showModal();
    if (!s) $('f-nome').focus();
  }
  $('btn-nova').addEventListener('click', function () { abrirForm(null); });
  EF.abrirOS = abrirForm; EF.carregarOS = carregar;
  EF.abas.servicos = listar;   // reflete na hora o que foi marcado como recebido em outra aba
  $('btn-cancelar').addEventListener('click', function () { dlg.close(); });

  function obterCliente(tipo, nome, doc) {
    var achado = estado.clientes.find(function (c) { return c.nome.toLowerCase() === nome.toLowerCase(); });
    if (achado) {
      if (achado.tipo === tipo && (achado.documento || '') === doc) return Promise.resolve(achado.id);
      return db.from('clientes').update({ tipo: tipo, documento: doc || null }).eq('id', achado.id).then(function (r) {
        if (r.error) throw r.error; return achado.id;
      });
    }
    return db.from('clientes').insert({ tipo: tipo, nome: nome, documento: doc || null }).select('id').single().then(function (r) {
      if (r.error) throw r.error; return r.data.id;
    });
  }

  $('form-os').addEventListener('submit', function (ev) {
    ev.preventDefault();
    mostrarErro($('os-erro'), '');
    var comNF = radio('nf') === '1', bruto = num('f-bruto'), emitida = nfEmitida();
    var ant = estado.editando ? estado.editando.detalhes || {} : {};
    var nome = $('f-nome').value.trim().replace(/\s+/g, ' ');
    var reg = {
      categoria: $('f-cat').value, data_servico: $('f-data').value,
      detalhes: Object.assign({}, ant, { forma: $('f-forma').value, nf_numero: comNF ? ($('f-nf-num').value.trim() || null) : null }),
      com_nf: comNF, valor_nf: comNF ? bruto : null, valor_bruto: bruto,
      status: radio('status'), nf_emitida_em: emitida ? $('f-nf-data').value : null,
      custo_total: num('f-custo'), imposto: comNF ? r2(bruto * ALIQ) : 0,
      condicao_pagamento: $('f-prazos').value.trim() || null, observacoes: $('f-obs').value.trim() || null
    };
    var linhas = lerParcelas();
    if (bruto > 0) {
      if (!linhas.length) { mostrarErro($('os-erro'), 'Falta definir as parcelas de recebimento. Escolha o prazo e clique em "Gerar parcelas".'); return; }
      var somaP = r2(linhas.reduce(function (t, p) { return t + p.valor; }, 0));
      if (somaP !== r2(bruto)) { mostrarErro($('os-erro'), 'As parcelas somam ' + brl(somaP) + ', mas o preço cobrado é ' + brl(r2(bruto)) + '. Clique em "Gerar parcelas" ou ajuste os valores.'); return; }
      if (linhas.some(function (p) { return !p.vencimento; })) { mostrarErro($('os-erro'), 'Toda parcela precisa de uma data de vencimento.'); return; }
    }
    var btn = $('btn-salvar'); btn.disabled = true;
    var ed = estado.editando;

    obterCliente(radio('tipo'), nome, $('f-doc').value.trim()).then(function (clienteId) {
      reg.cliente_id = clienteId;
      return ed ? db.from('servicos').update(reg).eq('id', ed.id).select('id').single()
                : db.from('servicos').insert(reg).select('id').single();
    }).then(function (r) {
      if (r.error) throw r.error;
      var id = r.data.id;
      var apagar = ed ? db.from('recebimentos').delete().eq('servico_id', id) : Promise.resolve({});
      return apagar.then(function (a) {
        if (a.error) throw a.error;
        if (!linhas.length) return { error: null };
        return db.from('recebimentos').insert(linhas.map(function (p) {
          return { servico_id: id, vencimento: p.vencimento, valor: p.valor, pago: p.pago, pago_em: p.pago_em };
        }));
      }).then(function (i) { if (i && i.error) throw i.error; });
    }).then(function () {
      EF.invalidarSinc(); dlg.close(); return carregar();
    }).catch(function (e) {
      mostrarErro($('os-erro'), 'Erro ao salvar: ' + (e.message || e));
    }).then(function () { btn.disabled = false; });
  });

  $('btn-excluir').addEventListener('click', function () {
    if (!estado.editando) return;
    var id = estado.editando.id;
    EF.confirmar(this, 'Clique de novo para excluir', function () {
      // despesas em aberto ligadas a esta OS saem junto; as já pagas ficam (só perdem o vínculo)
      db.from('despesas').delete().eq('servico_id', id).eq('pago', false).then(function (d) {
        if (d.error) throw d.error;
        return db.from('servicos').delete().eq('id', id);
      }).then(function (r) {
        if (r.error) throw r.error;
        EF.invalidarSinc(); dlg.close(); carregar();
      }).catch(function (e) { mostrarErro($('os-erro'), 'Erro ao excluir: ' + (e.message || e)); });
    });
  });
})();
