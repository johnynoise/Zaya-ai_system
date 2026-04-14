/**
 * AçaíPrice — Sistema de Precificação
 * =====================================
 * Arquitetura: SPA puro com localStorage
 * Estrutura pensada para migração futura para backend
 * (substitua as funções de Storage pela sua API REST)
 */

'use strict';

// ============================================================
//  CAMADA DE DADOS — substitua por chamadas fetch() no futuro
// ============================================================

const Storage = {
  /** Retorna insumos do localStorage */
  getInsumos() {
    return JSON.parse(localStorage.getItem('acaiprice_insumos') || '[]');
  },
  /** Salva insumos no localStorage */
  saveInsumos(data) {
    localStorage.setItem('acaiprice_insumos', JSON.stringify(data));
  },
  /** Retorna produtos do localStorage */
  getProdutos() {
    return JSON.parse(localStorage.getItem('acaiprice_produtos') || '[]');
  },
  /** Salva produtos no localStorage */
  saveProdutos(data) {
    localStorage.setItem('acaiprice_produtos', JSON.stringify(data));
  },
  /** Limpa todos os dados */
  clearAll() {
    localStorage.removeItem('acaiprice_insumos');
    localStorage.removeItem('acaiprice_produtos');
  }
};

// ============================================================
//  ESTADO GLOBAL DA APLICAÇÃO
// ============================================================

const App = {
  insumos: [],
  produtos: [],
  composicaoTemp: [],   // composição em edição no formulário
  paginaAtual: 'dashboard',
};

// ============================================================
//  UTILITÁRIOS
// ============================================================

