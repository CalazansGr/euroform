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

  // ---- gera despesas fixas e Simples do mês (sem duplicar) ----
  function garantirMes(mes) {
    if (mes > mesMais(mesAtual(), 1)) return Promise.resolve();
    var f = faixa(mes), ant = faixa(mesMais(mes, -1));
    return Promise.all([
      db.from('recorrentes').select('*').eq('ativo', true),
      db.from('despesas').select('*').gte('vencimento', f[0]).lte('vencimento', f[1]),
      db.from('servicos').select('valor_nf').eq('com_nf', true).gte('data_servico', ant[0]).lte('data_servico', ant[1])
    ]).then(function (r) {
      for (var i = 0; i < 3; i++) if (r[i].error) throw r[i].error;
      var novas = [], ops = [];
      r[0].data.forEach(function (rec) {
        var existe = r[1].data.some(function (d) { return d.recorrente_id === rec.id; });
        if (!existe) novas.push({ tipo: 'recorrente', descricao: rec.descricao, valor: rec.valor, vencimento: dataNoMes(mes, rec.dia_vencimento), recorrente_id: rec.id, pago: false });
      });
      var base = r2(r[2].data.reduce(function (a, s) { return a + Number(s.valor_nf || 0); }, 0));
      var simples = r2(base * E.ALIQ);
      var atual = r[1].data.filter(function (d) { return d.tipo === 'imposto'; })[0];
      if (simples > 0) {
        var desc = 'Simples Nacional (NF de ' + mesMais(mes, -1).split('-').reverse().join('/') + ')';
        if (!atual) novas.push({ tipo: 'imposto', descricao: desc, fornecedor: 'Receita Federal', valor: simples, vencimento: dataNoMes(mes, E.cfg.DIA_VENCIMENTO_SIMPLES || 20), pago: false });
        else if (!atual.pago && Number(atual.valor) !== simples) ops.push(db.from('despesas').update({ valor: simples, descricao: desc }).eq('id', atual.id));
      }
      if (novas.length) ops.push(db.from('despesas').insert(novas));
      return Promise.all(ops);
    }).then(function (rs) {
      (rs || []).forEach(function (x) { if (x && x.error) throw x.error; });
    });
  }

  // ---- listagem ----
  function carregarDesp() {
    var mes = $('d-mes').value || mesAtual(), f = faixa(mes);
    return garantirMes(mes).catch(function (e) { alert('Erro ao gerar despesas do mês: ' + (e.message || e)); })
      .then(function () {
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
    if (d) {
      var sit = d.pago ? 'Paga' : (d.vencimento < E.hoje() ? 'Atrasada' : 'A pagar');
      var origem = d.recorrente_id ? 'gerada automaticamente da despesa fixa' : (d.tipo === 'imposto' ? 'gerada automaticamente (Simples)' : 'lançada manualmente');
      $('desp-info').textContent = 'Situação: ' + sit + ' · ' + origem;
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
    dlg.showModal();
    if (!d) $('x-desc').focus();
  }
  $('btn-nova-desp').addEventListener('click', function () { abrirDesp(null); });
  $('btn-cancelar-desp').addEventListener('click', function () { dlg.close(); });

  $('form-desp').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var reg = {
      descricao: $('x-desc').value.trim(), fornecedor: $('x-forn').value.trim() || null, valor: r2(E.num('x-valor')),
      vencimento: $('x-venc').value, tipo: $('x-tipo').value, servico_id: $('x-os').value || null, pago: $('x-pago').checked
    };
    var q = st.editando ? db.from('despesas').update(reg).eq('id', st.editando.id) : db.from('despesas').insert(reg);
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
      db.from('recorrentes').update({ ativo: !x.ativo }).eq('id', x.id).then(carregarRec);
    } else if (ev.target.classList.contains('rec-del')) {
      E.confirmar(ev.target, 'Confirmar?', function () {
        db.from('despesas').update({ recorrente_id: null }).eq('recorrente_id', x.id)
          .then(function () { return db.from('recorrentes').delete().eq('id', x.id); }).then(carregarRec);
      });
    }
  });

  E.mesMais = mesMais; E.mesAtual = mesAtual; E.dataNoMes = dataNoMes; E.faixa = faixa; E.garantirMes = garantirMes;
  E.abas.despesas = function () { if (!$('d-mes').value) $('d-mes').value = mesAtual(); carregarDesp(); };
})();
