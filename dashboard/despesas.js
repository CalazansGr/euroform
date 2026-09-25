(function () {
  if (!window.EF) return;
  var E = EF, $ = E.$, db = E.db, brl = E.brl, r2 = E.r2, esc = E.esc;
  var TIPOS = { variavel: 'Variável', recorrente: 'Fixa', imposto: 'Imposto' };
  var st = { despesas: [], recorrentes: [], editando: null };

  function mesAtual() { return E.hoje().slice(0, 7); }
  function mesMais(mes, n) {
    var p = mes.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1 + n, 1));
    return d.toISOString().slice(0, 7);
  }
  function ultimoDia(mes) { var p = mes.split('-').map(Number); return new Date(p[0], p[1], 0).getDate(); }
  function dataNoMes(mes, dia) { return mes + '-' + String(Math.min(dia, ultimoDia(mes))).padStart(2, '0'); }
  function faixa(mes) { return [mes + '-01', mes + '-' + String(ultimoDia(mes)).padStart(2, '0')]; }

  // ---- sincronização automática: Simples (derivado das OS) e despesas fixas ----
  var MARCA_SIMPLES = 'Simples Nacional (NF de';
  function pagina(tabela, select, filtro) {
    var todas = [];
    function pega(ini) {
      var q = db.from(tabela).select(select);
      if (filtro) q = filtro(q);
      return q.range(ini, ini + 999).then(function (r) {
        if (r.error) throw r.error;
        todas = todas.concat(r.data);
        return r.data.length === 1000 ? pega(ini + 1000) : todas;
      });
    }
    return pega(0);
  }
  function checar(rs) { (rs || []).forEach(function (x) { if (x && x.error) throw x.error; }); }

  // O Simples de cada mês é SEMPRE calculado a partir das OS com NF do mês anterior.
  // Cria, atualiza ou remove a linha (se ainda não paga) para nunca ficar valor "fantasma".
  function reconciliarSimples() {
    return Promise.all([
      pagina('servicos', 'valor_nf,data_servico', function (q) { return q.eq('com_nf', true); }),
      pagina('despesas', '*', function (q) { return q.eq('tipo', 'imposto').like('descricao', MARCA_SIMPLES + '%'); })
    ]).then(function (r) {
      var esperado = {}, linhas = {}, meses = {}, avisos = [], ops = [];
      r[0].forEach(function (s) { var m = mesMais(s.data_servico.slice(0, 7), 1); esperado[m] = (esperado[m] || 0) + Number(s.valor_nf || 0); meses[m] = 1; });
      r[1].forEach(function (d) { var m = d.vencimento.slice(0, 7); (linhas[m] = linhas[m] || []).push(d); meses[m] = 1; });
      var limite = mesMais(mesAtual(), 1);
      Object.keys(meses).forEach(function (m) {
        var exp = r2((esperado[m] || 0) * E.ALIQ), rows = (linhas[m] || []).sort(function (a, b) { return (b.pago ? 1 : 0) - (a.pago ? 1 : 0); });
        var manter = rows[0];
        rows.slice(1).forEach(function (d) { if (!d.pago) ops.push(db.from('despesas').delete().eq('id', d.id)); });   // duplicadas
        var desc = MARCA_SIMPLES + ' ' + mesMais(m, -1).split('-').reverse().join('/') + ')';
        if (exp > 0) {
          if (!manter) { if (m <= limite) ops.push(db.from('despesas').insert({ tipo: 'imposto', descricao: desc, fornecedor: 'Receita Federal', valor: exp, vencimento: dataNoMes(m, E.cfg.DIA_VENCIMENTO_SIMPLES || 20), pago: false })); }
          else if (!manter.pago) { if (Number(manter.valor) !== exp || manter.descricao !== desc) ops.push(db.from('despesas').update({ valor: exp, descricao: desc }).eq('id', manter.id)); }
          else if (Number(manter.valor) !== exp) avisos.push({ mes: m, pago: Number(manter.valor), calculado: exp });
        } else if (manter) {
          if (!manter.pago) ops.push(db.from('despesas').delete().eq('id', manter.id));
          else avisos.push({ mes: m, pago: Number(manter.valor), calculado: 0 });
        }
      });
      E.avisosSimples = avisos;
      return Promise.all(ops);
    }).then(checar);
  }
  var sincCache = null, sincTimer = null;
  E.invalidarSinc = function () { sincCache = null; clearTimeout(sincTimer); };
  function sincSimples() {
    if (!sincCache) {
      sincCache = reconciliarSimples();
      sincCache.catch(function () { sincCache = null; });
      clearTimeout(sincTimer); sincTimer = setTimeout(function () { sincCache = null; }, 3000);
    }
    return sincCache;
  }
  E.textoAvisoSimples = function () {
    return (E.avisosSimples || []).map(function (a) {
      return 'Simples de ' + a.mes.split('-').reverse().join('/') + ' já foi pago com ' + brl(a.pago) + ', mas o cálculo atual das OS é ' + brl(a.calculado) + '. Confira as OS ou ajuste a despesa.';
    }).join(' ');
  };

  // Gera as despesas fixas do mês (uma por fixa) e remove duplicatas em aberto.
  var fila = Promise.resolve();   // uma geração por vez neste navegador (evita duplicar em cliques rápidos)
  function garantirMes(mes) {
    var p = fila.then(function () { return garantirMesReal(mes); });
    fila = p.catch(function () {});
    return p;
  }
  function garantirMesReal(mes) {
    return sincSimples().then(function () {
      if (mes > mesMais(mesAtual(), 1)) return;
      var f = faixa(mes);
      return Promise.all([
        db.from('recorrentes').select('*').eq('ativo', true),
        db.from('despesas').select('*').gte('vencimento', f[0]).lte('vencimento', f[1]).not('recorrente_id', 'is', null)
      ]).then(function (r) {
        if (r[0].error) throw r[0].error; if (r[1].error) throw r[1].error;
        var novas = [], ops = [], vistos = {};
        r[1].data.sort(function (a, b) { return (b.pago ? 1 : 0) - (a.pago ? 1 : 0); }).forEach(function (d) {
          if (vistos[d.recorrente_id]) { if (!d.pago) ops.push(db.from('despesas').delete().eq('id', d.id)); } else vistos[d.recorrente_id] = 1;
        });
        r[0].data.forEach(function (rec) {
          if (!vistos[rec.id]) novas.push({ tipo: 'recorrente', descricao: rec.descricao, valor: rec.valor, vencimento: dataNoMes(mes, rec.dia_vencimento), recorrente_id: rec.id, pago: false });
        });
        if (novas.length) ops.push(db.from('despesas').insert(novas));
        return Promise.all(ops).then(checar);
      });
    });
  }

  // ---- listagem ----
  function carregarDesp() {
    var mes = $('d-mes').value || mesAtual(), f = faixa(mes);
    return garantirMes(mes).catch(function (e) { alert('Erro ao gerar despesas do mês: ' + (e.message || e)); })
      .then(function () {
        var av = E.textoAvisoSimples(); $('d-aviso').textContent = '⚠ ' + av; $('d-aviso').hidden = !av;
        return db.from('despesas').select('*, servicos(data_servico, clientes(nome))').gte('vencimento', f[0]).lte('vencimento', f[1]).order('vencimento');
      }).then(function (r) {
        if (r.error) { alert('Erro ao carregar despesas: ' + r.error.message); return; }
        st.despesas = r.data; listarDesp();
      });
  }

  function listarDesp() {
    var tipo = $('d-filtro-tipo').value, pago = $('d-filtro-pago').value;
    var itens = st.despesas.filter(function (d) {
      return (!tipo || d.tipo === tipo) && (pago === '' || String(d.pago ? 1 : 0) === pago);
    });
    var tot = 0, pg = 0;
    itens.forEach(function (d) { tot += Number(d.valor); if (d.pago) pg += Number(d.valor); });
    $('dt-total').textContent = brl(r2(tot)); $('dt-pago').textContent = brl(r2(pg)); $('dt-pendente').textContent = brl(r2(tot - pg));
    $('vazio-desp').hidden = itens.length > 0;
    var hoje = E.hoje();
    $('lista-desp').innerHTML = itens.map(function (d) {
      var atrasada = !d.pago && d.vencimento < hoje;
      var sit = d.pago ? '<span class="tag pago">Paga</span>' : (atrasada ? '<span class="tag atraso">Atrasada</span>' : '<span class="tag">A pagar</span>');
      var cli = d.servicos && d.servicos.clientes ? ' <small>(OS ' + esc(d.servicos.clientes.nome) + ')</small>' : '';
      return '<tr data-id="' + d.id + '"><td>' + E.dataBR(d.vencimento) + '</td><td>' + esc(d.descricao) + cli + '</td><td>' + esc(d.fornecedor || '') +
        '</td><td>' + TIPOS[d.tipo] + '</td><td class="num">' + brl(Number(d.valor)) + '</td><td>' + sit + '</td></tr>';
    }).join('');
  }
  ['d-mes', 'd-filtro-tipo', 'd-filtro-pago'].forEach(function (id) {
    $(id).addEventListener('input', function () { id === 'd-mes' ? carregarDesp() : listarDesp(); });
  });
  $('lista-desp').addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr'); if (!tr) return;
    abrirDesp(st.despesas.find(function (d) { return d.id === tr.dataset.id; }));
  });

  // ---- formulário de despesa ----
  var dlg = $('dlg-desp');
  function abrirDesp(d) {
    st.editando = d || null;
    $('form-desp').reset(); E.mostrarErro($('desp-erro'), '');
    $('desp-titulo').textContent = d ? 'Editar despesa' : 'Nova despesa';
    $('btn-excluir-desp').hidden = !d;
    $('desp-info').hidden = !d;
    var autoSimples = !!d && d.tipo === 'imposto' && (d.descricao || '').indexOf(MARCA_SIMPLES) === 0;
    ['x-valor', 'x-desc', 'x-tipo', 'x-venc'].forEach(function (id) { $(id).readOnly = false; $(id).disabled = false; });
    if (d) {
      var sit = d.pago ? 'Paga' : (d.vencimento < E.hoje() ? 'Atrasada' : 'A pagar');
      var origem = d.recorrente_id ? 'gerada automaticamente da despesa fixa' : (d.tipo === 'imposto' ? 'gerada automaticamente (Simples)' : 'lançada manualmente');
      $('desp-info').textContent = 'Situação: ' + sit + ' · ' + origem;
      if (autoSimples) {
        $('desp-info').textContent += '. O valor é calculado pelas OS com NF do mês anterior e se atualiza sozinho até você marcar como paga. Para mudar o valor, ajuste as OS. Esta linha não pode ser excluída.';
        ['x-valor', 'x-desc', 'x-tipo'].forEach(function (id) { $(id).disabled = true; });
        $('btn-excluir-desp').hidden = true;
      } else if (d.recorrente_id) {
        $('desp-info').textContent += '. Se excluir, ela é recriada ao reabrir o mês; para parar de vez, pause ou exclua a despesa fixa em "Despesas fixas".';
      }
    }
    $('x-os').innerHTML = '<option value="">— nenhuma —</option>' + E.estado.servicos.map(function (s) {
      return '<option value="' + s.id + '">' + E.dataBR(s.data_servico) + ' · ' + esc(s.clientes ? s.clientes.nome : '—') + ' · ' + esc(s.categoria) + '</option>';
    }).join('');
    if (d) {
      $('x-desc').value = d.descricao; $('x-forn').value = d.fornecedor || ''; $('x-valor').value = d.valor;
      $('x-venc').value = d.vencimento; $('x-tipo').value = d.tipo; $('x-os').value = d.servico_id || ''; $('x-pago').checked = d.pago;
    } else {
      $('x-venc').value = E.hoje();
    }
    $('x-parc-campo').hidden = !!d;   // parcelar só ao lançar; depois cada parcela é editada separadamente
    previaParcelas();
    dlg.showModal();
    if (!d) $('x-desc').focus();
  }

  // ---- parcelamento: divide o valor total em N despesas, uma por mês a partir do 1º vencimento ----
  function nParcelas() { return st.editando ? 1 : Math.max(1, Math.min(36, parseInt($('x-parc').value, 10) || 1)); }
  function montarParcelas(total, venc, n) {
    var p = venc.split('-').map(Number), dia = p[2], mes0 = venc.slice(0, 7);
    var base = r2(Math.floor(total / n * 100) / 100), soma = 0, lista = [];
    for (var i = 0; i < n; i++) {
      var v = i === n - 1 ? r2(total - soma) : base; soma = r2(soma + v);   // centavos que sobram vão na última
      lista.push({ valor: v, vencimento: dataNoMes(mesMais(mes0, i), dia) });
    }
    return lista;
  }
  function previaParcelas() {
    var n = nParcelas(), venc = $('x-venc').value;
    $('x-pago-txt').textContent = n > 1 ? '1ª parcela já foi paga' : 'Já foi paga';
    $('x-valor').previousElementSibling.textContent = n > 1 ? 'Valor total (R$)' : 'Valor (R$)';
    if (n < 2 || !venc) { $('x-parc-previa').hidden = true; return; }
    var ps = montarParcelas(r2(E.num('x-valor')), venc, n);
    $('x-parc-previa').textContent = n + 'x: ' + ps.map(function (x) { return E.dataBR(x.vencimento) + ' ' + brl(x.valor); }).join(' · ') +
      '. Cada parcela vira uma conta a pagar separada (dá pra ajustar data e valor de cada uma depois).';
    $('x-parc-previa').hidden = false;
  }
  ['x-parc', 'x-valor', 'x-venc'].forEach(function (id) { $(id).addEventListener('input', previaParcelas); });
  $('btn-nova-desp').addEventListener('click', function () { abrirDesp(null); });
  $('btn-cancelar-desp').addEventListener('click', function () { dlg.close(); });

  $('form-desp').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var reg = {
      descricao: $('x-desc').value.trim(), fornecedor: $('x-forn').value.trim() || null, valor: r2(E.num('x-valor')),
      vencimento: $('x-venc').value, tipo: $('x-tipo').value, servico_id: $('x-os').value || null, pago: $('x-pago').checked
    };
    var n = nParcelas(), q;
    if (st.editando) q = db.from('despesas').update(reg).eq('id', st.editando.id);
    else if (n > 1) {
      q = db.from('despesas').insert(montarParcelas(reg.valor, reg.vencimento, n).map(function (x, i) {
        return Object.assign({}, reg, { descricao: reg.descricao + ' (' + (i + 1) + '/' + n + ')', valor: x.valor, vencimento: x.vencimento, pago: i === 0 && reg.pago });
      }));
    } else q = db.from('despesas').insert(reg);
    q.then(function (r) {
      if (r.error) { E.mostrarErro($('desp-erro'), 'Erro ao salvar: ' + r.error.message); return; }
      dlg.close();
      var m = reg.vencimento.slice(0, 7); if ($('d-mes').value !== m) $('d-mes').value = m;
      carregarDesp();
    });
  });
  $('btn-excluir-desp').addEventListener('click', function () {
    if (!st.editando) return;
    E.confirmar(this, 'Clique de novo para excluir', function () {
      db.from('despesas').delete().eq('id', st.editando.id).then(function (r) {
        if (r.error) { E.mostrarErro($('desp-erro'), 'Erro ao excluir: ' + r.error.message); return; }
        dlg.close(); carregarDesp();
      });
    });
  });

  // ---- despesas fixas (recorrentes) ----
  var dlgRec = $('dlg-rec');
  function carregarRec() {
    return db.from('recorrentes').select('*').order('dia_vencimento').then(function (r) {
      if (r.error) { E.mostrarErro($('rec-erro'), r.error.message); return; }
      st.recorrentes = r.data;
      $('lista-rec').innerHTML = r.data.length ? r.data.map(function (x) {
        return '<div class="rec-item' + (x.ativo ? '' : ' off') + '" data-id="' + x.id + '"><strong>' + esc(x.descricao) + '</strong><span>' + brl(Number(x.valor)) +
          '</span><span>dia ' + x.dia_vencimento + '</span><button type="button" class="btn-sec rec-edit">Editar</button><button type="button" class="btn-sec rec-toggle">' + (x.ativo ? 'Pausar' : 'Ativar') +
          '</button><button type="button" class="btn-perigo rec-del">Excluir</button></div>';
      }).join('') : '<p class="vazio">Nenhuma despesa fixa cadastrada.</p>';
    });
  }
  // remove as linhas geradas ainda em aberto que vencem de hoje em diante (as pagas e as atrasadas ficam)
  function limparFuturas(id) { return db.from('despesas').delete().eq('recorrente_id', id).eq('pago', false).gte('vencimento', E.hoje()); }
  $('btn-recorrentes').addEventListener('click', function () { E.mostrarErro($('rec-erro'), ''); carregarRec(); dlgRec.showModal(); });
  $('btn-fechar-rec').addEventListener('click', function () { dlgRec.close(); });
  dlgRec.addEventListener('close', carregarDesp);
  $('form-rec').addEventListener('submit', function (ev) {
    ev.preventDefault();
    db.from('recorrentes').insert({ descricao: $('r-desc').value.trim(), valor: r2(E.num('r-valor')), dia_vencimento: parseInt($('r-dia').value, 10) }).then(function (r) {
      if (r.error) { E.mostrarErro($('rec-erro'), r.error.message); return; }
      $('form-rec').reset(); carregarRec();
    });
  });
  $('lista-rec').addEventListener('click', function (ev) {
    var item = ev.target.closest('.rec-item'); if (!item) return;
    var x = st.recorrentes.find(function (r) { return r.id === item.dataset.id; });
    if (ev.target.classList.contains('rec-edit')) {
      item.classList.add('edit');
      item.innerHTML = '<input class="e-desc" value="' + esc(x.descricao).replace(/"/g, '&quot;') + '"><input class="e-valor" type="number" min="0" step="0.01" inputmode="decimal" value="' + x.valor +
        '"><input class="e-dia" type="number" min="1" max="31" value="' + x.dia_vencimento + '"><button type="button" class="rec-salvar">Salvar</button><button type="button" class="btn-sec rec-cancelar">Cancelar</button>';
    } else if (ev.target.classList.contains('rec-cancelar')) {
      carregarRec();
    } else if (ev.target.classList.contains('rec-salvar')) {
      var novo = { descricao: item.querySelector('.e-desc').value.trim(), valor: r2(parseFloat(item.querySelector('.e-valor').value) || 0), dia_vencimento: parseInt(item.querySelector('.e-dia').value, 10) };
      if (!novo.descricao || !novo.dia_vencimento) { E.mostrarErro($('rec-erro'), 'Preencha descrição e dia.'); return; }
      var inicioMes = mesAtual() + '-01';
      db.from('recorrentes').update(novo).eq('id', x.id).then(function (r) {
        if (r.error) throw r.error;
        // propaga para as linhas ainda não pagas, do mês atual em diante
        return db.from('despesas').select('id,vencimento').eq('recorrente_id', x.id).eq('pago', false).gte('vencimento', inicioMes);
      }).then(function (r) {
        if (r.error) throw r.error;
        return Promise.all(r.data.map(function (d) {
          return db.from('despesas').update({ descricao: novo.descricao, valor: novo.valor, vencimento: dataNoMes(d.vencimento.slice(0, 7), novo.dia_vencimento) }).eq('id', d.id);
        }));
      }).then(function () { E.mostrarErro($('rec-erro'), ''); carregarRec(); })
        .catch(function (e) { E.mostrarErro($('rec-erro'), 'Erro ao salvar: ' + (e.message || e)); });
    } else if (ev.target.classList.contains('rec-toggle')) {
      db.from('recorrentes').update({ ativo: !x.ativo }).eq('id', x.id).then(function () {
        return x.ativo ? limparFuturas(x.id) : null;   // ao pausar, some o que ainda vai vencer
      }).then(carregarRec);
    } else if (ev.target.classList.contains('rec-del')) {
      E.confirmar(ev.target, 'Confirmar?', function () {
        limparFuturas(x.id).then(function () { return db.from('despesas').update({ recorrente_id: null }).eq('recorrente_id', x.id); })
          .then(function () { return db.from('recorrentes').delete().eq('id', x.id); }).then(carregarRec);
      });
    }
  });

  E.mesMais = mesMais; E.mesAtual = mesAtual; E.dataNoMes = dataNoMes; E.faixa = faixa; E.garantirMes = garantirMes;
  E.abas.despesas = function () { if (!$('d-mes').value) $('d-mes').value = mesAtual(); carregarDesp(); };
})();
