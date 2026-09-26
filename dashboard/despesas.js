// Despesas: o que a empresa vai pagar (fornecedores, terceiros, impostos) e as despesas fixas de todo mês.
(function () {
  const { db, $, r2, num, brl, dataBR, hoje, mesAtual, mesMais, fimDoMes, soma, esc, erro, confirmar, simNao } = App;
  const CATS = { fornecedor: 'Fornecedor / peças', terceiros: 'Mão de obra (estofador...)', imposto: 'Imposto', outros: 'Outros', fixa: 'Fixa' };
  let linhas = [], atrasadas = [], gastoAberto = null;

  // tipos nos filtros e no formulário (a "Fixa" só nasce das despesas fixas)
  $('d-categoria').innerHTML += Object.keys(CATS).map((k) => `<option value="${k}">${CATS[k]}</option>`).join('');
  $('d-cat').innerHTML = Object.keys(CATS).filter((k) => k !== 'fixa').map((k) => `<option value="${k}">${CATS[k]}</option>`).join('');

  // Garante as despesas fixas do mês olhado (qualquer mês, sem limite), do atual e do próximo. A função do banco não duplica.
  function gerarFixos(mes) {
    const meses = [mesAtual(), mesMais(mesAtual(), 1)];
    if (mes && !meses.includes(mes)) meses.push(mes);
    return Promise.all(meses.map((m) => db.rpc('gerar_fixos', { mes: m + '-01' }))).then((rs) => {
      const e = rs.find((r) => r.error); if (e) throw e.error;
    });
  }

  // ---------- carregar e listar (uma linha por parcela que vence no mês) ----------
  function carregar() {
    const mes = $('d-mes').value || mesAtual();
    if (!$('d-mes').value) $('d-mes').value = mes;
    return gerarFixos(mes).catch((e) => alert('Erro ao gerar despesas fixas: ' + (e.message || e)))
      .then(() => {
        const sel = '*, gastos(*, ordens(cliente), parcelas(id,vencimento))', ini = mesAtual() + '-01';
        return Promise.all([
          db.from('parcelas').select(sel).not('gasto_id', 'is', null).gte('vencimento', mes + '-01').lte('vencimento', fimDoMes(mes)).order('vencimento'),
          // contas não pagas que venceram antes deste mês (só aparecem olhando o mês atual ou os próximos)
          mes >= mesAtual() ? db.from('parcelas').select(sel).not('gasto_id', 'is', null).eq('pago', false).lt('vencimento', ini).order('vencimento') : { data: [] }
        ]);
      })
      .then((r) => {
        const e = r && r.find((x) => x.error);
        if (!r || e) { alert('Erro ao carregar despesas: ' + (e ? e.error.message : '')); return; }
        linhas = r[0].data; atrasadas = r[1].data;
        listar();
      });
  }

  function linhaHTML(p, h) {
    const g = p.gastos, todas = g.parcelas.slice().sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1));
    const n = todas.length > 1 ? ` <small>(${todas.findIndex((x) => x.id === p.id) + 1}/${todas.length})</small>` : '';
    const atraso = !p.pago && p.vencimento < h;
    const detalhes = [g.fornecedor, CATS[g.categoria], g.ordens ? 'serviço ' + g.ordens.cliente : ''].filter(Boolean).map(esc).join(' · ');
    return `<article class="item linha${p.pago ? ' paga' : ''}${atraso ? ' atraso' : ''}" data-id="${p.id}">` +
      `<div class="linha-data">${dataBR(p.vencimento)}${atraso ? '<em>atrasada</em>' : ''}</div>` +
      `<div class="linha-desc"><b>${esc(g.descricao)}</b>${n}<div class="item-sub">${detalhes}</div></div>` +
      `<b class="item-valor">${brl(Number(p.valor))}</b>` +
      `<div class="linha-sn"><span class="parc-rot">Pago?</span>${simNao(p.pago)}</div></article>`;
  }

  function listar() {
    const sit = $('d-situacao').value, cat = $('d-categoria').value, h = hoje();
    $('d-total').textContent = brl(soma(linhas));
    $('d-pago').textContent = brl(soma(linhas.filter((p) => p.pago)));
    $('d-falta').textContent = brl(soma(linhas.filter((p) => !p.pago)));
    const filtro = (p) => (!sit || (sit === 'pago') === p.pago) && (!cat || p.gastos.categoria === cat);
    const itens = linhas.filter(filtro);
    $('d-vazio').hidden = itens.length > 0;
    $('d-lista').innerHTML = itens.map((p) => linhaHTML(p, h)).join('');
    // as que forem marcadas como pagas continuam aqui (verdes) até recarregar, para ver que deu certo
    const velhas = atrasadas.filter(filtro), faltam = atrasadas.filter((p) => !p.pago);
    $('d-atrasadas').hidden = !velhas.length;
    $('d-titulo-mes').hidden = !velhas.length;
    $('d-atrasadas-total').textContent = faltam.length ? `· ${faltam.length} ${faltam.length > 1 ? 'contas' : 'conta'}, ${brl(soma(faltam))}` : '· tudo pago ✓';
    $('d-atrasadas-lista').innerHTML = velhas.map((p) => linhaHTML(p, h)).join('');
  }
  ['d-situacao', 'd-categoria'].forEach((id) => $(id).addEventListener('input', listar));
  $('d-mes').addEventListener('input', carregar);

  const cliqueLinha = (ev) => {
    const card = ev.target.closest('.item'); if (!card) return;
    const p = linhas.concat(atrasadas).find((x) => x.id === card.dataset.id);
    const sn = ev.target.closest('.sn button');
    if (sn) {
      const sim = sn.classList.contains('sn-sim');
      if (p.pago !== sim) App.marcarParcela(p, sim).then(listar);
      listar();
      return;
    }
    abrir(p.gastos);
  };
  $('d-lista').addEventListener('click', cliqueLinha);
  $('d-atrasadas-lista').addEventListener('click', cliqueLinha);

  // ---------- formulário de despesa ----------
  const dlg = $('dlg-despesa');
  const editor = App.editorParcelas($('d-parcelas'), { rotulo: 'Paga', total: () => num('d-valor'), base: () => $('d-data').value });
  ['d-valor', 'd-data'].forEach((id) => $(id).addEventListener('input', () => editor.atualizar()));

  function opcoesServicos(atual) {
    const lista = (App.ordens || []).slice(0, 60);
    if (atual && !lista.some((o) => o.id === atual)) { const o = (App.ordens || []).find((x) => x.id === atual); if (o) lista.push(o); }
    $('d-ordem').innerHTML = '<option value="">— não —</option>' + lista.map((o) =>
      `<option value="${o.id}">${esc(o.cliente)} · ${App.CATS[o.categoria]}${o.descricao ? ' · ' + esc(o.descricao) : ''} · ${dataBR(o.data)}</option>`).join('');
  }

  function abrir(g) {
    gastoAberto = g || null;
    $('form-despesa').reset(); erro($('d-erro'));
    $('d-titulo').textContent = g ? 'Editar despesa' : 'Nova despesa';
    $('d-excluir').hidden = !g;
    const fixa = !!g && g.categoria === 'fixa';
    $('d-cat').disabled = fixa;
    $('d-info').hidden = !fixa;
    $('d-info').textContent = fixa ? 'Despesa fixa deste mês. Mudar aqui vale só para este mês; para mudar todos os meses, use "Despesas fixas".' : '';
    $('d-excluir').textContent = fixa ? 'Tirar deste mês' : 'Excluir';
    opcoesServicos(g && g.ordem_id);
    if (!g) {
      $('d-data').value = hoje(); editor.novo('0');
      dlg.showModal(); $('d-descricao').focus(); return;
    }
    // despesa existente: busca todas as parcelas dela (inclusive de outros meses)
    db.from('parcelas').select('*').eq('gasto_id', g.id).then((r) => {
      if (r.error) { alert(r.error.message); return; }
      if (fixa) { $('d-cat').innerHTML += '<option value="fixa">Fixa</option>'; }
      $('d-descricao').value = g.descricao; $('d-fornecedor').value = g.fornecedor || ''; $('d-cat').value = g.categoria;
      $('d-ordem').value = g.ordem_id || '';
      $('d-valor').value = soma(r.data);
      $('d-data').value = r.data.length ? r.data.map((p) => p.vencimento).sort()[0] : hoje();
      editor.carregar(r.data);
      dlg.showModal();
    });
  }
  dlg.addEventListener('close', () => { const o = $('d-cat').querySelector('option[value=fixa]'); if (o) o.remove(); $('d-cat').disabled = false; });
  $('btn-nova-despesa').addEventListener('click', () => abrir(null));

  $('form-despesa').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const msg = editor.validar(); if (msg) { erro($('d-erro'), msg); return; }
    const reg = {
      descricao: $('d-descricao').value.trim(), fornecedor: $('d-fornecedor').value.trim() || null,
      categoria: $('d-cat').value, ordem_id: $('d-ordem').value || null
    };
    const ps = editor.ler(), btn = $('d-salvar'); btn.disabled = true;
    const g = gastoAberto;
    (g ? db.from('gastos').update(reg).eq('id', g.id).select('id').single() : db.from('gastos').insert(reg).select('id').single())
      .then((r) => { if (r.error) throw r.error; return App.salvarParcelas('gasto_id', r.data.id, ps); })
      .then(() => {
        dlg.close();
        const m = ps.map((p) => p.vencimento).sort()[0].slice(0, 7);   // mostra o mês da 1ª parcela
        if (!g && m !== $('d-mes').value) $('d-mes').value = m;
        carregar(); atualizarFornecedores();
      })
      .catch((e) => erro($('d-erro'), 'Erro ao salvar: ' + (e.message || e)))
      .then(() => { btn.disabled = false; });
  });

  $('d-excluir').addEventListener('click', function () {
    const g = gastoAberto; if (!g) return;
    confirmar(this, 'Clique de novo para confirmar', () => {
      // despesa fixa: apaga só as parcelas (o registro do mês fica, então ela não volta sozinha)
      const q = g.categoria === 'fixa' ? db.from('parcelas').delete().eq('gasto_id', g.id) : db.from('gastos').delete().eq('id', g.id);
      q.then((r) => {
        if (r.error) { erro($('d-erro'), 'Erro ao excluir: ' + r.error.message); return; }
        dlg.close(); carregar();
      });
    });
  });

  function atualizarFornecedores() {
    db.from('gastos').select('fornecedor').not('fornecedor', 'is', null).limit(1000).then((r) => {
      if (r.error) return;
      $('lista-fornecedores').innerHTML = [...new Set(r.data.map((x) => x.fornecedor))].sort().map((f) => `<option value="${esc(f)}">`).join('');
    });
  }

  // ---------- despesas fixas ----------
  const dlgF = $('dlg-fixos');
  let fixos = [];
  function carregarFixos() {
    return db.from('gastos_fixos').select('*').order('dia').then((r) => {
      if (r.error) { erro($('f-erro'), r.error.message); return; }
      fixos = r.data;
      $('f-lista').innerHTML = fixos.length ? fixos.map((f) =>
        `<div class="fixo${f.ativo ? '' : ' pausado'}" data-id="${f.id}"><b>${esc(f.descricao)}</b><span>${brl(Number(f.valor))}</span><span>dia ${f.dia}</span>` +
        `<button type="button" class="sec mini f-editar">Editar</button><button type="button" class="sec mini f-pausar">${f.ativo ? 'Pausar' : 'Reativar'}</button>` +
        `<button type="button" class="perigo mini f-excluir">Excluir</button></div>`).join('') : '<p class="vazio">Nenhuma despesa fixa ainda.</p>';
    });
  }
  // Tira as despesas geradas por esta fixa que ainda não foram pagas, do mês que vem em diante.
  function limparFuturos(id) {
    const prox = mesMais(mesAtual(), 1) + '-01';
    return db.from('gastos').select('id, parcelas(pago)').eq('fixo_id', id).gte('mes_ref', prox).then((r) => {
      if (r.error) throw r.error;
      const ids = r.data.filter((g) => !g.parcelas.some((p) => p.pago)).map((g) => g.id);
      return ids.length ? db.from('gastos').delete().in('id', ids) : null;
    });
  }
  $('btn-fixos').addEventListener('click', () => { erro($('f-erro')); carregarFixos(); dlgF.showModal(); });
  dlgF.addEventListener('close', carregar);
  $('form-fixo').addEventListener('submit', (ev) => {
    ev.preventDefault();
    db.from('gastos_fixos').insert({ descricao: $('f-descricao').value.trim(), valor: r2(num('f-valor')), dia: parseInt($('f-dia').value, 10) }).then((r) => {
      if (r.error) { erro($('f-erro'), r.error.message); return; }
      $('form-fixo').reset(); carregarFixos();
    });
  });
  $('f-lista').addEventListener('click', (ev) => {
    const item = ev.target.closest('.fixo'); if (!item) return;
    const f = fixos.find((x) => x.id === item.dataset.id), b = ev.target;
    if (b.classList.contains('f-editar')) {
      item.classList.add('editando');
      item.innerHTML = `<input class="e-desc" value="${esc(f.descricao)}"><input class="e-valor" type="number" min="0" step="0.01" value="${f.valor}">` +
        `<input class="e-dia" type="number" min="1" max="31" value="${f.dia}"><button type="button" class="mini f-salvar">Salvar</button><button type="button" class="sec mini f-cancelar">Cancelar</button>`;
    } else if (b.classList.contains('f-cancelar')) {
      carregarFixos();
    } else if (b.classList.contains('f-salvar')) {
      const novo = { descricao: item.querySelector('.e-desc').value.trim(), valor: r2(num(item.querySelector('.e-valor'))), dia: parseInt(item.querySelector('.e-dia').value, 10) };
      if (!novo.descricao || !(novo.dia >= 1 && novo.dia <= 31)) { erro($('f-erro'), 'Preencha a descrição e um dia entre 1 e 31.'); return; }
      // muda a fixa e também as despesas dela ainda não pagas, deste mês em diante
      db.from('gastos_fixos').update(novo).eq('id', f.id)
        .then((r) => { if (r.error) throw r.error; return db.from('gastos').select('id, mes_ref, parcelas(*)').eq('fixo_id', f.id).gte('mes_ref', mesAtual() + '-01'); })
        .then((r) => {
          if (r.error) throw r.error;
          return Promise.all(r.data.map((g) => {
            const mes = g.mes_ref.slice(0, 7), dia = Math.min(novo.dia, parseInt(fimDoMes(mes).slice(8), 10));
            const abertas = g.parcelas.filter((p) => !p.pago);
            return Promise.all([db.from('gastos').update({ descricao: novo.descricao }).eq('id', g.id)].concat(abertas.map((p) =>
              db.from('parcelas').update({ valor: novo.valor, vencimento: mes + '-' + String(dia).padStart(2, '0') }).eq('id', p.id))));
          }));
        })
        .then(() => { erro($('f-erro')); carregarFixos(); })
        .catch((e) => erro($('f-erro'), 'Erro ao salvar: ' + (e.message || e)));
    } else if (b.classList.contains('f-pausar')) {
      db.from('gastos_fixos').update({ ativo: !f.ativo }).eq('id', f.id)
        .then(() => (f.ativo ? limparFuturos(f.id) : null)).then(carregarFixos);
    } else if (b.classList.contains('f-excluir')) {
      confirmar(b, 'Confirmar?', () => { limparFuturos(f.id).then(() => db.from('gastos_fixos').delete().eq('id', f.id)).then(carregarFixos); });
    }
  });

  App.gerarFixos = gerarFixos;
  App.abas.despesas = () => { carregar(); atualizarFornecedores(); if (!App.ordens) App.carregarServicos(); };
})();
