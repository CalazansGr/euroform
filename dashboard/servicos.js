// Serviços: o que a empresa vendeu e as parcelas que o cliente vai pagar.
(function () {
  const { db, $, r2, num, brl, dataBR, diaMes, hoje, soma, esc, erro, confirmar, simNao } = App;
  const CATS = { venda: 'Venda de cadeiras', manutencao: 'Manutenção / reforma', higienizacao: 'Higienização' };
  App.CATS = CATS;
  let ordens = [], editando = null;

  // ---------- carregar e listar ----------
  function carregar() {
    return db.from('ordens').select('*, parcelas(*)').order('data', { ascending: false }).order('criado_em', { ascending: false }).then((r) => {
      if (r.error) { alert('Erro ao carregar serviços: ' + r.error.message); return; }
      ordens = r.data;
      ordens.forEach((o) => o.parcelas.sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1)));
      App.ordens = ordens;
      $('lista-clientes').innerHTML = [...new Set(ordens.map((o) => o.cliente))].sort().map((c) => `<option value="${esc(c)}">`).join('');
      listar();
    });
  }

  function situacao(o) {
    const h = hoje(), abertas = o.parcelas.filter((p) => !p.pago);
    return { aberto: soma(abertas), recebido: soma(o.parcelas.filter((p) => p.pago)), atrasadas: abertas.filter((p) => p.vencimento < h).length };
  }

  function listar() {
    const q = $('s-busca').value.trim().toLowerCase(), mes = $('s-mes').value, sit = $('s-situacao').value;
    const itens = ordens.filter((o) => {
      if (mes && o.data.slice(0, 7) !== mes) return false;
      if (q && (o.cliente + ' ' + (o.descricao || '')).toLowerCase().indexOf(q) < 0) return false;
      const s = situacao(o);
      if (sit === 'aberto' && !s.aberto) return false;
      if (sit === 'atraso' && !s.atrasadas) return false;
      if (sit === 'quitado' && s.aberto) return false;
      return true;
    });
    const tot = soma(itens), rec = soma(itens, (o) => situacao(o).recebido);
    $('s-resumo').innerHTML = itens.length
      ? `<b>${itens.length}</b> ${itens.length > 1 ? 'serviços' : 'serviço'} · total <b>${brl(tot)}</b> · recebido <b class="pos">${brl(rec)}</b> · falta receber <b>${brl(r2(tot - rec))}</b>`
      : '';
    $('s-vazio').hidden = itens.length > 0;
    const h = hoje();
    $('s-lista').innerHTML = itens.map((o) => {
      const parcelas = o.parcelas.map((p) => {
        const atraso = !p.pago && p.vencimento < h;
        return `<div class="parc${p.pago ? ' paga' : ''}${atraso ? ' atraso' : ''}" data-p="${p.id}">` +
          `<span class="parc-info">${diaMes(p.vencimento)} · <b>${brl(Number(p.valor))}</b>${atraso ? ' <em>atrasada</em>' : ''}</span>` +
          `<span class="parc-rot">Recebido?</span>${simNao(p.pago)}</div>`;
      }).join('');
      return `<article class="item" data-id="${o.id}">` +
        `<div class="item-topo"><div><b class="item-nome">${esc(o.cliente)}</b> <small class="tipo">${o.cliente_tipo === 'PJ' ? 'Empresa' : 'PF'}</small>` +
        (o.nf_emitida ? ` <span class="tag-nf">NF${o.nf_numero ? ' nº ' + esc(o.nf_numero) : ' emitida'}</span>` : '') +
        `<div class="item-sub">${CATS[o.categoria]}${o.descricao ? ' · ' + esc(o.descricao) : ''} · ${dataBR(o.data)}</div></div>` +
        `<b class="item-valor">${brl(Number(o.valor))}</b></div>` +
        `<div class="parcs">${parcelas}</div></article>`;
    }).join('');
  }
  ['s-busca', 's-mes', 's-situacao'].forEach((id) => $(id).addEventListener('input', listar));

  // Clique no Não/Sim marca a parcela; clique no resto do cartão abre o serviço.
  $('s-lista').addEventListener('click', (ev) => {
    const card = ev.target.closest('.item'); if (!card) return;
    const o = ordens.find((x) => x.id === card.dataset.id);
    const sn = ev.target.closest('.sn button');
    if (sn) {
      const p = o.parcelas.find((x) => x.id === sn.closest('.parc').dataset.p), sim = sn.classList.contains('sn-sim');
      if (p.pago !== sim) App.marcarParcela(p, sim).then(listar);
      listar();
      return;
    }
    if (ev.target.closest('.parc')) return;
    abrir(o);
  });

  // ---------- formulário ----------
  const dlg = $('dlg-servico');
  const editor = App.editorParcelas($('s-parcelas'), { rotulo: 'Recebido', total: () => num('s-valor'), base: () => $('s-data').value });
  ['s-valor', 's-data'].forEach((id) => $(id).addEventListener('input', () => editor.atualizar()));
  const radio = (v, nome) => { document.querySelector(`input[name=${nome || 's-tipo'}][value="${v}"]`).checked = true; };
  const nfEmitida = () => document.querySelector('input[name=s-nf]:checked').value === '1';
  function mostrarNF() { $('s-nf-campo').hidden = !nfEmitida(); }
  document.querySelectorAll('input[name=s-nf]').forEach((r) => r.addEventListener('change', () => { mostrarNF(); if (nfEmitida()) $('s-nf-numero').focus(); }));

  function abrir(o) {
    editando = o || null;
    $('form-servico').reset(); erro($('s-erro'));
    $('s-titulo').textContent = o ? 'Editar serviço' : 'Novo serviço';
    $('s-excluir').hidden = !o;
    if (o) {
      $('s-cliente').value = o.cliente; radio(o.cliente_tipo); $('s-categoria').value = o.categoria;
      $('s-data').value = o.data; $('s-descricao').value = o.descricao || ''; $('s-valor').value = o.valor; $('s-obs').value = o.obs || '';
      radio(o.nf_emitida ? '1' : '0', 's-nf'); $('s-nf-numero').value = o.nf_numero || '';
      editor.carregar(o.parcelas);
    } else {
      $('s-data').value = hoje(); radio('PF');
      editor.novo('0');
    }
    mostrarNF();
    dlg.showModal();
    if (!o) $('s-cliente').focus();
  }
  $('btn-novo-servico').addEventListener('click', () => abrir(null));

  // cliente já conhecido: preenche PF/empresa como da última vez
  $('s-cliente').addEventListener('change', () => {
    const ant = ordens.find((o) => o.cliente.toLowerCase() === $('s-cliente').value.trim().toLowerCase());
    if (ant) radio(ant.cliente_tipo);
  });

  $('form-servico').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const msg = editor.validar(); if (msg) { erro($('s-erro'), msg); return; }
    const reg = {
      cliente: $('s-cliente').value.trim().replace(/\s+/g, ' '), cliente_tipo: document.querySelector('input[name=s-tipo]:checked').value,
      categoria: $('s-categoria').value, data: $('s-data').value, descricao: $('s-descricao').value.trim() || null,
      valor: r2(num('s-valor')), obs: $('s-obs').value.trim() || null,
      nf_emitida: nfEmitida(), nf_numero: nfEmitida() ? ($('s-nf-numero').value.trim() || null) : null
    };
    const ps = editor.ler(), btn = $('s-salvar'); btn.disabled = true;
    (editando ? db.from('ordens').update(reg).eq('id', editando.id).select('id').single() : db.from('ordens').insert(reg).select('id').single())
      .then((r) => { if (r.error) throw r.error; return App.salvarParcelas('ordem_id', r.data.id, ps); })
      .then(() => { dlg.close(); return carregar(); })
      .catch((e) => erro($('s-erro'), 'Erro ao salvar: ' + (e.message || e)))
      .then(() => { btn.disabled = false; });
  });

  $('s-excluir').addEventListener('click', function () {
    confirmar(this, 'Clique de novo para excluir', () => {
      db.from('ordens').delete().eq('id', editando.id).then((r) => {
        if (r.error) { erro($('s-erro'), 'Erro ao excluir: ' + r.error.message); return; }
        dlg.close(); carregar();
      });
    });
  });

  App.carregarServicos = carregar;
  App.abas.servicos = carregar;
})();