/** Gera UUID simples */
function gerarId() {
  return '_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

/** Formata número como moeda R$ */
function formatBRL(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

/** Formata número com casas decimais */
function formatNum(valor, dec = 3) {
  return parseFloat((valor || 0).toFixed(dec));
}

/** Retorna badge HTML para categoria */
function badgeCategoria(cat) {
  const map = {
    fruta: 'Fruta / Polpa',
    laticinios: 'Laticínios',
    complemento: 'Complemento',
    embalagem: 'Embalagem',
    outros: 'Outros',
  };
  return `<span class="tag tag-${cat}">${map[cat] || cat}</span>`;
}

// ============================================================
//  TOAST (notificações)
// ============================================================

let toastTimer = null;

function showToast(msg, tipo = 'success') {
  const el = document.getElementById('toast');
  const msgEl = document.getElementById('toastMsg');
  msgEl.textContent = msg;
  el.classList.remove('hidden', 'error');
  if (tipo === 'error') el.classList.add('error');
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ============================================================
//  MODAL DE CONFIRMAÇÃO
// ============================================================

function confirmar(titulo, mensagem) {
  return new Promise((resolve) => {
    document.getElementById('modalTitle').textContent = titulo;
    document.getElementById('modalMessage').textContent = mensagem;
    document.getElementById('modalConfirm').classList.remove('hidden');

    const btnOk     = document.getElementById('modalConfirmBtn');
    const btnCancel = document.getElementById('modalCancel');

    function cleanup(result) {
      document.getElementById('modalConfirm').classList.add('hidden');
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      resolve(result);
    }

    function onOk()     { cleanup(true);  }
    function onCancel() { cleanup(false); }

    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
  });
}

// ============================================================
//  NAVEGAÇÃO
// ============================================================

function navegarPara(pagina) {
  // Desativa tudo
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  // Ativa página alvo
  const pageEl = document.getElementById(`page-${pagina}`);
  if (pageEl) pageEl.classList.add('active');

  const navEl = document.querySelector(`[data-page="${pagina}"]`);
  if (navEl) navEl.classList.add('active');

  App.paginaAtual = pagina;

  // Fecha sidebar mobile
  document.querySelector('.sidebar').classList.remove('open');

  // Renderizações específicas por página
  if (pagina === 'dashboard') renderDashboard();
  if (pagina === 'calculos')  renderCalculos();
}

// ============================================================
//  CÁLCULOS DE PRECIFICAÇÃO
// ============================================================

/**
 * Calcula os valores de precificação de um produto.
 * Centralize aqui toda a lógica de cálculo para
 * facilitar futura migração para backend.
 */
function calcularProduto(produto) {
  const custoInsumos = (produto.composicao || []).reduce((acc, item) => {
    const ins = App.insumos.find(i => i.id === item.insumoId);
    if (!ins) return acc;
    return acc + (ins.custoUnitario * item.quantidade);
  }, 0);

  const despesas    = parseFloat(produto.despesas || 0);
  const custoTotal  = custoInsumos + despesas;
  const margem      = Math.max(0, parseFloat(produto.margem || 0));
  const markup      = margem / 100;
  const precoSugerido = custoTotal * (1 + markup);   // margem aplicada sobre o custo
  const lucro       = custoTotal * markup;

  return { custoInsumos, despesas, custoTotal, margem: produto.margem, precoSugerido, lucro };
}

// ============================================================
//  DASHBOARD
// ============================================================

function renderDashboard() {
  const stats = document.getElementById('statsGrid');
  const numInsumos  = App.insumos.length;
  const numProdutos = App.produtos.length;

  let menorPreco = Infinity, maiorLucro = -Infinity;
  App.produtos.forEach(p => {
    const c = calcularProduto(p);
    if (c.precoSugerido < menorPreco) menorPreco = c.precoSugerido;
    if (c.lucro > maiorLucro) maiorLucro = c.lucro;
  });

  stats.innerHTML = `
    <div class="stat-card" style="--accent-color: var(--acai-light)">
      <div class="stat-label">Insumos Cadastrados</div>
      <div class="stat-value">${numInsumos}</div>
      <div class="stat-sub">matérias-primas</div>
    </div>
    <div class="stat-card" style="--accent-color: var(--green)">
      <div class="stat-label">Produtos Cadastrados</div>
      <div class="stat-value">${numProdutos}</div>
      <div class="stat-sub">itens no catálogo</div>
    </div>
    <div class="stat-card" style="--accent-color: var(--coral)">
      <div class="stat-label">Menor Preço Sugerido</div>
      <div class="stat-value" style="font-size:1.3rem">${numProdutos ? formatBRL(menorPreco) : '—'}</div>
      <div class="stat-sub">produto mais barato</div>
    </div>
    <div class="stat-card" style="--accent-color: #80b3ff">
      <div class="stat-label">Maior Lucro / Unidade</div>
      <div class="stat-value" style="font-size:1.3rem">${numProdutos ? formatBRL(maiorLucro) : '—'}</div>
      <div class="stat-sub">produto mais rentável</div>
    </div>
  `;

  // Produtos no dashboard
  const dashProd = document.getElementById('dashProdutos');
  if (App.produtos.length === 0) {
    dashProd.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:12px 0">Nenhum produto cadastrado.</p>';
  } else {
    dashProd.innerHTML = App.produtos.map(p => {
      const c = calcularProduto(p);
      return `<div class="dash-item" onclick="navegarPara('calculos')">
        <span class="dash-item-name">${p.nome} ${p.volume ? `<small style="color:var(--text-3)">(${p.volume})</small>` : ''}</span>
        <span class="dash-item-value">${formatBRL(c.precoSugerido)}</span>
      </div>`;
    }).join('');
  }

  // Insumos no dashboard (top por custo unit.)
  const dashIns = document.getElementById('dashInsumos');
  const sorted = [...App.insumos].sort((a, b) => b.custoUnitario - a.custoUnitario).slice(0, 6);
  if (sorted.length === 0) {
    dashIns.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:12px 0">Nenhum insumo cadastrado.</p>';
  } else {
    dashIns.innerHTML = sorted.map(i => `
      <div class="dash-item">
        <span class="dash-item-name">${i.nome}</span>
        <span class="dash-item-value">${formatBRL(i.custoUnitario)} / ${i.unidade}</span>
      </div>`).join('');
  }
}

// ============================================================
//  INSUMOS
// ============================================================

/** Renderiza a tabela de insumos com filtro opcional */
function renderInsumos(filtro = '') {
  const tbody = document.getElementById('tbodyInsumos');
  const lista = filtro
    ? App.insumos.filter(i => i.nome.toLowerCase().includes(filtro.toLowerCase()))
    : App.insumos;

  if (lista.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Nenhum insumo encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(ins => `
    <tr>
      <td><strong style="color:var(--text)">${ins.nome}</strong></td>
      <td>${badgeCategoria(ins.categoria)}</td>
      <td>${formatNum(ins.qtdComprada, 3)} ${ins.unidade}</td>
      <td>${formatBRL(ins.precoPago)}</td>
      <td style="color:var(--green-light);font-weight:600;font-family:'Syne',sans-serif">${formatBRL(ins.custoUnitario)} / ${ins.unidade}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn-edit" onclick="editarInsumo('${ins.id}')">✎ Editar</button>
          <button class="btn-delete" onclick="excluirInsumo('${ins.id}')">✕</button>
        </div>
      </td>
    </tr>
  `).join('');
}

/** Preenche o formulário para edição */
function editarInsumo(id) {
  const ins = App.insumos.find(i => i.id === id);
  if (!ins) return;

  document.getElementById('insumoId').value          = ins.id;
  document.getElementById('insumoNome').value        = ins.nome;
  document.getElementById('insumoCategoria').value   = ins.categoria;
  document.getElementById('insumoUnidade').value     = ins.unidade;
  document.getElementById('insumoQtd').value         = ins.qtdComprada;
  document.getElementById('insumoPreco').value       = ins.precoPago;
  document.getElementById('insumoCustoUnitario').value = formatBRL(ins.custoUnitario) + ' / ' + ins.unidade;
  document.getElementById('formInsumoTitulo').textContent = 'Editar Insumo';

  // Expande o formulário se minimizado
  document.getElementById('formInsumoBody').style.display = 'block';
  document.getElementById('btnToggleFormInsumo').textContent = '−';

  document.getElementById('insumoNome').focus();
  document.getElementById('formInsumoCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Exclui insumo com confirmação */
async function excluirInsumo(id) {
  const ins = App.insumos.find(i => i.id === id);
  if (!ins) return;
  const ok = await confirmar('Excluir Insumo', `Deseja excluir "${ins.nome}"? Esta ação não pode ser desfeita.`);
  if (!ok) return;

  App.insumos = App.insumos.filter(i => i.id !== id);
  Storage.saveInsumos(App.insumos);
  renderInsumos();
  atualizarSelectInsumos();
  showToast(`"${ins.nome}" excluído.`);
}

/** Limpa o formulário de insumos */
function resetFormInsumo() {
  document.getElementById('formInsumo').reset();
  document.getElementById('insumoId').value = '';
  document.getElementById('insumoCustoUnitario').value = '';
  document.getElementById('formInsumoTitulo').textContent = 'Novo Insumo';
}

/** Atualiza o custo unitário em tempo real */
function atualizarCustoUnitario() {
  const qtd   = parseFloat(document.getElementById('insumoQtd').value) || 0;
  const preco = parseFloat(document.getElementById('insumoPreco').value) || 0;
  const unid  = document.getElementById('insumoUnidade').value;
  const custo = qtd > 0 ? preco / qtd : 0;
  document.getElementById('insumoCustoUnitario').value = qtd > 0
    ? `${formatBRL(custo)} / ${unid}`
    : '';
}

// ============================================================
//  FORMULÁRIO DE INSUMOS — submit
// ============================================================

document.getElementById('formInsumo').addEventListener('submit', function (e) {
  e.preventDefault();

  const id    = document.getElementById('insumoId').value;
  const nome  = document.getElementById('insumoNome').value.trim();
  const cat   = document.getElementById('insumoCategoria').value;
  const unid  = document.getElementById('insumoUnidade').value;
  const qtd   = parseFloat(document.getElementById('insumoQtd').value);
  const preco = parseFloat(document.getElementById('insumoPreco').value);

  if (!nome || isNaN(qtd) || isNaN(preco) || qtd <= 0 || preco <= 0) {
    showToast('Preencha todos os campos obrigatórios corretamente.', 'error');
    return;
  }

  const custoUnitario = preco / qtd;

  if (id) {
    // Atualiza insumo existente
    const idx = App.insumos.findIndex(i => i.id === id);
    if (idx !== -1) {
      App.insumos[idx] = { ...App.insumos[idx], nome, categoria: cat, unidade: unid, qtdComprada: qtd, precoPago: preco, custoUnitario };
    }
    showToast(`"${nome}" atualizado!`);
  } else {
    // Cria novo insumo
    App.insumos.push({ id: gerarId(), nome, categoria: cat, unidade: unid, qtdComprada: qtd, precoPago: preco, custoUnitario });
    showToast(`"${nome}" cadastrado!`);
  }

  Storage.saveInsumos(App.insumos);
  resetFormInsumo();
  renderInsumos();
  atualizarSelectInsumos();
});

// ============================================================
//  COMPOSIÇÃO TEMPORÁRIA (formulário de produto)
// ============================================================

/** Atualiza hint de unidade no select de composição */
function atualizarUnidadeHint() {
  const sel   = document.getElementById('selectInsumoComposicao');
  const id    = sel.value;
  const hint  = document.getElementById('unidadeHintComposicao');
  const ins   = App.insumos.find(i => i.id === id);
  hint.textContent = ins ? ins.unidade : '—';
}

/** Popula o select de insumos do formulário de produto */
function atualizarSelectInsumos() {
  const sel = document.getElementById('selectInsumoComposicao');
  const val = sel.value;
  sel.innerHTML = '<option value="">Selecione um insumo...</option>';
  App.insumos.forEach(ins => {
    const opt = document.createElement('option');
    opt.value = ins.id;
    opt.textContent = `${ins.nome} (${ins.unidade})`;
    sel.appendChild(opt);
  });
  sel.value = val;
}

/** Renderiza a tabela de composição temporária no formulário */
function renderComposicaoTemp() {
  const tbody = document.getElementById('tbodyComposicao');

  if (App.composicaoTemp.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Nenhum insumo adicionado.</td></tr>`;
    document.getElementById('custoTotalComposicao').textContent = formatBRL(0);
    return;
  }

  let total = 0;
  tbody.innerHTML = App.composicaoTemp.map((item, idx) => {
    const ins = App.insumos.find(i => i.id === item.insumoId);
    if (!ins) return '';
    const custo = ins.custoUnitario * item.quantidade;
    total += custo;
    return `
      <tr>
        <td>${ins.nome}</td>
        <td>${formatNum(item.quantidade, 3)}</td>
        <td>${ins.unidade}</td>
        <td style="color:var(--coral-light)">${formatBRL(custo)}</td>
        <td><button class="btn-delete" onclick="removerItemComposicao(${idx})">✕</button></td>
      </tr>
    `;
  }).join('');

  document.getElementById('custoTotalComposicao').textContent = formatBRL(total);
}

/** Remove item da composição temporária */
function removerItemComposicao(idx) {
  App.composicaoTemp.splice(idx, 1);
  renderComposicaoTemp();
}

// ============================================================
//  PRODUTOS
// ============================================================

/** Renderiza os cards de produtos */
function renderProdutos(filtro = '') {
  const container = document.getElementById('listaProdutos');
  const lista = filtro
    ? App.produtos.filter(p => p.nome.toLowerCase().includes(filtro.toLowerCase()))
    : App.produtos;

  if (lista.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">◎</div>
        <p>Nenhum produto encontrado.</p>
      </div>`;
    return;
  }

  container.innerHTML = lista.map(prod => {
    const c = calcularProduto(prod);
    return `
      <div class="produto-card">
        <div class="produto-card-header">
          <div class="produto-nome">${prod.nome}</div>
          ${prod.volume ? `<span class="produto-volume">${prod.volume}</span>` : ''}
        </div>
        <div class="produto-desc">${prod.descricao || '&nbsp;'}</div>
        <div class="produto-stats">
          <div class="produto-stat">
            <div class="produto-stat-label">Custo Total</div>
            <div class="produto-stat-val val-custo">${formatBRL(c.custoTotal)}</div>
          </div>
          <div class="produto-stat">
            <div class="produto-stat-label">Preço Sugerido</div>
            <div class="produto-stat-val val-preco">${formatBRL(c.precoSugerido)}</div>
          </div>
          <div class="produto-stat">
            <div class="produto-stat-label">Lucro/Un.</div>
            <div class="produto-stat-val val-lucro">${formatBRL(c.lucro)}</div>
          </div>
          <div class="produto-stat">
            <div class="produto-stat-label">Margem</div>
            <div class="produto-stat-val val-margem">${prod.margem}%</div>
          </div>
        </div>
        <div class="produto-actions">
          <button class="btn-edit" onclick="editarProduto('${prod.id}')">✎ Editar</button>
          <button class="btn-small" onclick="verCalculo('${prod.id}')">📊 Análise</button>
          <button class="btn-delete" onclick="excluirProduto('${prod.id}')">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

/** Navega para a página de cálculos já selecionando o produto */
function verCalculo(id) {
  navegarPara('calculos');
  document.getElementById('selectProdutoCalculo').value = id;
  renderDetalheCalculo(id);
}

/** Edita um produto existente */
function editarProduto(id) {
  const prod = App.produtos.find(p => p.id === id);
  if (!prod) return;

  document.getElementById('produtoId').value          = prod.id;
  document.getElementById('produtoNome').value        = prod.nome;
  document.getElementById('produtoVolume').value      = prod.volume || '';
  document.getElementById('produtoMargem').value      = prod.margem;
  document.getElementById('produtoDespesas').value    = prod.despesas;
  document.getElementById('produtoDescricao').value   = prod.descricao || '';
  document.getElementById('formProdutoTitulo').textContent = 'Editar Produto';

  // Carrega composição na temp
  App.composicaoTemp = (prod.composicao || []).map(item => ({ ...item }));
  renderComposicaoTemp();

  document.getElementById('formProdutoBody').style.display = 'block';
  document.getElementById('btnToggleFormProduto').textContent = '−';
  document.getElementById('produtoNome').focus();
  document.getElementById('formProdutoCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Exclui produto com confirmação */
async function excluirProduto(id) {
  const prod = App.produtos.find(p => p.id === id);
  if (!prod) return;
  const ok = await confirmar('Excluir Produto', `Deseja excluir "${prod.nome}"?`);
  if (!ok) return;

  App.produtos = App.produtos.filter(p => p.id !== id);
  Storage.saveProdutos(App.produtos);
  renderProdutos();
  atualizarSelectCalculo();
  showToast(`"${prod.nome}" excluído.`);
}

/** Limpa formulário de produto */
function resetFormProduto() {
  document.getElementById('formProduto').reset();
  document.getElementById('produtoId').value = '';
  document.getElementById('produtoMargem').value = 80;
  document.getElementById('produtoDespesas').value = 0;
  document.getElementById('formProdutoTitulo').textContent = 'Novo Produto';
  App.composicaoTemp = [];
  renderComposicaoTemp();
}

// ============================================================
//  FORMULÁRIO DE PRODUTOS — submit
// ============================================================

document.getElementById('formProduto').addEventListener('submit', function (e) {
  e.preventDefault();

  const id       = document.getElementById('produtoId').value;
  const nome     = document.getElementById('produtoNome').value.trim();
  const volume   = document.getElementById('produtoVolume').value.trim();
  const margem   = parseFloat(document.getElementById('produtoMargem').value) || 0;
  const despesas = parseFloat(document.getElementById('produtoDespesas').value) || 0;
  const descricao = document.getElementById('produtoDescricao').value.trim();

  if (!nome) {
    showToast('Informe o nome do produto.', 'error');
    return;
  }

  const composicao = App.composicaoTemp.map(item => ({ ...item }));

  if (id) {
    const idx = App.produtos.findIndex(p => p.id === id);
    if (idx !== -1) {
      App.produtos[idx] = { ...App.produtos[idx], nome, volume, margem, despesas, descricao, composicao };
    }
    showToast(`"${nome}" atualizado!`);
  } else {
    App.produtos.push({ id: gerarId(), nome, volume, margem, despesas, descricao, composicao });
    showToast(`"${nome}" cadastrado!`);
  }

  Storage.saveProdutos(App.produtos);
  resetFormProduto();
  renderProdutos();
  atualizarSelectCalculo();
});

// ============================================================
//  PÁGINA DE CÁLCULOS
// ============================================================

/** Popula o select de produtos na página de cálculos */
function atualizarSelectCalculo() {
  const sel = document.getElementById('selectProdutoCalculo');
  const val = sel.value;
  sel.innerHTML = '<option value="">— Selecione um produto —</option>';
  App.produtos.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.nome}${p.volume ? ` (${p.volume})` : ''}`;
    sel.appendChild(opt);
  });
  sel.value = val;
}

function renderCalculos() {
  atualizarSelectCalculo();
  const sel = document.getElementById('selectProdutoCalculo');

  if (App.produtos.length === 0) {
    document.getElementById('semProdutos').classList.remove('hidden');
    document.getElementById('painelCalculo').classList.add('hidden');
    document.getElementById('calc-selector') && null;
    return;
  }

  document.getElementById('semProdutos').classList.add('hidden');

  if (sel.value) {
    renderDetalheCalculo(sel.value);
  } else {
    document.getElementById('painelCalculo').classList.add('hidden');
  }
}

/** Renderiza o painel detalhado de cálculo para um produto */
function renderDetalheCalculo(produtoId) {
  const prod = App.produtos.find(p => p.id === produtoId);
  if (!prod) return;

  const c = calcularProduto(prod);

  document.getElementById('painelCalculo').classList.remove('hidden');
  document.getElementById('calcNomeProduto').textContent   = prod.nome;
  document.getElementById('calcVolumeProduto').textContent = prod.volume || '—';
  document.getElementById('calcVolumeProduto').className   = 'tag tag-embalagem';

  document.getElementById('calcCustoInsumos').textContent  = formatBRL(c.custoInsumos);
  document.getElementById('calcDespesas').textContent      = formatBRL(c.despesas);
  document.getElementById('calcCustoTotal').textContent    = formatBRL(c.custoTotal);
  document.getElementById('calcMargem').textContent        = prod.margem + '%';
  document.getElementById('calcPrecoSugerido').textContent = formatBRL(c.precoSugerido);
  document.getElementById('calcLucro').textContent         = formatBRL(c.lucro);

  // Tabela detalhada por insumo
  const tbody = document.getElementById('tbodyDetalheCalculo');
  if (!prod.composicao || prod.composicao.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Nenhum insumo na composição.</td></tr>`;
  } else {
    tbody.innerHTML = prod.composicao.map(item => {
      const ins = App.insumos.find(i => i.id === item.insumoId);
      if (!ins) return `<tr><td colspan="6" style="color:var(--text-muted)">Insumo removido</td></tr>`;
      const custoItem = ins.custoUnitario * item.quantidade;
      const pct = c.custoInsumos > 0 ? (custoItem / c.custoInsumos * 100) : 0;
      return `
        <tr>
          <td style="color:var(--text)">${ins.nome}</td>
          <td>${badgeCategoria(ins.categoria)}</td>
          <td>${formatNum(item.quantidade, 3)} ${ins.unidade}</td>
          <td>${formatBRL(ins.custoUnitario)} / ${ins.unidade}</td>
          <td style="color:var(--coral-light);font-weight:600">${formatBRL(custoItem)}</td>
          <td>
            <div class="pct-bar">
              <div class="pct-bar-track">
                <div class="pct-bar-fill" style="width:${Math.min(pct,100)}%"></div>
              </div>
              <span class="pct-label">${pct.toFixed(1)}%</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Simulador de margem
  const slider = document.getElementById('simMargem');
  slider.value = prod.margem;
  atualizarSimulador(prod, c.custoTotal);
}

/** Atualiza os valores do simulador de margem */
function atualizarSimulador(prod, custoTotal) {
  const margem = Math.max(0, parseFloat(document.getElementById('simMargem').value) || 0);
  const custoBase = Math.max(0, parseFloat(custoTotal) || 0);
  const markup = margem / 100;
  document.getElementById('simMargemVal').textContent = margem + '%';
  const preco = custoBase * (1 + markup);
  const lucro = custoBase * markup;
  document.getElementById('simPreco').textContent = formatBRL(preco);
  document.getElementById('simLucro').textContent = formatBRL(lucro);
}

// ============================================================
//  EXPORTAR / IMPRIMIR
// ============================================================

function exportarRelatorio() {
  // Monta uma página de impressão limpa em nova aba
  const linhas = App.produtos.map(prod => {
    const c = calcularProduto(prod);
    return `
      <tr>
        <td>${prod.nome}</td>
        <td>${prod.volume || '—'}</td>
        <td>${formatBRL(c.custoInsumos)}</td>
        <td>${formatBRL(c.despesas)}</td>
        <td>${formatBRL(c.custoTotal)}</td>
        <td>${prod.margem}%</td>
        <td>${formatBRL(c.precoSugerido)}</td>
        <td>${formatBRL(c.lucro)}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8"><title>AçaíPrice — Relatório</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #222; }
      h1 { color: #7c3d9c; margin-bottom: 4px; }
      p { color: #888; margin-bottom: 16px; }
      table { width:100%; border-collapse:collapse; }
      th { background:#7c3d9c; color:#fff; padding:8px; text-align:left; font-size:11px; }
      td { padding:7px 8px; border-bottom:1px solid #eee; }
      tr:hover td { background:#faf5ff; }
    </style></head><body>
    <h1>🫐 AçaíPrice — Relatório de Precificação</h1>
    <p>Gerado em ${new Date().toLocaleString('pt-BR')}</p>
    <table>
      <thead>
        <tr>
          <th>Produto</th><th>Volume</th><th>Custo Insumos</th>
          <th>Despesas</th><th>Custo Total</th><th>Margem</th>
          <th>Preço Sugerido</th><th>Lucro/Un.</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
    <script>window.onload = () => { window.print(); }<\/script>
    </body></html>
  `;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

// ============================================================
//  DADOS MOCK (carregados se não houver dados salvos)
// ============================================================

function carregarDadosMock() {
  const insId1 = gerarId(), insId2 = gerarId(), insId3 = gerarId(),
        insId4 = gerarId(), insId5 = gerarId(), insId6 = gerarId(),
        insId7 = gerarId(), insId8 = gerarId();

  const insumos = [
    { id: insId1, nome: 'Polpa de Açaí Grosso',   categoria: 'fruta',       unidade: 'kg',  qtdComprada: 10,   precoPago: 85.00,  custoUnitario: 8.50   },
    { id: insId2, nome: 'Leite Condensado',        categoria: 'laticinios',  unidade: 'g',   qtdComprada: 395,  precoPago: 5.99,   custoUnitario: 0.01516 },
    { id: insId3, nome: 'Leite em Pó Integral',    categoria: 'laticinios',  unidade: 'g',   qtdComprada: 400,  precoPago: 12.90,  custoUnitario: 0.03225 },
    { id: insId4, nome: 'Granola Premium',         categoria: 'complemento', unidade: 'g',   qtdComprada: 500,  precoPago: 9.50,   custoUnitario: 0.019   },
    { id: insId5, nome: 'Morango Congelado',       categoria: 'fruta',       unidade: 'g',   qtdComprada: 1000, precoPago: 18.00,  custoUnitario: 0.018   },
    { id: insId6, nome: 'Garrafa PET 500ml',       categoria: 'embalagem',   unidade: 'un',  qtdComprada: 100,  precoPago: 38.00,  custoUnitario: 0.38    },
    { id: insId7, nome: 'Tampa Rosca',             categoria: 'embalagem',   unidade: 'un',  qtdComprada: 100,  precoPago: 8.00,   custoUnitario: 0.08    },
    { id: insId8, nome: 'Etiqueta Personalizada',  categoria: 'embalagem',   unidade: 'un',  qtdComprada: 200,  precoPago: 25.00,  custoUnitario: 0.125   },
  ];

  const prodId1 = gerarId(), prodId2 = gerarId(), prodId3 = gerarId();

  const produtos = [
    {
      id: prodId1,
      nome: 'Açaí Tradicional',
      volume: '300ml',
      margem: 75,
      despesas: 0.20,
      descricao: 'Açaí puro com granola',
      composicao: [
        { insumoId: insId1, quantidade: 0.25 },   // 250g de polpa
        { insumoId: insId4, quantidade: 30   },   // 30g granola
        { insumoId: insId6, quantidade: 1    },   // garrafa
        { insumoId: insId7, quantidade: 1    },   // tampa
        { insumoId: insId8, quantidade: 1    },   // etiqueta
      ]
    },
    {
      id: prodId2,
      nome: 'Açaí Cremoso',
      volume: '500ml',
      margem: 80,
      despesas: 0.30,
      descricao: 'Com leite condensado e granola',
      composicao: [
        { insumoId: insId1, quantidade: 0.38 },
        { insumoId: insId2, quantidade: 60   },
        { insumoId: insId3, quantidade: 20   },
        { insumoId: insId4, quantidade: 40   },
        { insumoId: insId6, quantidade: 1    },
        { insumoId: insId7, quantidade: 1    },
        { insumoId: insId8, quantidade: 1    },
      ]
    },
    {
      id: prodId3,
      nome: 'Açaí com Morango',
      volume: '1 Litro',
      margem: 70,
      despesas: 0.50,
      descricao: 'Açaí, morango e granola premium',
      composicao: [
        { insumoId: insId1, quantidade: 0.7  },
        { insumoId: insId5, quantidade: 150  },
        { insumoId: insId4, quantidade: 60   },
        { insumoId: insId2, quantidade: 80   },
        { insumoId: insId6, quantidade: 2    },
        { insumoId: insId7, quantidade: 2    },
        { insumoId: insId8, quantidade: 1    },
      ]
    },
  ];

  Storage.saveInsumos(insumos);
  Storage.saveProdutos(produtos);
  return { insumos, produtos };
}

// ============================================================
//  INICIALIZAÇÃO
// ============================================================

function init() {
  // Carrega dados do localStorage
  App.insumos  = Storage.getInsumos();
  App.produtos = Storage.getProdutos();

  // Se não tiver dados, carrega mock
  if (App.insumos.length === 0 && App.produtos.length === 0) {
    const mock = carregarDadosMock();
    App.insumos  = mock.insumos;
    App.produtos = mock.produtos;
  }

  // Renderiza tela inicial
  renderDashboard();
  renderInsumos();
  renderProdutos();
  atualizarSelectInsumos();
  atualizarSelectCalculo();

  // ---- Evento: Navegação sidebar ----
  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navegarPara(btn.dataset.page));
  });

  // ---- Evento: Menu mobile ----
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('open');
  });

  // ---- Evento: Toggle formulário insumo ----
  document.getElementById('btnToggleFormInsumo').addEventListener('click', function () {
    const body = document.getElementById('formInsumoBody');
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? 'block' : 'none';
    this.textContent = hidden ? '−' : '+';
  });

  document.getElementById('btnCancelarInsumo').addEventListener('click', () => {
    resetFormInsumo();
  });

  // ---- Evento: Toggle formulário produto ----
  document.getElementById('btnToggleFormProduto').addEventListener('click', function () {
    const body = document.getElementById('formProdutoBody');
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? 'block' : 'none';
    this.textContent = hidden ? '−' : '+';
  });

  document.getElementById('btnCancelarProduto').addEventListener('click', () => {
    resetFormProduto();
  });

  // ---- Evento: Custo unitário em tempo real ----
  ['insumoQtd', 'insumoPreco', 'insumoUnidade'].forEach(id => {
    document.getElementById(id).addEventListener('input', atualizarCustoUnitario);
    document.getElementById(id).addEventListener('change', atualizarCustoUnitario);
  });

  // ---- Evento: Busca de insumos ----
  document.getElementById('buscaInsumo').addEventListener('input', function () {
    renderInsumos(this.value);
  });

  // ---- Evento: Busca de produtos ----
  document.getElementById('buscaProduto').addEventListener('input', function () {
    renderProdutos(this.value);
  });

  // ---- Evento: Adicionar insumo na composição ----
  document.getElementById('btnAdicionarInsumo').addEventListener('click', () => {
    const sel = document.getElementById('selectInsumoComposicao');
    const insId = sel.value;
    const qtdEl = document.getElementById('qtdInsumoComposicao');
    const qtd = parseFloat(qtdEl.value);

    if (!insId) { showToast('Selecione um insumo.', 'error'); return; }
    if (!qtd || qtd <= 0) { showToast('Informe uma quantidade válida.', 'error'); return; }

    const jaExiste = App.composicaoTemp.findIndex(i => i.insumoId === insId);
    if (jaExiste !== -1) {
      App.composicaoTemp[jaExiste].quantidade += qtd;
    } else {
      App.composicaoTemp.push({ insumoId: insId, quantidade: qtd });
    }

    sel.value = '';
    qtdEl.value = '';
    document.getElementById('unidadeHintComposicao').textContent = '—';
    renderComposicaoTemp();
  });

  // ---- Evento: Hint de unidade no select de composição ----
  document.getElementById('selectInsumoComposicao').addEventListener('change', atualizarUnidadeHint);

  // ---- Evento: Select de produto na tela de cálculo ----
  document.getElementById('selectProdutoCalculo').addEventListener('change', function () {
    if (this.value) renderDetalheCalculo(this.value);
    else document.getElementById('painelCalculo').classList.add('hidden');
  });

  // ---- Evento: Simulador de margem ----
  document.getElementById('simMargem').addEventListener('input', function () {
    const prodId = document.getElementById('selectProdutoCalculo').value;
    const prod = App.produtos.find(p => p.id === prodId);
    if (!prod) return;
    const c = calcularProduto(prod);
    atualizarSimulador(prod, c.custoTotal);
  });

  // ---- Evento: Exportar ----
  document.getElementById('btnExportar').addEventListener('click', exportarRelatorio);

  // ---- Evento: Limpar todos os dados ----
  document.getElementById('btnLimparTudo').addEventListener('click', async () => {
    const ok = await confirmar(
      'Limpar Todos os Dados',
      'Isso irá apagar todos os insumos e produtos cadastrados. Esta ação não pode ser desfeita. Deseja continuar?'
    );
    if (!ok) return;
    Storage.clearAll();
    App.insumos  = [];
    App.produtos = [];
    renderDashboard();
    renderInsumos();
    renderProdutos();
    atualizarSelectInsumos();
    atualizarSelectCalculo();
    document.getElementById('painelCalculo').classList.add('hidden');
    showToast('Todos os dados foram apagados.');
  });
}

// Inicia quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', init);