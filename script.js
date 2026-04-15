/**
 * AçaíPrice — Sistema de Precificação v2.0
 * ==========================================
 * Melhorias v2:
 * - Controle de estoque com movimentações
 * - Página de vendas reais (abate estoque)
 * - Histórico de vendas com filtros
 * - Alertas de estoque baixo
 * - Formulários melhorados
 */

'use strict';

// ============================================================
//  CAMADA DE DADOS
// ============================================================

const Storage = {
  getInsumos()         { return JSON.parse(localStorage.getItem('acaiprice_insumos') || '[]'); },
  saveInsumos(d)       { localStorage.setItem('acaiprice_insumos', JSON.stringify(d)); },
  getProdutos()        { return JSON.parse(localStorage.getItem('acaiprice_produtos') || '[]'); },
  saveProdutos(d)      { localStorage.setItem('acaiprice_produtos', JSON.stringify(d)); },
  getVendas()          { return JSON.parse(localStorage.getItem('acaiprice_vendas') || '[]'); },
  saveVendas(d)        { localStorage.setItem('acaiprice_vendas', JSON.stringify(d)); },
  getMovEstoque()      { return JSON.parse(localStorage.getItem('acaiprice_mov_estoque') || '[]'); },
  saveMovEstoque(d)    { localStorage.setItem('acaiprice_mov_estoque', JSON.stringify(d)); },
  clearAll() {
    ['acaiprice_insumos','acaiprice_produtos','acaiprice_vendas','acaiprice_mov_estoque']
      .forEach(k => localStorage.removeItem(k));
  }
};

// ============================================================
//  ESTADO GLOBAL
// ============================================================

const App = {
  insumos: [],
  produtos: [],
  vendas: [],
  movEstoque: [],
  composicaoTemp: [],
  paginaAtual: 'dashboard',
  filtroEstoque: 'todos',
};

// ============================================================
//  UTILITÁRIOS
// ============================================================

function gerarId() {
  return '_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function formatBRL(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

function formatNum(valor, dec = 3) {
  return parseFloat((valor || 0).toFixed(dec));
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function badgeCategoria(cat) {
  const map = { fruta: 'Fruta/Polpa', laticinios: 'Laticínios', complemento: 'Complemento', embalagem: 'Embalagem', outros: 'Outros' };
  return `<span class="tag tag-${cat}">${map[cat] || cat}</span>`;
}

function badgeTipoMov(tipo) {
  const map = {
    entrada: ['tag-green', 'Entrada'],
    ajuste_mais: ['tag-blue', 'Ajuste +'],
    ajuste_menos: ['tag-orange', 'Ajuste −'],
    perda: ['tag-red', 'Perda'],
    venda: ['tag-coral', 'Venda'],
    producao: ['tag-green', 'Produção'],
    consumo_producao: ['tag-orange', 'Consumo'],
  };
  const [cls, label] = map[tipo] || ['tag-outros', tipo];
  return `<span class="tag ${cls}">${label}</span>`;
}

function badgeCanal(canal) {
  const map = { balcao: 'Balcão', delivery: 'Delivery', ifood: 'iFood/Rappi', whatsapp: 'WhatsApp', outro: 'Outro' };
  return `<span class="tag tag-canal">${map[canal] || canal}</span>`;
}

function statusEstoque(ins) {
  const atual = ins.estoqueAtual || 0;
  const minimo = ins.estoqueMinimo || 0;
  if (atual <= 0) return { cls: 'status-zerado', label: 'Zerado' };
  if (minimo > 0 && atual <= minimo) return { cls: 'status-alerta', label: 'Alerta' };
  return { cls: 'status-ok', label: 'OK' };
}

function statusEstoqueProduto(prod) {
  const atual = prod.estoqueAtual || 0;
  const minimo = prod.estoqueMinimo || 0;
  if (atual <= 0) return { cls: 'status-zerado', label: 'Zerado' };
  if (minimo > 0 && atual <= minimo) return { cls: 'status-alerta', label: 'Alerta' };
  return { cls: 'status-ok', label: 'OK' };
}

function obterUnidadeProduto(prod) {
  return parsearRendimentoProduto(prod.volume).unidade || prod.rendimentoUnidade || 'un';
}

function valorEstoqueProduto(prod) {
  const calc = calcularProduto(prod);
  return (prod.estoqueAtual || 0) * (Number.isFinite(calc.custoTotal) ? calc.custoTotal : 0);
}

function parsearRendimentoProduto(volume) {
  const texto = String(volume || '').trim();
  if (!texto) return { quantidade: NaN, unidade: 'un', texto: '' };
  const match = texto.match(/^([0-9]+(?:[.,][0-9]+)?)\s*([a-zA-ZÀ-ÿ]+)?$/);
  if (!match) return { quantidade: NaN, unidade: 'un', texto };
  const quantidade = parseFloat(match[1].replace(',', '.')) || 1;
  const unidadeBruta = (match[2] || 'un').toLowerCase();
  const mapa = { litro:'l', litros:'l', l:'l', ml:'ml', mililitro:'ml', mililitros:'ml', g:'g', grama:'g', gramas:'g', kg:'kg', quilo:'kg', quilos:'kg', unidade:'un', unidades:'un', un:'un' };
  return { quantidade, unidade: mapa[unidadeBruta] || unidadeBruta || 'un', texto };
}

function familiaUnidade(u) {
  u = String(u || '').toLowerCase();
  if (['g','kg'].includes(u)) return 'massa';
  if (['ml','l'].includes(u)) return 'volume';
  if (u === 'un') return 'unidade';
  return 'outra';
}

function converterQuantidade(valor, de, para) {
  const qtd = parseFloat(valor);
  if (!Number.isFinite(qtd)) return NaN;
  de = String(de || '').toLowerCase();
  para = String(para || '').toLowerCase();
  if (!de || !para) return NaN;
  if (de === para) return qtd;
  if (familiaUnidade(de) !== familiaUnidade(para)) return NaN;
  const base = { g:1, kg:1000, ml:1, l:1000, un:1 };
  if (!base[de] || !base[para]) return NaN;
  return qtd * (base[de] / base[para]);
}

function normalizarItemComposicao(item) {
  if (!item) return null;
  const quantidade = parseFloat(item.quantidade) || 0;
  const unidade = String(item.unidade || item.qtdUnidade || '').toLowerCase();
  if (item.tipo && item.itemId) return { tipo: item.tipo, itemId: item.itemId, quantidade, unidade };
  if (item.insumoId) return { tipo: 'insumo', itemId: item.insumoId, quantidade, unidade };
  if (item.produtoId) return { tipo: 'produto', itemId: item.produtoId, quantidade, unidade };
  return null;
}

function obterTipoAlvoMovimento(mov) {
  if (mov.alvoTipo) return mov.alvoTipo;
  if (mov.produtoId) return 'produto';
  return 'insumo';
}

function obterComponenteComposicao(item) {
  if (!item) return null;
  if (item.tipo === 'produto') return App.produtos.find(p => p.id === item.itemId) || null;
  return App.insumos.find(i => i.id === item.itemId) || null;
}

function obterUnidadeComponente(item) {
  const c = obterComponenteComposicao(item);
  if (!c) return '—';
  if (item.tipo === 'produto') return item.unidade || parsearRendimentoProduto(c.volume).unidade || 'un';
  return c.unidade || 'un';
}

function obterCustoUnitarioComponente(item, visitados = new Set()) {
  const c = obterComponenteComposicao(item);
  if (!c) return 0;
  if (item.tipo === 'produto') {
    const calc = calcularProduto(c, visitados);
    if (calc.ciclo) return NaN;
    const r = parsearRendimentoProduto(c.volume);
    const base = r.quantidade > 0 ? r.quantidade : NaN;
    if (!Number.isFinite(base)) return NaN;
    const fator = converterQuantidade(1, r.unidade || 'un', item.unidade || r.unidade || 'un');
    if (!Number.isFinite(fator) || fator <= 0) return NaN;
    return (calc.custoTotal / base) / fator;
  }
  return c.custoUnitario || 0;
}

function obterRotuloComponente(item) {
  return item.tipo === 'produto' ? 'Produto' : 'Insumo';
}

// ============================================================
//  TOAST
// ============================================================

let toastTimer = null;
function showToast(msg, tipo = 'success') {
  const el = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  el.classList.remove('hidden', 'error', 'warning');
  if (tipo === 'error') el.classList.add('error');
  if (tipo === 'warning') el.classList.add('warning');
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

// ============================================================
//  MODAL DE CONFIRMAÇÃO
// ============================================================

function confirmar(titulo, mensagem) {
  return new Promise((resolve) => {
    document.getElementById('modalTitle').textContent = titulo;
    document.getElementById('modalMessage').textContent = mensagem;
    document.getElementById('modalConfirm').classList.remove('hidden');
    const btnOk = document.getElementById('modalConfirmBtn');
    const btnCancel = document.getElementById('modalCancel');
    function cleanup(r) {
      document.getElementById('modalConfirm').classList.add('hidden');
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      resolve(r);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
  });
}

// ============================================================
//  NAVEGAÇÃO
// ============================================================

function navegarPara(pagina) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const pageEl = document.getElementById(`page-${pagina}`);
  if (pageEl) pageEl.classList.add('active');
  document.querySelectorAll(`[data-page="${pagina}"]`).forEach(b => b.classList.add('active'));
  App.paginaAtual = pagina;
  document.querySelector('.sidebar').classList.remove('open');
  if (pagina === 'dashboard')     renderDashboard();
  if (pagina === 'insumos')       { renderInsumos(); }
  if (pagina === 'estoque')       renderEstoque();
  if (pagina === 'calculos')      renderCalculos();
  if (pagina === 'simulacao')     renderSimulacao();
  if (pagina === 'vendas-reais')  renderVendasReais();
}

// ============================================================
//  CÁLCULO DE PRECIFICAÇÃO
// ============================================================

function calcularProduto(produto, visitados = new Set()) {
  if (!produto) return { custoInsumos:0, despesas:0, custoTotal:0, margem:0, precoSugerido:0, lucro:0, ciclo:false };
  if (visitados.has(produto.id)) return { custoInsumos:0, despesas:0, custoTotal:0, margem:0, precoSugerido:0, lucro:0, ciclo:true };
  const prox = new Set(visitados);
  prox.add(produto.id);
  const custoInsumos = (produto.composicao || []).reduce((acc, io) => {
    const item = normalizarItemComposicao(io);
    if (!item || item.quantidade <= 0) return acc;
    const comp = obterComponenteComposicao(item);
    if (!comp) return acc;
    if (item.tipo === 'produto') {
      const calc = calcularProduto(comp, prox);
      if (calc.ciclo) return NaN;
      const r = parsearRendimentoProduto(comp.volume);
      const base = r.quantidade > 0 ? r.quantidade : NaN;
      if (!Number.isFinite(base)) return NaN;
      const fator = converterQuantidade(1, r.unidade || 'un', item.unidade || r.unidade || 'un');
      if (!Number.isFinite(fator) || fator <= 0) return NaN;
      return acc + ((calc.custoTotal / base) / fator) * item.quantidade;
    }
    return acc + ((comp.custoUnitario || 0) * item.quantidade);
  }, 0);
  if (Number.isNaN(custoInsumos)) return { custoInsumos:0, despesas:0, custoTotal:0, margem:0, precoSugerido:0, lucro:0, ciclo:true };
  const despesas    = parseFloat(produto.despesas || 0);
  const custoTotal  = custoInsumos + despesas;
  const margem      = Math.max(0, parseFloat(produto.margem || 0));
  const markup      = margem / 100;
  const precoSugerido = custoTotal * (1 + markup);
  const lucro         = custoTotal * markup;
  return { custoInsumos, despesas, custoTotal, margem: produto.margem, precoSugerido, lucro, ciclo: false };
}

/** Verifica se há estoque suficiente do produto acabado para venda */
function verificarEstoqueProduto(produto, quantidade) {
  return verificarEstoqueVendaProduto(produto, quantidade);
}

/** Abate estoque do produto acabado ao registrar venda */
function abaterEstoque(produto, quantidade, vendaId) {
  baixarEstoqueProduto(produto, quantidade, vendaId);
}

// ============================================================
//  MOVIMENTAÇÕES DE ESTOQUE
// ============================================================

function registrarMovEstoque({ insumoId = null, produtoId = null, alvoTipo = null, itemId = null, tipo, quantidade, custo, saldoApos, observacao }) {
  const tipoAlvo = alvoTipo || (produtoId ? 'produto' : 'insumo');
  const resolvedItemId = itemId || insumoId || produtoId || null;
  App.movEstoque.push({
    id: gerarId(),
    alvoTipo: tipoAlvo,
    itemId: resolvedItemId,
    insumoId: tipoAlvo === 'insumo' ? resolvedItemId : insumoId,
    produtoId: tipoAlvo === 'produto' ? resolvedItemId : produtoId,
    tipo,
    quantidade,
    custo: custo || null,
    saldoApos,
    observacao: observacao || '',
    data: new Date().toISOString(),
  });
  Storage.saveMovEstoque(App.movEstoque);
}

// ============================================================
//  ALERTAS DE ESTOQUE
// ============================================================

function itensEmAlerta() {
  const insumos = App.insumos.filter(ins => {
    const st = statusEstoque(ins);
    return st.label === 'Alerta' || st.label === 'Zerado';
  }).map(ins => ({ ...ins, tipoItem: 'insumo' }));
  const produtos = App.produtos.filter(prod => {
    const st = statusEstoqueProduto(prod);
    return st.label === 'Alerta' || st.label === 'Zerado';
  }).map(prod => ({ ...prod, tipoItem: 'produto' }));
  return [...insumos, ...produtos];
}

function insumosEmAlerta() {
  return itensEmAlerta().filter(item => item.tipoItem === 'insumo');
}

function atualizarBadgeEstoque() {
  const alertas = itensEmAlerta();
  const badge = document.getElementById('badgeEstoque');
  if (alertas.length > 0) {
    badge.classList.remove('hidden');
    badge.textContent = alertas.length;
  } else {
    badge.classList.add('hidden');
  }
}

// ============================================================
//  DASHBOARD
// ============================================================

function renderDashboard() {
  const numInsumos  = App.insumos.length;
  const numProdutos = App.produtos.length;
  const alertas     = itensEmAlerta();

  // Vendas do dia
  const hoje = new Date().toDateString();
  const vendasHoje = App.vendas.filter(v => new Date(v.data).toDateString() === hoje);
  const faturamentoHoje = vendasHoje.reduce((a, v) => a + (v.totalFinal || 0), 0);
  const lucroHoje       = vendasHoje.reduce((a, v) => a + (v.lucro || 0), 0);

  document.getElementById('statsGrid').innerHTML = `
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
    <div class="stat-card" style="--accent-color: var(--green-light)">
      <div class="stat-label">Faturamento Hoje</div>
      <div class="stat-value" style="font-size:1.3rem">${formatBRL(faturamentoHoje)}</div>
      <div class="stat-sub">${vendasHoje.length} venda(s)</div>
    </div>
    <div class="stat-card" style="--accent-color: ${alertas.length > 0 ? 'var(--coral)' : '#80b3ff'}">
      <div class="stat-label">Alertas de Estoque</div>
      <div class="stat-value" style="color:${alertas.length > 0 ? 'var(--coral)' : 'inherit'}">${alertas.length}</div>
      <div class="stat-sub">${alertas.length > 0 ? 'itens críticos' : 'tudo ok'}</div>
    </div>
  `;

  // Alertas
  const alertDiv = document.getElementById('alertasEstoque');
  if (alertas.length > 0) {
    alertDiv.innerHTML = `
      <div class="alerta-banner">
        <strong>⚠ Estoque crítico:</strong>
        ${alertas.map(i => {
          const unidade = i.tipoItem === 'produto' ? obterUnidadeProduto(i) : i.unidade;
          return `<span class="alerta-item">${i.nome} (${formatNum(i.estoqueAtual,2)} ${unidade})</span>`;
        }).join('')}
        <button class="btn-small" data-page="estoque" style="margin-left:auto">Ver estoque →</button>
      </div>`;
  } else {
    alertDiv.innerHTML = '';
  }

  // Produtos
  const dashProd = document.getElementById('dashProdutos');
  if (!App.produtos.length) {
    dashProd.innerHTML = '<p class="empty-msg">Nenhum produto cadastrado.</p>';
  } else {
    dashProd.innerHTML = App.produtos.map(p => {
      const c = calcularProduto(p);
      return `<div class="dash-item" onclick="verCalculo('${p.id}')">
        <span class="dash-item-name">${p.nome} ${p.volume ? `<small>(${p.volume})</small>` : ''}</span>
        <span class="dash-item-value">${formatBRL(c.precoSugerido)}</span>
      </div>`;
    }).join('');
  }

  // Estoque crítico
  const dashEstoque = document.getElementById('dashEstoqueCritico');
  if (!alertas.length) {
    dashEstoque.innerHTML = '<p class="empty-msg" style="color:var(--green)">✓ Todos os itens com estoque adequado.</p>';
  } else {
    dashEstoque.innerHTML = alertas.slice(0, 5).map(ins => {
      const st = statusEstoque(ins);
      const unidade = ins.tipoItem === 'produto' ? obterUnidadeProduto(ins) : ins.unidade;
      return `<div class="dash-item">
        <span class="dash-item-name">${ins.nome}</span>
        <span class="dash-item-value"><span class="status-badge ${st.cls}">${formatNum(ins.estoqueAtual,2)} ${unidade}</span></span>
      </div>`;
    }).join('');
  }

  // Últimas vendas
  const dashVendas = document.getElementById('dashUltimasVendas');
  const ultimasVendas = [...App.vendas].sort((a,b) => new Date(b.data) - new Date(a.data)).slice(0, 5);
  if (!ultimasVendas.length) {
    dashVendas.innerHTML = '<p class="empty-msg">Nenhuma venda registrada ainda.</p>';
  } else {
    dashVendas.innerHTML = ultimasVendas.map(v => `
      <div class="dash-item">
        <span class="dash-item-name">${v.produtoNome} <small>×${v.quantidade}</small></span>
        <span class="dash-item-value">${formatBRL(v.totalFinal)}</span>
      </div>`).join('');
  }

  // Top insumos
  const dashIns = document.getElementById('dashInsumos');
  const sorted = [...App.insumos].sort((a,b) => b.custoUnitario - a.custoUnitario).slice(0, 5);
  if (!sorted.length) {
    dashIns.innerHTML = '<p class="empty-msg">Nenhum insumo cadastrado.</p>';
  } else {
    dashIns.innerHTML = sorted.map(i => `
      <div class="dash-item">
        <span class="dash-item-name">${i.nome}</span>
        <span class="dash-item-value">${formatBRL(i.custoUnitario)} / ${i.unidade}</span>
      </div>`).join('');
  }

  atualizarBadgeEstoque();
}

// ============================================================
//  INSUMOS
// ============================================================

function renderInsumos(filtro = '', categoria = '') {
  const tbody = document.getElementById('tbodyInsumos');
  let lista = App.insumos;
  if (filtro) lista = lista.filter(i => i.nome.toLowerCase().includes(filtro.toLowerCase()));
  if (categoria) lista = lista.filter(i => i.categoria === categoria);

  if (!lista.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">Nenhum insumo encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(ins => {
    const st = statusEstoque(ins);
    return `
      <tr>
        <td><strong style="color:var(--text)">${ins.nome}</strong></td>
        <td>${badgeCategoria(ins.categoria)}</td>
        <td style="color:var(--green-light);font-weight:600">${formatBRL(ins.custoUnitario)} / ${ins.unidade}</td>
        <td><strong>${formatNum(ins.estoqueAtual || 0, 2)} ${ins.unidade}</strong></td>
        <td>${ins.estoqueMinimo > 0 ? formatNum(ins.estoqueMinimo, 2) + ' ' + ins.unidade : '—'}</td>
        <td><span class="status-badge ${st.cls}">${st.label}</span></td>
        <td style="color:var(--text-3);font-size:.82rem">${ins.fornecedor || '—'}</td>
        <td>
          <div style="display:flex;gap:5px">
            <button class="btn-edit" onclick="editarInsumo('${ins.id}')">✎</button>
            <button class="btn-small" onclick="abrirAjusteEstoque('${ins.id}')" title="Ajustar estoque">📦</button>
            <button class="btn-delete" onclick="excluirInsumo('${ins.id}')">✕</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function editarInsumo(id) {
  const ins = App.insumos.find(i => i.id === id);
  if (!ins) return;
  document.getElementById('insumoId').value           = ins.id;
  document.getElementById('insumoNome').value         = ins.nome;
  document.getElementById('insumoCategoria').value    = ins.categoria;
  document.getElementById('insumoUnidade').value      = ins.unidade;
  document.getElementById('insumoQtd').value          = ins.qtdComprada;
  document.getElementById('insumoPreco').value        = ins.precoPago;
  document.getElementById('insumoCustoUnitario').value = `${formatBRL(ins.custoUnitario)} / ${ins.unidade}`;
  document.getElementById('insumoEstoqueAtual').value = ins.estoqueAtual || 0;
  document.getElementById('insumoEstoqueMinimo').value = ins.estoqueMinimo || 0;
  document.getElementById('insumoEstoqueUnidade').value = ins.unidade;
  document.getElementById('insumoFornecedor').value   = ins.fornecedor || '';
  document.getElementById('formInsumoTitulo').textContent = 'Editar Insumo';
  document.getElementById('formInsumoBody').style.display = 'block';
  document.getElementById('btnToggleFormInsumo').textContent = '−';
  document.getElementById('insumoNome').focus();
  document.getElementById('formInsumoCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function excluirInsumo(id) {
  const ins = App.insumos.find(i => i.id === id);
  if (!ins) return;
  const ok = await confirmar('Excluir Insumo', `Deseja excluir "${ins.nome}"?`);
  if (!ok) return;
  App.insumos = App.insumos.filter(i => i.id !== id);
  Storage.saveInsumos(App.insumos);
  renderInsumos();
  atualizarSelectInsumos();
  atualizarBadgeEstoque();
  showToast(`"${ins.nome}" excluído.`);
}

function resetFormInsumo() {
  document.getElementById('formInsumo').reset();
  document.getElementById('insumoId').value = '';
  document.getElementById('insumoCustoUnitario').value = '';
  document.getElementById('insumoEstoqueUnidade').value = '';
  document.getElementById('formInsumoTitulo').textContent = 'Novo Insumo';
}

function atualizarCustoUnitario() {
  const qtd   = parseFloat(document.getElementById('insumoQtd').value) || 0;
  const preco = parseFloat(document.getElementById('insumoPreco').value) || 0;
  const unid  = document.getElementById('insumoUnidade').value;
  document.getElementById('insumoCustoUnitario').value = qtd > 0 ? `${formatBRL(preco / qtd)} / ${unid}` : '';
  document.getElementById('insumoEstoqueUnidade').value = unid;
}

document.getElementById('formInsumo').addEventListener('submit', function(e) {
  e.preventDefault();
  const id    = document.getElementById('insumoId').value;
  const nome  = document.getElementById('insumoNome').value.trim();
  const cat   = document.getElementById('insumoCategoria').value;
  const unid  = document.getElementById('insumoUnidade').value;
  const qtd   = parseFloat(document.getElementById('insumoQtd').value);
  const preco = parseFloat(document.getElementById('insumoPreco').value);
  const estoqueAtual  = parseFloat(document.getElementById('insumoEstoqueAtual').value) || 0;
  const estoqueMinimo = parseFloat(document.getElementById('insumoEstoqueMinimo').value) || 0;
  const fornecedor    = document.getElementById('insumoFornecedor').value.trim();

  if (!nome || isNaN(qtd) || isNaN(preco) || qtd <= 0 || preco <= 0) {
    showToast('Preencha todos os campos obrigatórios.', 'error'); return;
  }
  const custoUnitario = preco / qtd;

  if (id) {
    const idx = App.insumos.findIndex(i => i.id === id);
    if (idx !== -1) {
      const estoqueAntes = App.insumos[idx].estoqueAtual || 0;
      App.insumos[idx] = { ...App.insumos[idx], nome, categoria:cat, unidade:unid, qtdComprada:qtd, precoPago:preco, custoUnitario, estoqueAtual, estoqueMinimo, fornecedor };
      if (estoqueAntes !== estoqueAtual) {
        registrarMovEstoque({ insumoId: id, tipo: 'ajuste_mais', quantidade: Math.abs(estoqueAtual - estoqueAntes), saldoApos: estoqueAtual, observacao: 'Ajuste via edição de insumo' });
      }
    }
    showToast(`"${nome}" atualizado!`);
  } else {
    const novoId = gerarId();
    App.insumos.push({ id: novoId, nome, categoria:cat, unidade:unid, qtdComprada:qtd, precoPago:preco, custoUnitario, estoqueAtual, estoqueMinimo, fornecedor });
    if (estoqueAtual > 0) {
      registrarMovEstoque({ insumoId: novoId, tipo: 'entrada', quantidade: estoqueAtual, custo: preco, saldoApos: estoqueAtual, observacao: 'Estoque inicial' });
    }
    showToast(`"${nome}" cadastrado!`);
  }
  Storage.saveInsumos(App.insumos);
  resetFormInsumo();
  renderInsumos();
  atualizarSelectInsumos();
  atualizarBadgeEstoque();
});

// Ajuste rápido de estoque (modal)
let ajusteEstoqueId = null;
function abrirAjusteEstoque(id) {
  const ins = App.insumos.find(i => i.id === id);
  if (!ins) return;
  ajusteEstoqueId = id;
  document.getElementById('modalAjusteNome').textContent = `${ins.nome} — atual: ${formatNum(ins.estoqueAtual || 0, 2)} ${ins.unidade}`;
  document.getElementById('inputAjusteEstoque').value = ins.estoqueAtual || 0;
  document.getElementById('modalAjusteEstoque').classList.remove('hidden');
}

document.getElementById('btnConfirmarAjuste').addEventListener('click', () => {
  const id = ajusteEstoqueId;
  const ins = App.insumos.find(i => i.id === id);
  if (!ins) return;
  const novo = parseFloat(document.getElementById('inputAjusteEstoque').value);
  if (isNaN(novo) || novo < 0) { showToast('Valor inválido.', 'error'); return; }
  const antes = ins.estoqueAtual || 0;
  ins.estoqueAtual = novo;
  registrarMovEstoque({ insumoId: id, tipo: novo >= antes ? 'ajuste_mais' : 'ajuste_menos', quantidade: Math.abs(novo - antes), saldoApos: novo, observacao: 'Ajuste manual rápido' });
  Storage.saveInsumos(App.insumos);
  document.getElementById('modalAjusteEstoque').classList.add('hidden');
  renderInsumos();
  if (App.paginaAtual === 'estoque') renderEstoque();
  atualizarBadgeEstoque();
  showToast(`Estoque de "${ins.nome}" atualizado!`);
});

document.getElementById('btnCancelarAjuste').addEventListener('click', () => {
  document.getElementById('modalAjusteEstoque').classList.add('hidden');
});

// ============================================================
//  ESTOQUE
// ============================================================

let filtroEstoqueAtivo = 'todos';
function filtrarEstoque(tipo) {
  filtroEstoqueAtivo = tipo;
  document.querySelectorAll('#page-estoque .btn-small').forEach(b => b.classList.remove('active-filter'));
  const btnMap = { todos: 'filtroTodosEstoque', alerta: 'filtroAlertaEstoque', zerado: 'filtroZeradoEstoque' };
  const el = document.getElementById(btnMap[tipo]);
  if (el) el.classList.add('active-filter');
  renderTabelaEstoque();
}

function renderEstoque() {
  // Stats
  const totalInsumos = App.insumos.length;
  const totalProdutos = App.produtos.length;
  const emAlerta = itensEmAlerta().filter(item => item.tipoItem === 'insumo' || item.tipoItem === 'produto').length;
  const zerados  = [...App.insumos.filter(i => statusEstoque(i).label === 'Zerado'), ...App.produtos.filter(p => statusEstoqueProduto(p).label === 'Zerado')].length;
  const valorTotalInsumos = App.insumos.reduce((a, i) => a + ((i.estoqueAtual || 0) * (i.custoUnitario || 0)), 0);
  const valorTotalProdutos = App.produtos.reduce((a, p) => a + valorEstoqueProduto(p), 0);
  const valorTotal = valorTotalInsumos + valorTotalProdutos;

  document.getElementById('statsEstoque').innerHTML = `
    <div class="stat-card" style="--accent-color:var(--acai-light)">
      <div class="stat-label">Total de Insumos</div>
      <div class="stat-value">${totalInsumos}</div>
      <div class="stat-sub">cadastrados</div>
    </div>
    <div class="stat-card" style="--accent-color:var(--green)">
      <div class="stat-label">Total de Produtos</div>
      <div class="stat-value">${totalProdutos}</div>
      <div class="stat-sub">acabados</div>
    </div>
    <div class="stat-card" style="--accent-color:${emAlerta > 0 ? 'var(--coral)' : 'var(--green)'}">
      <div class="stat-label">Em Alerta</div>
      <div class="stat-value" style="color:${emAlerta > 0 ? 'var(--coral)' : 'inherit'}">${emAlerta}</div>
      <div class="stat-sub">abaixo do mínimo</div>
    </div>
    <div class="stat-card" style="--accent-color:${zerados > 0 ? '#ef4444' : 'var(--green)'}">
      <div class="stat-label">Zerados</div>
      <div class="stat-value" style="color:${zerados > 0 ? '#ef4444' : 'inherit'}">${zerados}</div>
      <div class="stat-sub">sem estoque</div>
    </div>
    <div class="stat-card" style="--accent-color:#80b3ff">
      <div class="stat-label">Valor em Estoque</div>
      <div class="stat-value" style="font-size:1.3rem">${formatBRL(valorTotal)}</div>
      <div class="stat-sub">custo total</div>
    </div>
  `;

  atualizarSelectMovInsumo();
  atualizarSelectProducaoProduto();
  renderTabelaEstoque();
  renderTabelaProdutosEstoque();
  renderHistoricoMov();
}

function renderTabelaEstoque() {
  const tbody = document.getElementById('tbodyEstoque');
  let lista = App.insumos;
  if (filtroEstoqueAtivo === 'alerta') lista = lista.filter(i => statusEstoque(i).label === 'Alerta');
  if (filtroEstoqueAtivo === 'zerado') lista = lista.filter(i => statusEstoque(i).label === 'Zerado');

  if (!lista.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">${filtroEstoqueAtivo === 'todos' ? 'Nenhum insumo cadastrado.' : 'Nenhum insumo neste filtro.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(ins => {
    const st = statusEstoque(ins);
    const valorEst = (ins.estoqueAtual || 0) * (ins.custoUnitario || 0);
    return `
      <tr>
        <td><strong>${ins.nome}</strong></td>
        <td>${badgeCategoria(ins.categoria)}</td>
        <td><strong style="font-size:1rem">${formatNum(ins.estoqueAtual || 0, 2)} ${ins.unidade}</strong></td>
        <td>${ins.estoqueMinimo > 0 ? formatNum(ins.estoqueMinimo, 2) + ' ' + ins.unidade : '—'}</td>
        <td><span class="status-badge ${st.cls}">${st.label}</span></td>
        <td>${formatBRL(ins.custoUnitario)} / ${ins.unidade}</td>
        <td style="font-weight:600">${formatBRL(valorEst)}</td>
        <td>
          <button class="btn-small" onclick="abrirAjusteEstoque('${ins.id}')">📦 Ajustar</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderTabelaProdutosEstoque() {
  const tbody = document.getElementById('tbodyProdutosEstoque');
  const lista = [...App.produtos];

  if (!lista.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Nenhum produto cadastrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(prod => {
    const st = statusEstoqueProduto(prod);
    const custoUnit = calcularProduto(prod).custoTotal || 0;
    const valorEst = valorEstoqueProduto(prod);
    const unidade = obterUnidadeProduto(prod);
    return `
      <tr>
        <td><strong>${prod.nome}</strong>${prod.volume ? ` <span class="tag tag-canal" style="margin-left:6px">${prod.volume}</span>` : ''}</td>
        <td><strong style="font-size:1rem">${formatNum(prod.estoqueAtual || 0, 2)} ${unidade}</strong></td>
        <td>${prod.estoqueMinimo > 0 ? formatNum(prod.estoqueMinimo, 2) + ' ' + unidade : '—'}</td>
        <td><span class="status-badge ${st.cls}">${st.label}</span></td>
        <td>${formatBRL(custoUnit)} / ${unidade}</td>
        <td style="font-weight:600">${formatBRL(valorEst)}</td>
        <td>
          <button class="btn-small" onclick="abrirProducaoProduto('${prod.id}')">📦 Produzir</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderHistoricoMov() {
  const tbody = document.getElementById('tbodyHistMov');
  const movs = [...App.movEstoque].sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 100);

  if (!movs.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Nenhuma movimentação registrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = movs.map(m => {
    const alvoTipo = obterTipoAlvoMovimento(m);
    const item = alvoTipo === 'produto'
      ? App.produtos.find(p => p.id === (m.itemId || m.produtoId))
      : App.insumos.find(i => i.id === (m.itemId || m.insumoId));
    const nomeItem = item ? item.nome : (alvoTipo === 'produto' ? 'Produto removido' : 'Insumo removido');
    const unidade = item ? (alvoTipo === 'produto' ? obterUnidadeProduto(item) : item.unidade) : '';
    const sinal = ['entrada','ajuste_mais','producao'].includes(m.tipo) ? '+' : '−';
    return `
      <tr>
        <td style="white-space:nowrap;font-size:.82rem">${formatDateTime(m.data)}</td>
        <td>${nomeItem}</td>
        <td>${badgeTipoMov(m.tipo)}</td>
        <td style="font-weight:600;color:${['entrada','ajuste_mais','producao'].includes(m.tipo) ? 'var(--green)' : 'var(--coral)'}">${sinal}${formatNum(m.quantidade, 2)} ${unidade}</td>
        <td>${m.custo ? formatBRL(m.custo) : '—'}</td>
        <td>${formatNum(m.saldoApos || 0, 2)} ${unidade}</td>
        <td style="font-size:.82rem;color:var(--text-3)">${m.observacao || '—'}</td>
      </tr>
    `;
  }).join('');
}

function atualizarSelectMovInsumo() {
  const sel = document.getElementById('movInsumo');
  const val = sel.value;
  sel.innerHTML = '<option value="">Selecione um insumo...</option>';
  App.insumos.forEach(ins => {
    const opt = document.createElement('option');
    opt.value = ins.id;
    opt.textContent = `${ins.nome} (${formatNum(ins.estoqueAtual || 0, 2)} ${ins.unidade})`;
    sel.appendChild(opt);
  });
  sel.value = val;
}

function atualizarSelectProducaoProduto() {
  const sel = document.getElementById('producaoProduto');
  if (!sel) return;
  const val = sel.value;
  sel.innerHTML = '<option value="">Selecione um produto...</option>';
  App.produtos.forEach(prod => {
    const opt = document.createElement('option');
    opt.value = prod.id;
    opt.textContent = `${prod.nome}${prod.volume ? ` (${prod.volume})` : ''} — estq: ${formatNum(prod.estoqueAtual || 0, 2)} ${obterUnidadeProduto(prod)}`;
    sel.appendChild(opt);
  });
  sel.value = val;
  atualizarUnidadeProducao();
}

function atualizarUnidadeProducao() {
  const selProduto = document.getElementById('producaoProduto');
  const selUnidade = document.getElementById('producaoQuantidadeUnidade');
  if (!selProduto || !selUnidade) return;
  const prod = App.produtos.find(p => p.id === selProduto.value);
  if (!prod) return;
  selUnidade.value = obterUnidadeProduto(prod);
}

document.getElementById('btnRegistrarMov').addEventListener('click', () => {
  const insumoId = document.getElementById('movInsumo').value;
  const tipo     = document.getElementById('movTipo').value;
  const qtd      = parseFloat(document.getElementById('movQuantidade').value);
  const custo    = parseFloat(document.getElementById('movCusto').value) || null;
  const obs      = document.getElementById('movObservacao').value.trim();

  if (!insumoId) { showToast('Selecione um insumo.', 'error'); return; }
  if (!qtd || qtd <= 0) { showToast('Informe uma quantidade válida.', 'error'); return; }

  const idx = App.insumos.findIndex(i => i.id === insumoId);
  if (idx === -1) return;
  const ins = App.insumos[idx];
  let novoEstoque = ins.estoqueAtual || 0;

  if (tipo === 'entrada' || tipo === 'ajuste_mais') novoEstoque += qtd;
  else novoEstoque = Math.max(0, novoEstoque - qtd);

  // Atualiza custo unitário se entrada com custo informado
  if (tipo === 'entrada' && custo && custo > 0 && qtd > 0) {
    App.insumos[idx].custoUnitario = custo / qtd;
    App.insumos[idx].precoPago = custo;
    App.insumos[idx].qtdComprada = qtd;
  }

  App.insumos[idx].estoqueAtual = novoEstoque;
  registrarMovEstoque({ insumoId, tipo, quantidade: qtd, custo, saldoApos: novoEstoque, observacao: obs });
  Storage.saveInsumos(App.insumos);

  // Reset form
  document.getElementById('movInsumo').value = '';
  document.getElementById('movQuantidade').value = '';
  document.getElementById('movCusto').value = '';
  document.getElementById('movObservacao').value = '';

  renderEstoque();
  atualizarBadgeEstoque();
  showToast(`Movimentação registrada! Novo estoque: ${formatNum(novoEstoque, 2)} ${ins.unidade}`);
});

document.getElementById('btnRegistrarProducao').addEventListener('click', registrarProducaoProduto);
document.getElementById('producaoProduto').addEventListener('change', atualizarUnidadeProducao);

// ============================================================
//  PRODUTOS
// ============================================================

function renderProdutos(filtro = '') {
  const container = document.getElementById('listaProdutos');
  let lista = filtro ? App.produtos.filter(p => p.nome.toLowerCase().includes(filtro.toLowerCase())) : App.produtos;

  if (!lista.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">◎</div><p>Nenhum produto encontrado.</p></div>`;
    return;
  }

  container.innerHTML = lista.map(prod => {
    const c = calcularProduto(prod);
    const custoTotal    = c.ciclo ? 'Inválido' : formatBRL(c.custoTotal);
    const precoSugerido = c.ciclo ? '—' : formatBRL(c.precoSugerido);
    const precoVenda    = prod.precoVenda ? formatBRL(prod.precoVenda) : '—';
    const lucro         = c.ciclo ? '—' : formatBRL(c.lucro);
    const stEstoque     = statusEstoqueProduto(prod);
    const unidadeEst    = obterUnidadeProduto(prod);
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
            <div class="produto-stat-val val-custo">${custoTotal}</div>
          </div>
          <div class="produto-stat">
            <div class="produto-stat-label">Preço Sugerido</div>
            <div class="produto-stat-val val-preco">${precoSugerido}</div>
          </div>
          <div class="produto-stat">
            <div class="produto-stat-label">Preço de Venda</div>
            <div class="produto-stat-val" style="color:var(--acai)">${precoVenda}</div>
          </div>
          <div class="produto-stat">
            <div class="produto-stat-label">Margem</div>
            <div class="produto-stat-val val-margem">${prod.margem}%</div>
          </div>
          <div class="produto-stat">
            <div class="produto-stat-label">Estoque</div>
            <div class="produto-stat-val" style="color:${stEstoque.cls === 'status-zerado' ? 'var(--coral)' : stEstoque.cls === 'status-alerta' ? 'var(--orange)' : 'var(--green)'}">${formatNum(prod.estoqueAtual || 0, 2)} ${unidadeEst}</div>
          </div>
        </div>
        <div class="produto-actions">
          <button class="btn-edit" onclick="editarProduto('${prod.id}')">✎ Editar</button>
          <button class="btn-small" onclick="verCalculo('${prod.id}')">📊 Análise</button>
          <button class="btn-small" onclick="abrirProducaoProduto('${prod.id}')">📦 Produzir</button>
          <button class="btn-delete" onclick="excluirProduto('${prod.id}')">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

function verCalculo(id) {
  navegarPara('calculos');
  document.getElementById('selectProdutoCalculo').value = id;
  renderDetalheCalculo(id);
}

function editarProduto(id) {
  const prod = App.produtos.find(p => p.id === id);
  if (!prod) return;
  const r = parsearRendimentoProduto(prod.volume);
  document.getElementById('produtoId').value               = prod.id;
  document.getElementById('produtoNome').value             = prod.nome;
  document.getElementById('produtoRendimentoQtd').value    = Number.isFinite(r.quantidade) ? r.quantidade : '';
  document.getElementById('produtoRendimentoUnidade').value = r.unidade || 'g';
  document.getElementById('produtoMargem').value           = prod.margem;
  document.getElementById('produtoDespesas').value         = prod.despesas;
  document.getElementById('produtoPrecoVenda').value       = prod.precoVenda || '';
  document.getElementById('produtoEstoqueAtual').value     = prod.estoqueAtual ?? 0;
  document.getElementById('produtoEstoqueMinimo').value    = prod.estoqueMinimo ?? 0;
  document.getElementById('produtoDescricao').value        = prod.descricao || '';
  document.getElementById('formProdutoTitulo').textContent = 'Editar Produto';
  App.composicaoTemp = (prod.composicao || []).map(item => ({ ...item }));
  renderComposicaoTemp();
  atualizarSelectInsumos();
  document.getElementById('formProdutoBody').style.display = 'block';
  document.getElementById('btnToggleFormProduto').textContent = '−';
  document.getElementById('produtoNome').focus();
  document.getElementById('formProdutoCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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

function resetFormProduto() {
  document.getElementById('formProduto').reset();
  document.getElementById('produtoId').value = '';
  document.getElementById('produtoRendimentoQtd').value = '';
  document.getElementById('produtoRendimentoUnidade').value = 'g';
  document.getElementById('produtoMargem').value = 80;
  document.getElementById('produtoDespesas').value = 0;
  document.getElementById('produtoPrecoVenda').value = '';
  document.getElementById('produtoEstoqueAtual').value = 0;
  document.getElementById('produtoEstoqueMinimo').value = 0;
  document.getElementById('formProdutoTitulo').textContent = 'Novo Produto';
  App.composicaoTemp = [];
  renderComposicaoTemp();
}

function calcularFatorProducao(produto, quantidadeBase) {
  const rendimento = parsearRendimentoProduto(produto.volume);
  if (!Number.isFinite(rendimento.quantidade) || rendimento.quantidade <= 0) return NaN;
  return quantidadeBase / rendimento.quantidade;
}

function verificarEstoqueParaProducao(produto, fatorProducao) {
  const avisos = [];
  for (const io of (produto.composicao || [])) {
    const item = normalizarItemComposicao(io);
    if (!item || item.quantidade <= 0) continue;
    const comp = obterComponenteComposicao(item);
    if (!comp) continue;
    const necessario = item.quantidade * fatorProducao;
    const disponivel = item.tipo === 'produto'
      ? (comp.estoqueAtual || 0)
      : (comp.estoqueAtual || 0);
    if (disponivel < necessario) {
      avisos.push({
        tipo: item.tipo,
        nome: comp.nome,
        disponivel,
        necessario,
        unidade: item.tipo === 'produto' ? obterUnidadeProduto(comp) : (comp.unidade || 'un'),
      });
    }
  }
  return avisos;
}

function consumirComponentesParaProducao(produto, fatorProducao, producaoId) {
  for (const io of (produto.composicao || [])) {
    const item = normalizarItemComposicao(io);
    if (!item || item.quantidade <= 0) continue;
    const qtdUsada = item.quantidade * fatorProducao;

    if (item.tipo === 'insumo') {
      const idx = App.insumos.findIndex(i => i.id === item.itemId);
      if (idx === -1) continue;
      const antes = App.insumos[idx].estoqueAtual || 0;
      App.insumos[idx].estoqueAtual = Math.max(0, antes - qtdUsada);
      registrarMovEstoque({
        alvoTipo: 'insumo',
        itemId: item.itemId,
        tipo: 'consumo_producao',
        quantidade: qtdUsada,
        saldoApos: App.insumos[idx].estoqueAtual,
        observacao: `Produção de ${produto.nome} ×${quantidade} (ref: ${producaoId})`,
      });
    } else {
      const idx = App.produtos.findIndex(p => p.id === item.itemId);
      if (idx === -1) continue;
      const antes = App.produtos[idx].estoqueAtual || 0;
      App.produtos[idx].estoqueAtual = Math.max(0, antes - qtdUsada);
      registrarMovEstoque({
        alvoTipo: 'produto',
        itemId: item.itemId,
        tipo: 'consumo_producao',
        quantidade: qtdUsada,
        saldoApos: App.produtos[idx].estoqueAtual,
        observacao: `Uso de produto em ${produto.nome} ×${quantidade} (ref: ${producaoId})`,
      });
    }
  }
}

async function registrarProducaoProduto() {
  const prodId = document.getElementById('producaoProduto').value;
  const qtd = parseFloat(document.getElementById('producaoQuantidade').value) || 0;
  const unidadeEntrada = document.getElementById('producaoQuantidadeUnidade').value;
  const obs = document.getElementById('producaoObservacao').value.trim();

  if (!prodId) { showToast('Selecione um produto acabado.', 'error'); return; }
  if (qtd <= 0) { showToast('Informe uma quantidade válida.', 'error'); return; }

  const prod = App.produtos.find(p => p.id === prodId);
  if (!prod) return;

  const unidadeBase = obterUnidadeProduto(prod);
  const quantidadeBase = converterQuantidade(qtd, unidadeEntrada, unidadeBase);
  if (!Number.isFinite(quantidadeBase) || quantidadeBase <= 0) {
    showToast(`Unidade incompatível. Use uma unidade compatível com ${unidadeBase}.`, 'error');
    return;
  }

  const fatorProducao = calcularFatorProducao(prod, quantidadeBase);
  if (!Number.isFinite(fatorProducao) || fatorProducao <= 0) {
    showToast('Não foi possível calcular o lote de produção.', 'error');
    return;
  }

  const avisos = verificarEstoqueParaProducao(prod, fatorProducao);
  if (avisos.length > 0) {
    showToast(`Estoque insuficiente para produzir: ${avisos.map(a => `${a.nome} (${formatNum(a.disponivel, 2)} ${a.unidade} / necessário ${formatNum(a.necessario, 2)} ${a.unidade})`).join(', ')}`, 'error');
    return;
  }

  const producaoId = gerarId();
  consumirComponentesParaProducao(prod, fatorProducao, producaoId);

  const idx = App.produtos.findIndex(p => p.id === prodId);
  if (idx === -1) return;
  App.produtos[idx].estoqueAtual = (App.produtos[idx].estoqueAtual || 0) + quantidadeBase;
  registrarMovEstoque({
    alvoTipo: 'produto',
    itemId: prodId,
    tipo: 'producao',
    quantidade: quantidadeBase,
    saldoApos: App.produtos[idx].estoqueAtual,
    observacao: obs || `Produção de ${prod.nome}`,
  });

  Storage.saveInsumos(App.insumos);
  Storage.saveProdutos(App.produtos);

  document.getElementById('producaoProduto').value = '';
  document.getElementById('producaoQuantidade').value = '';
  document.getElementById('producaoQuantidadeUnidade').value = 'ml';
  document.getElementById('producaoObservacao').value = '';

  renderEstoque();
  renderProdutos();
  atualizarSelectVendasReais();
  atualizarBadgeEstoque();
  showToast(`Produção registrada! ${prod.nome} +${formatNum(quantidadeBase, 2)} ${unidadeBase}`);
}

function abrirProducaoProduto(id) {
  navegarPara('estoque');
  const sel = document.getElementById('producaoProduto');
  if (sel) {
    sel.value = id;
    sel.dispatchEvent(new Event('change'));
  }
  atualizarUnidadeProducao();
  const qtd = document.getElementById('producaoQuantidade');
  if (qtd) qtd.focus();
}

function produtoTemCiclo(produtoId, composicao, produtoRascunho, visitados = new Set()) {
  if (visitados.has(produtoId)) return true;
  const produto = produtoRascunho && produtoRascunho.id === produtoId ? produtoRascunho : App.produtos.find(p => p.id === produtoId);
  if (!produto) return false;
  const prox = new Set(visitados);
  prox.add(produtoId);
  const itens = produtoRascunho && produtoRascunho.id === produtoId ? composicao : (produto.composicao || []);
  for (const io of itens) {
    const item = normalizarItemComposicao(io);
    if (!item || item.tipo !== 'produto') continue;
    if (item.itemId === produtoId) return true;
    if (produtoTemCiclo(item.itemId, composicao, produtoRascunho, prox)) return true;
  }
  return false;
}

document.getElementById('formProduto').addEventListener('submit', function(e) {
  e.preventDefault();
  const id              = document.getElementById('produtoId').value;
  const nome            = document.getElementById('produtoNome').value.trim();
  const rendimentoQtd   = parseFloat(document.getElementById('produtoRendimentoQtd').value);
  const rendimentoUnid  = document.getElementById('produtoRendimentoUnidade').value;
  const margem          = parseFloat(document.getElementById('produtoMargem').value) || 0;
  const despesas        = parseFloat(document.getElementById('produtoDespesas').value) || 0;
  const precoVenda      = parseFloat(document.getElementById('produtoPrecoVenda').value) || null;
  const estoqueAtual    = parseFloat(document.getElementById('produtoEstoqueAtual').value) || 0;
  const estoqueMinimo   = parseFloat(document.getElementById('produtoEstoqueMinimo').value) || 0;
  const descricao       = document.getElementById('produtoDescricao').value.trim();

  if (!nome) { showToast('Informe o nome do produto.', 'error'); return; }
  if (!Number.isFinite(rendimentoQtd) || rendimentoQtd <= 0) { showToast('Informe o rendimento.', 'error'); return; }

  const composicao = App.composicaoTemp.map(item => ({ ...item }));
  const rascunho = { id: id || gerarId(), composicao };
  if (produtoTemCiclo(rascunho.id, composicao, rascunho)) { showToast('Composição circular detectada!', 'error'); return; }

  const dados = { nome, volume: `${rendimentoQtd}${rendimentoUnid}`, rendimentoQtd, rendimentoUnidade: rendimentoUnid, margem, despesas, precoVenda, estoqueAtual, estoqueMinimo, descricao, composicao };

  if (id) {
    const idx = App.produtos.findIndex(p => p.id === id);
    if (idx !== -1) App.produtos[idx] = { ...App.produtos[idx], ...dados };
    showToast(`"${nome}" atualizado!`);
  } else {
    App.produtos.push({ id: gerarId(), ...dados });
    showToast(`"${nome}" cadastrado!`);
  }
  Storage.saveProdutos(App.produtos);
  resetFormProduto();
  renderProdutos();
  atualizarSelectCalculo();
  atualizarSelectVendasReais();
});

// ============================================================
//  COMPOSIÇÃO TEMPORÁRIA
// ============================================================

function atualizarUnidadeHint() {
  const sel = document.getElementById('selectInsumoComposicao');
  const id = sel.value;
  const hint = document.getElementById('unidadeHintComposicao');
  const unidSel = document.getElementById('unidadeInsumoComposicao');
  const option = sel.options[sel.selectedIndex];
  const tipo = option ? option.dataset.tipo : '';
  const item = tipo === 'produto' ? App.produtos.find(p => p.id === id) : App.insumos.find(i => i.id === id);
  if (!item) { hint.textContent = '—'; return; }
  const unidade = tipo === 'produto' ? parsearRendimentoProduto(item.volume).unidade || 'un' : (item.unidade || 'un');
  hint.textContent = unidade;
  if (unidSel) unidSel.value = unidade;
}

function atualizarSelectInsumos() {
  const sel = document.getElementById('selectInsumoComposicao');
  const val = sel.value;
  const produtoEditandoId = document.getElementById('produtoId').value;
  sel.innerHTML = '<option value="">Selecione um componente...</option>';
  if (App.insumos.length > 0) {
    const g = document.createElement('optgroup');
    g.label = 'Insumos';
    App.insumos.forEach(ins => {
      const opt = document.createElement('option');
      opt.value = ins.id;
      opt.dataset.tipo = 'insumo';
      opt.textContent = `${ins.nome} (${ins.unidade}) — estq: ${formatNum(ins.estoqueAtual || 0, 2)}`;
      g.appendChild(opt);
    });
    sel.appendChild(g);
  }
  const disponiveis = App.produtos.filter(p => p.id !== produtoEditandoId);
  if (disponiveis.length > 0) {
    const g = document.createElement('optgroup');
    g.label = 'Produtos acabados';
    disponiveis.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.dataset.tipo = 'produto';
      opt.textContent = `${p.nome}${p.volume ? ` (${p.volume})` : ''}`;
      g.appendChild(opt);
    });
    sel.appendChild(g);
  }
  sel.value = val;
}

function renderComposicaoTemp() {
  const tbody = document.getElementById('tbodyComposicao');
  if (!App.composicaoTemp.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Nenhum componente adicionado.</td></tr>`;
    document.getElementById('custoTotalComposicao').textContent = formatBRL(0);
    document.getElementById('precoSugeridoComposicao').textContent = formatBRL(0);
    return;
  }
  let total = 0;
  tbody.innerHTML = App.composicaoTemp.map((io, idx) => {
    const item = normalizarItemComposicao(io);
    if (!item) return '';
    const comp = obterComponenteComposicao(item);
    if (!comp) return '';
    const custoUnit = obterCustoUnitarioComponente(item);
    if (Number.isNaN(custoUnit)) {
      return `<tr><td colspan="5" style="color:var(--coral)">Ciclo detectado em "${comp.nome}"</td><td><button class="btn-delete" onclick="removerItemComposicao(${idx})">✕</button></td></tr>`;
    }
    const custo = custoUnit * item.quantidade;
    total += custo;
    const estoqueDisp = item.tipo === 'insumo' ? `${formatNum(comp.estoqueAtual || 0, 2)} ${comp.unidade}` : '—';
    const estoqueOk = item.tipo === 'insumo' && (comp.estoqueAtual || 0) >= item.quantidade;
    return `
      <tr>
        <td><span class="tag ${item.tipo === 'produto' ? 'tag-produto' : 'tag-fruta'}">${obterRotuloComponente(item)}</span> ${comp.nome}</td>
        <td>${formatNum(item.quantidade, 3)}</td>
        <td>${obterUnidadeComponente(item)}</td>
        <td style="color:var(--coral-light)">${formatBRL(custo)}</td>
        <td style="color:${estoqueOk || item.tipo === 'produto' ? 'var(--green)' : 'var(--coral)'}">
          ${estoqueDisp}
        </td>
        <td><button class="btn-delete" onclick="removerItemComposicao(${idx})">✕</button></td>
      </tr>
    `;
  }).join('');
  document.getElementById('custoTotalComposicao').textContent = formatBRL(total);
  // Preview preço sugerido
  const margem = parseFloat(document.getElementById('produtoMargem').value) || 0;
  const despesas = parseFloat(document.getElementById('produtoDespesas').value) || 0;
  const precoSug = (total + despesas) * (1 + margem / 100);
  document.getElementById('precoSugeridoComposicao').textContent = formatBRL(precoSug);
}

function removerItemComposicao(idx) {
  App.composicaoTemp.splice(idx, 1);
  renderComposicaoTemp();
}

document.getElementById('btnAdicionarInsumo').addEventListener('click', () => {
  const sel = document.getElementById('selectInsumoComposicao');
  const insId = sel.value;
  const option = sel.options[sel.selectedIndex];
  const tipo = option ? option.dataset.tipo : '';
  const qtdEl = document.getElementById('qtdInsumoComposicao');
  const unidEl = document.getElementById('unidadeInsumoComposicao');
  const qtd = parseFloat(qtdEl.value);
  const unidade = unidEl ? unidEl.value : '';
  if (!insId || !tipo) { showToast('Selecione um componente.', 'error'); return; }
  if (!qtd || qtd <= 0) { showToast('Informe uma quantidade válida.', 'error'); return; }
  const produtoEditandoId = document.getElementById('produtoId').value;
  if (tipo === 'produto' && insId === produtoEditandoId) { showToast('Um produto não pode compor a si mesmo.', 'error'); return; }
  const jaExiste = App.composicaoTemp.findIndex(i => {
    const it = normalizarItemComposicao(i);
    return it && it.tipo === tipo && it.itemId === insId;
  });
  if (jaExiste !== -1) {
    const itemAtual = normalizarItemComposicao(App.composicaoTemp[jaExiste]);
    App.composicaoTemp[jaExiste] = { ...itemAtual, quantidade: itemAtual.quantidade + qtd, unidade: unidade || itemAtual.unidade };
  } else {
    App.composicaoTemp.push({ tipo, itemId: insId, quantidade: qtd, unidade });
  }
  sel.value = '';
  qtdEl.value = '';
  if (unidEl) unidEl.value = 'g';
  document.getElementById('unidadeHintComposicao').textContent = '—';
  renderComposicaoTemp();
});

// ============================================================
//  CÁLCULOS
// ============================================================

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
  if (!App.produtos.length) {
    document.getElementById('semProdutos').classList.remove('hidden');
    document.getElementById('painelCalculo').classList.add('hidden');
    return;
  }
  document.getElementById('semProdutos').classList.add('hidden');
  const val = document.getElementById('selectProdutoCalculo').value;
  if (val) renderDetalheCalculo(val);
  else document.getElementById('painelCalculo').classList.add('hidden');
}

function renderDetalheCalculo(produtoId) {
  const prod = App.produtos.find(p => p.id === produtoId);
  if (!prod) return;
  const c = calcularProduto(prod);
  document.getElementById('painelCalculo').classList.remove('hidden');
  document.getElementById('calcNomeProduto').textContent   = prod.nome;
  document.getElementById('calcVolumeProduto').textContent = prod.volume || '—';
  document.getElementById('calcCustoInsumos').textContent  = c.ciclo ? 'Inválido' : formatBRL(c.custoInsumos);
  document.getElementById('calcDespesas').textContent      = c.ciclo ? '—' : formatBRL(c.despesas);
  document.getElementById('calcCustoTotal').textContent    = c.ciclo ? '—' : formatBRL(c.custoTotal);
  document.getElementById('calcMargem').textContent        = prod.margem + '%';
  document.getElementById('calcPrecoSugerido').textContent = c.ciclo ? '—' : formatBRL(c.precoSugerido);
  document.getElementById('calcLucro').textContent         = c.ciclo ? '—' : formatBRL(c.lucro);
  const tbody = document.getElementById('tbodyDetalheCalculo');
  if (!prod.composicao || !prod.composicao.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Nenhum componente.</td></tr>`;
  } else {
    tbody.innerHTML = prod.composicao.map(io => {
      const item = normalizarItemComposicao(io);
      if (!item) return `<tr><td colspan="6" style="color:var(--text-muted)">Componente inválido</td></tr>`;
      const comp = obterComponenteComposicao(item);
      if (!comp) return `<tr><td colspan="6" style="color:var(--text-muted)">Componente removido</td></tr>`;
      const custoUnit = obterCustoUnitarioComponente(item);
      if (Number.isNaN(custoUnit)) return `<tr><td colspan="6" style="color:var(--coral)">Ciclo em ${comp.nome}</td></tr>`;
      const custoItem = custoUnit * item.quantidade;
      const pct = c.custoInsumos > 0 ? (custoItem / c.custoInsumos * 100) : 0;
      const unidade = obterUnidadeComponente(item);
      return `
        <tr>
          <td>${obterRotuloComponente(item)}: ${comp.nome}</td>
          <td>${item.tipo === 'produto' ? '<span class="tag tag-produto">Produto</span>' : badgeCategoria(comp.categoria)}</td>
          <td>${formatNum(item.quantidade, 3)} ${unidade}</td>
          <td>${formatBRL(custoUnit)} / ${unidade}</td>
          <td style="color:var(--coral-light);font-weight:600">${formatBRL(custoItem)}</td>
          <td>
            <div class="pct-bar">
              <div class="pct-bar-track"><div class="pct-bar-fill" style="width:${Math.min(pct,100)}%"></div></div>
              <span class="pct-label">${pct.toFixed(1)}%</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
  document.getElementById('simMargem').value = prod.margem;
  atualizarSimulador(prod, c.custoTotal);
}

function atualizarSimulador(prod, custoTotal) {
  const margem = Math.max(0, parseFloat(document.getElementById('simMargem').value) || 0);
  const markup = margem / 100;
  document.getElementById('simMargemVal').textContent = margem + '%';
  document.getElementById('simPreco').textContent = formatBRL(custoTotal * (1 + markup));
  document.getElementById('simLucro').textContent = formatBRL(custoTotal * markup);
}

// ============================================================
//  VENDAS REAIS
// ============================================================

function verificarEstoqueVendaProduto(produto, quantidade) {
  const disponivel = produto.estoqueAtual || 0;
  if (disponivel < quantidade) {
    return [{ produto: produto.nome, disponivel, necessario: quantidade, unidade: obterUnidadeProduto(produto) }];
  }
  return [];
}

function baixarEstoqueProduto(produto, quantidade, vendaId) {
  const idx = App.produtos.findIndex(p => p.id === produto.id);
  if (idx === -1) return;
  const antes = App.produtos[idx].estoqueAtual || 0;
  App.produtos[idx].estoqueAtual = Math.max(0, antes - quantidade);
  registrarMovEstoque({
    alvoTipo: 'produto',
    itemId: produto.id,
    tipo: 'venda',
    quantidade,
    saldoApos: App.produtos[idx].estoqueAtual,
    observacao: `Venda: ${produto.nome} ×${quantidade} (ref: ${vendaId})`,
  });
  Storage.saveProdutos(App.produtos);
}

function atualizarSelectVendasReais() {
  const sels = ['vendaRealProduto', 'filtroVendasProduto'];
  sels.forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = selId === 'filtroVendasProduto' ? '<option value="">Todos os produtos</option>' : '<option value="">— Selecione um produto —</option>';
    App.produtos.filter(p => !calcularProduto(p).ciclo).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.nome}${p.volume ? ` (${p.volume})` : ''} — estq: ${formatNum(p.estoqueAtual || 0, 2)} ${obterUnidadeProduto(p)}`;
      sel.appendChild(opt);
    });
    sel.value = val;
  });
}

function atualizarPreviewVenda() {
  const prodId   = document.getElementById('vendaRealProduto').value;
  const qtd      = parseFloat(document.getElementById('vendaRealQtd').value) || 0;
  const precoUnit = parseFloat(document.getElementById('vendaRealPreco').value) || 0;
  const desconto = parseFloat(document.getElementById('vendaRealDesconto').value) || 0;
  const preview  = document.getElementById('previewVenda');

  if (!prodId || qtd <= 0 || precoUnit <= 0) { preview.classList.add('hidden'); return; }

  const prod = App.produtos.find(p => p.id === prodId);
  if (!prod) { preview.classList.add('hidden'); return; }

  const c = calcularProduto(prod);
  const precoFinal = precoUnit * (1 - desconto / 100);
  const totalFinal = precoFinal * qtd;
  const custoTotal = c.custoTotal * qtd;
  const lucro = totalFinal - custoTotal;
  const margem = totalFinal > 0 ? (lucro / totalFinal) * 100 : 0;

  document.getElementById('pvPrecoTotal').textContent = formatBRL(totalFinal);
  document.getElementById('pvCustoTotal').textContent = formatBRL(custoTotal);
  document.getElementById('pvLucro').textContent = formatBRL(lucro);
  document.getElementById('pvMargem').textContent = `${margem.toFixed(1)}%`;
  document.getElementById('pvLucro').style.color = lucro >= 0 ? 'var(--green)' : 'var(--coral)';

  // Verifica alertas de estoque
  const avisos = verificarEstoqueVendaProduto(prod, qtd);
  const avisoEl = document.getElementById('pvAvisoEstoque');
  if (avisos.length > 0) {
    avisoEl.classList.remove('hidden');
    avisoEl.textContent = `⚠ Estoque insuficiente: ${avisos.map(a => `${a.produto} (dispon: ${formatNum(a.disponivel,2)} ${a.unidade}, necessário: ${formatNum(a.necessario,2)} ${a.unidade})`).join(', ')}`;
  } else {
    avisoEl.classList.add('hidden');
  }

  preview.classList.remove('hidden');
}

document.getElementById('vendaRealProduto').addEventListener('change', function() {
  const prod = App.produtos.find(p => p.id === this.value);
  if (prod && prod.precoVenda) {
    document.getElementById('vendaRealPreco').value = prod.precoVenda.toFixed(2);
  } else if (prod) {
    const c = calcularProduto(prod);
    if (c.precoSugerido) document.getElementById('vendaRealPreco').value = c.precoSugerido.toFixed(2);
  }
  atualizarPreviewVenda();
});

['vendaRealQtd','vendaRealPreco','vendaRealDesconto'].forEach(id => {
  document.getElementById(id).addEventListener('input', atualizarPreviewVenda);
});

document.getElementById('btnRegistrarVenda').addEventListener('click', async () => {
  const prodId   = document.getElementById('vendaRealProduto').value;
  const qtd      = parseFloat(document.getElementById('vendaRealQtd').value) || 0;
  const precoUnit = parseFloat(document.getElementById('vendaRealPreco').value) || 0;
  const desconto = parseFloat(document.getElementById('vendaRealDesconto').value) || 0;
  const canal    = document.getElementById('vendaRealCanal').value;
  const obs      = document.getElementById('vendaRealObs').value.trim();

  if (!prodId) { showToast('Selecione um produto.', 'error'); return; }
  if (qtd <= 0) { showToast('Informe uma quantidade válida.', 'error'); return; }
  if (precoUnit <= 0) { showToast('Informe o preço unitário.', 'error'); return; }

  const prod = App.produtos.find(p => p.id === prodId);
  if (!prod) return;

  const avisos = verificarEstoqueVendaProduto(prod, qtd);
  if (avisos.length > 0) {
    showToast(`Estoque insuficiente para ${prod.nome}. Produza mais unidades antes de registrar a venda.`, 'error');
    return;
  }

  const c = calcularProduto(prod);
  const precoFinal = precoUnit * (1 - desconto / 100);
  const totalFinal = precoFinal * qtd;
  const custoTotal = c.custoTotal * qtd;
  const lucro = totalFinal - custoTotal;

  const vendaId = gerarId();
  const venda = {
    id: vendaId,
    produtoId: prodId,
    produtoNome: prod.nome,
    quantidade: qtd,
    precoUnitario: precoUnit,
    desconto,
    precoFinal,
    totalFinal,
    custoTotal,
    lucro,
    canal,
    observacao: obs,
    data: new Date().toISOString(),
  };

  App.vendas.push(venda);
  Storage.saveVendas(App.vendas);

  baixarEstoqueProduto(prod, qtd, vendaId);

  // Reset
  document.getElementById('vendaRealProduto').value = '';
  document.getElementById('vendaRealQtd').value = 1;
  document.getElementById('vendaRealPreco').value = '';
  document.getElementById('vendaRealDesconto').value = 0;
  document.getElementById('vendaRealObs').value = '';
  document.getElementById('previewVenda').classList.add('hidden');

  renderVendasReais();
  if (App.paginaAtual === 'dashboard') renderDashboard();
  atualizarBadgeEstoque();
  showToast(`Venda registrada! ${formatBRL(totalFinal)} | Lucro: ${formatBRL(lucro)}`);
});

document.getElementById('btnCancelarVendaReal').addEventListener('click', () => {
  document.getElementById('vendaRealProduto').value = '';
  document.getElementById('vendaRealQtd').value = 1;
  document.getElementById('vendaRealPreco').value = '';
  document.getElementById('vendaRealDesconto').value = 0;
  document.getElementById('vendaRealObs').value = '';
  document.getElementById('previewVenda').classList.add('hidden');
});

function renderVendasReais() {
  atualizarSelectVendasReais();

  // Stats de hoje
  const hoje = new Date().toDateString();
  const vendasHoje = App.vendas.filter(v => new Date(v.data).toDateString() === hoje);
  const fatHoje   = vendasHoje.reduce((a, v) => a + v.totalFinal, 0);
  const lucroHoje = vendasHoje.reduce((a, v) => a + v.lucro, 0);
  const custoHoje = vendasHoje.reduce((a, v) => a + v.custoTotal, 0);
  const margemHoje = fatHoje > 0 ? (lucroHoje / fatHoje) * 100 : 0;

  document.getElementById('statsVendasHoje').innerHTML = `
    <div class="stat-card" style="--accent-color:var(--acai-light)">
      <div class="stat-label">Vendas Hoje</div>
      <div class="stat-value">${vendasHoje.length}</div>
      <div class="stat-sub">registros</div>
    </div>
    <div class="stat-card" style="--accent-color:var(--green)">
      <div class="stat-label">Faturamento Hoje</div>
      <div class="stat-value" style="font-size:1.3rem">${formatBRL(fatHoje)}</div>
      <div class="stat-sub">receita bruta</div>
    </div>
    <div class="stat-card" style="--accent-color:var(--coral)">
      <div class="stat-label">Custo Hoje</div>
      <div class="stat-value" style="font-size:1.3rem">${formatBRL(custoHoje)}</div>
      <div class="stat-sub">custo dos produtos</div>
    </div>
    <div class="stat-card" style="--accent-color:#80b3ff">
      <div class="stat-label">Lucro Hoje</div>
      <div class="stat-value" style="font-size:1.3rem;color:${lucroHoje >= 0 ? 'var(--green)' : 'var(--coral)'}">${formatBRL(lucroHoje)}</div>
      <div class="stat-sub">${margemHoje.toFixed(1)}% de margem</div>
    </div>
  `;

  renderHistoricoVendas();
}

function renderHistoricoVendas() {
  const tbody   = document.getElementById('tbodyVendasReais');
  const periodo = document.getElementById('filtroVendasPeriodo').value;
  const prodFiltro = document.getElementById('filtroVendasProduto').value;

  const agora = new Date();
  let lista = [...App.vendas].sort((a, b) => new Date(b.data) - new Date(a.data));

  if (periodo === 'hoje') {
    lista = lista.filter(v => new Date(v.data).toDateString() === agora.toDateString());
  } else if (periodo === 'semana') {
    const inicio = new Date(agora); inicio.setDate(agora.getDate() - 7);
    lista = lista.filter(v => new Date(v.data) >= inicio);
  } else if (periodo === 'mes') {
    lista = lista.filter(v => {
      const d = new Date(v.data);
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    });
  }

  if (prodFiltro) lista = lista.filter(v => v.produtoId === prodFiltro);

  if (!lista.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9">Nenhuma venda no período.</td></tr>`;
    document.getElementById('totaisVendas').innerHTML = '';
    return;
  }

  tbody.innerHTML = lista.map(v => `
    <tr>
      <td style="white-space:nowrap;font-size:.82rem">${formatDateTime(v.data)}</td>
      <td><strong>${v.produtoNome}</strong></td>
      <td>${v.quantidade}</td>
      <td>${formatBRL(v.precoFinal)}</td>
      <td style="font-weight:600">${formatBRL(v.totalFinal)}</td>
      <td style="color:var(--coral)">${formatBRL(v.custoTotal)}</td>
      <td style="color:${v.lucro >= 0 ? 'var(--green)' : 'var(--coral)'};font-weight:600">${formatBRL(v.lucro)}</td>
      <td>${badgeCanal(v.canal)}</td>
      <td>
        <button class="btn-delete" onclick="excluirVenda('${v.id}')" title="Excluir venda">✕</button>
      </td>
    </tr>
  `).join('');

  const totalFat  = lista.reduce((a, v) => a + v.totalFinal, 0);
  const totalCust = lista.reduce((a, v) => a + v.custoTotal, 0);
  const totalLuc  = lista.reduce((a, v) => a + v.lucro, 0);
  const margTotal = totalFat > 0 ? (totalLuc / totalFat * 100) : 0;

  document.getElementById('totaisVendas').innerHTML = `
    <div class="totais-row">
      <span><strong>${lista.length}</strong> venda(s)</span>
      <span>Faturamento: <strong style="color:var(--green)">${formatBRL(totalFat)}</strong></span>
      <span>Custo: <strong style="color:var(--coral)">${formatBRL(totalCust)}</strong></span>
      <span>Lucro: <strong style="color:${totalLuc >= 0 ? 'var(--green)' : 'var(--coral)'}">${formatBRL(totalLuc)}</strong></span>
      <span>Margem: <strong>${margTotal.toFixed(1)}%</strong></span>
    </div>
  `;
}

async function excluirVenda(id) {
  const ok = await confirmar('Excluir Venda', 'Atenção: o estoque NÃO será restaurado. Deseja excluir este registro?');
  if (!ok) return;
  App.vendas = App.vendas.filter(v => v.id !== id);
  Storage.saveVendas(App.vendas);
  renderHistoricoVendas();
  renderVendasReais();
  showToast('Venda excluída.');
}

// ============================================================
//  SIMULAÇÃO
// ============================================================

function atualizarSelectSimulacao() {
  const sel = document.getElementById('selectProdutoVenda');
  const val = sel.value;
  sel.innerHTML = '<option value="">— Selecione um produto —</option>';
  App.produtos.filter(p => !calcularProduto(p).ciclo).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.nome}${p.volume ? ` (${p.volume})` : ''}`;
    sel.appendChild(opt);
  });
  sel.value = val;
}

function renderSimulacao() {
  atualizarSelectSimulacao();
  const sel = document.getElementById('selectProdutoVenda');
  if (!App.produtos.length) {
    document.getElementById('semVenda').classList.remove('hidden');
    document.getElementById('painelVenda').classList.add('hidden');
    return;
  }
  document.getElementById('semVenda').classList.remove('hidden');
  document.getElementById('painelVenda').classList.add('hidden');
  if (sel.value) atualizarSimulacaoVenda();
}

function atualizarSimulacaoVenda() {
  const prodId = document.getElementById('selectProdutoVenda').value;
  const prod   = App.produtos.find(p => p.id === prodId);
  if (!prod) { document.getElementById('painelVenda').classList.add('hidden'); document.getElementById('semVenda').classList.remove('hidden'); return; }
  const c = calcularProduto(prod);
  if (c.ciclo) { showToast('Produto com composição inválida.', 'error'); return; }
  const metaDiaria = Math.max(0, parseFloat(document.getElementById('vendaMetaDiaria').value) || 0);
  const quantidade = Math.max(0, parseFloat(document.getElementById('vendaQuantidade').value) || 0);
  const diasMes    = Math.min(31, Math.max(1, parseFloat(document.getElementById('vendaDiasMes').value) || 30));
  const desconto   = Math.min(100, Math.max(0, parseFloat(document.getElementById('vendaDesconto').value) || 0));
  const precoInp   = document.getElementById('vendaPrecoUnitario');
  const precoBase  = parseFloat(precoInp.value) || c.precoSugerido;
  if (!precoInp.value) precoInp.value = c.precoSugerido ? c.precoSugerido.toFixed(2) : '';
  const precoFinal = precoBase * (1 - desconto / 100);
  const fatDia     = precoFinal * quantidade;
  const custoDia   = c.custoTotal * quantidade;
  const lucroDia   = fatDia - custoDia;
  const fatMes     = fatDia * diasMes;
  const custoMes   = custoDia * diasMes;
  const lucroMes   = lucroDia * diasMes;
  const qtdMes     = quantidade * diasMes;
  const metaMes    = metaDiaria * diasMes;
  const metaAtingida = metaMes > 0 ? (qtdMes / metaMes) * 100 : 0;
  const margem     = fatDia > 0 ? (lucroDia / fatDia) * 100 : 0;
  document.getElementById('semVenda').classList.add('hidden');
  document.getElementById('painelVenda').classList.remove('hidden');
  document.getElementById('vendaFaturamento').textContent    = formatBRL(fatDia);
  document.getElementById('vendaCustoTotal').textContent     = formatBRL(custoDia);
  document.getElementById('vendaLucro').textContent          = formatBRL(lucroDia);
  document.getElementById('vendaMargem').textContent         = `${margem.toFixed(1)}%`;
  document.getElementById('vendaQuantidadeMes').textContent  = formatNum(qtdMes, 0);
  document.getElementById('vendaFaturamentoMes').textContent = formatBRL(fatMes);
  document.getElementById('vendaLucroMes').textContent       = formatBRL(lucroMes);
  document.getElementById('vendaMetaAtingida').textContent   = `${metaAtingida.toFixed(1)}%`;
}

// ============================================================
//  EXPORTAR
// ============================================================

function exportarRelatorio() {
  const linhas = App.produtos.map(prod => {
    const c = calcularProduto(prod);
    return `<tr>
      <td>${prod.nome}</td><td>${prod.volume || '—'}</td>
      <td>${formatBRL(c.custoInsumos)}</td><td>${formatBRL(c.despesas)}</td>
      <td>${formatBRL(c.custoTotal)}</td><td>${prod.margem}%</td>
      <td>${formatBRL(c.precoSugerido)}</td><td>${formatBRL(c.lucro)}</td>
    </tr>`;
  }).join('');

  // Vendas do mês
  const agora = new Date();
  const vendasMes = App.vendas.filter(v => {
    const d = new Date(v.data);
    return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
  });
  const linhasVendas = vendasMes.map(v => `<tr>
    <td>${formatDateTime(v.data)}</td><td>${v.produtoNome}</td><td>${v.quantidade}</td>
    <td>${formatBRL(v.precoFinal)}</td><td>${formatBRL(v.totalFinal)}</td>
    <td>${formatBRL(v.lucro)}</td><td>${v.canal}</td>
  </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>AçaíPrice — Relatório</title>
  <style>body{font-family:Arial,sans-serif;font-size:12px;color:#222}h1{color:#5d4b8a}h2{color:#5d4b8a;font-size:14px;margin:24px 0 8px}
  p{color:#888;margin-bottom:16px}table{width:100%;border-collapse:collapse;margin-bottom:24px}
  th{background:#5d4b8a;color:#fff;padding:8px;text-align:left;font-size:11px}td{padding:7px 8px;border-bottom:1px solid #eee}</style></head>
  <body><h1>🫐 AçaíPrice — Relatório</h1><p>Gerado em ${new Date().toLocaleString('pt-BR')}</p>
  <h2>Precificação de Produtos</h2>
  <table><thead><tr><th>Produto</th><th>Volume</th><th>Custo Insumos</th><th>Despesas</th><th>Custo Total</th><th>Margem</th><th>Preço Sugerido</th><th>Lucro/Un.</th></tr></thead><tbody>${linhas}</tbody></table>
  <h2>Vendas do Mês</h2>
  <table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Preço Unit.</th><th>Total</th><th>Lucro</th><th>Canal</th></tr></thead><tbody>${linhasVendas}</tbody></table>
  <script>window.onload=()=>{window.print()}<\/script></body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

// ============================================================
//  DADOS MOCK
// ============================================================

function carregarDadosMock() {
  const ids = Array.from({ length: 8 }, () => gerarId());
  const [i1,i2,i3,i4,i5,i6,i7,i8] = ids;
  const insumos = [
    { id:i1, nome:'Polpa de Açaí Grosso',  categoria:'fruta',       unidade:'kg',  qtdComprada:10,  precoPago:85.00, custoUnitario:8.50,    estoqueAtual:8.5, estoqueMinimo:2, fornecedor:'Distribuidora Amazônia' },
    { id:i2, nome:'Leite Condensado',       categoria:'laticinios',  unidade:'g',   qtdComprada:395, precoPago:5.99,  custoUnitario:0.01516, estoqueAtual:790, estoqueMinimo:200, fornecedor:'' },
    { id:i3, nome:'Leite em Pó Integral',   categoria:'laticinios',  unidade:'g',   qtdComprada:400, precoPago:12.90, custoUnitario:0.03225, estoqueAtual:400, estoqueMinimo:100, fornecedor:'' },
    { id:i4, nome:'Granola Premium',        categoria:'complemento', unidade:'g',   qtdComprada:500, precoPago:9.50,  custoUnitario:0.019,   estoqueAtual:150, estoqueMinimo:200, fornecedor:'Mercado Central' },
    { id:i5, nome:'Morango Congelado',      categoria:'fruta',       unidade:'g',   qtdComprada:1000,precoPago:18.00, custoUnitario:0.018,   estoqueAtual:0,   estoqueMinimo:300, fornecedor:'' },
    { id:i6, nome:'Garrafa PET 500ml',      categoria:'embalagem',   unidade:'un',  qtdComprada:100, precoPago:38.00, custoUnitario:0.38,    estoqueAtual:85,  estoqueMinimo:20,  fornecedor:'Embalagens Brasil' },
    { id:i7, nome:'Tampa Rosca',            categoria:'embalagem',   unidade:'un',  qtdComprada:100, precoPago:8.00,  custoUnitario:0.08,    estoqueAtual:85,  estoqueMinimo:20,  fornecedor:'' },
    { id:i8, nome:'Etiqueta Personalizada', categoria:'embalagem',   unidade:'un',  qtdComprada:200, precoPago:25.00, custoUnitario:0.125,   estoqueAtual:180, estoqueMinimo:50,  fornecedor:'' },
  ];
  const [p1,p2,p3] = [gerarId(),gerarId(),gerarId()];
  const produtos = [
    { id:p1, nome:'Açaí Tradicional',  volume:'300ml', margem:75, despesas:0.20, precoVenda:12.90, descricao:'Açaí puro com granola',
      estoqueAtual:12, estoqueMinimo:3,
      composicao:[{tipo:'insumo',itemId:i1,quantidade:0.25,unidade:'kg'},{tipo:'insumo',itemId:i4,quantidade:30,unidade:'g'},{tipo:'insumo',itemId:i6,quantidade:1,unidade:'un'},{tipo:'insumo',itemId:i7,quantidade:1,unidade:'un'},{tipo:'insumo',itemId:i8,quantidade:1,unidade:'un'}] },
    { id:p2, nome:'Açaí Cremoso',      volume:'500ml', margem:80, despesas:0.30, precoVenda:18.90, descricao:'Com leite condensado e granola',
      estoqueAtual:8, estoqueMinimo:2,
      composicao:[{tipo:'insumo',itemId:i1,quantidade:0.38,unidade:'kg'},{tipo:'insumo',itemId:i2,quantidade:60,unidade:'g'},{tipo:'insumo',itemId:i3,quantidade:20,unidade:'g'},{tipo:'insumo',itemId:i4,quantidade:40,unidade:'g'},{tipo:'insumo',itemId:i6,quantidade:1,unidade:'un'},{tipo:'insumo',itemId:i7,quantidade:1,unidade:'un'},{tipo:'insumo',itemId:i8,quantidade:1,unidade:'un'}] },
    { id:p3, nome:'Açaí com Morango',  volume:'1l',    margem:70, despesas:0.50, precoVenda:28.00, descricao:'Açaí, morango e granola premium',
      estoqueAtual:4, estoqueMinimo:1,
      composicao:[{tipo:'insumo',itemId:i1,quantidade:0.7,unidade:'kg'},{tipo:'insumo',itemId:i5,quantidade:150,unidade:'g'},{tipo:'insumo',itemId:i4,quantidade:60,unidade:'g'},{tipo:'insumo',itemId:i2,quantidade:80,unidade:'g'},{tipo:'insumo',itemId:i6,quantidade:2,unidade:'un'},{tipo:'insumo',itemId:i7,quantidade:2,unidade:'un'},{tipo:'insumo',itemId:i8,quantidade:1,unidade:'un'}] },
  ];
  Storage.saveInsumos(insumos);
  Storage.saveProdutos(produtos);
  return { insumos, produtos };
}

// ============================================================
//  INICIALIZAÇÃO
// ============================================================

function init() {
  App.insumos     = Storage.getInsumos();
  App.produtos    = Storage.getProdutos().map(prod => ({
    estoqueAtual: 0,
    estoqueMinimo: 0,
    ...prod,
    estoqueAtual: Number.isFinite(parseFloat(prod.estoqueAtual)) ? parseFloat(prod.estoqueAtual) : 0,
    estoqueMinimo: Number.isFinite(parseFloat(prod.estoqueMinimo)) ? parseFloat(prod.estoqueMinimo) : 0,
  }));
  App.vendas      = Storage.getVendas();
  App.movEstoque  = Storage.getMovEstoque();

  if (!App.insumos.length && !App.produtos.length) {
    const mock = carregarDadosMock();
    App.insumos  = mock.insumos;
    App.produtos = mock.produtos;
  }

  Storage.saveProdutos(App.produtos);

  renderDashboard();
  renderInsumos();
  renderProdutos();
  atualizarSelectInsumos();
  atualizarSelectCalculo();
  atualizarSelectVendasReais();
  atualizarBadgeEstoque();

  // Navegação
  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navegarPara(btn.dataset.page));
  });

  // Menu mobile
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('open');
  });

  // Toggle formulários
  document.getElementById('btnToggleFormInsumo').addEventListener('click', function() {
    const body = document.getElementById('formInsumoBody');
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? 'block' : 'none';
    this.textContent = hidden ? '−' : '+';
  });
  document.getElementById('btnCancelarInsumo').addEventListener('click', resetFormInsumo);

  document.getElementById('btnToggleFormProduto').addEventListener('click', function() {
    const body = document.getElementById('formProdutoBody');
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? 'block' : 'none';
    this.textContent = hidden ? '−' : '+';
  });
  document.getElementById('btnCancelarProduto').addEventListener('click', resetFormProduto);

  // Custo unitário em tempo real
  ['insumoQtd','insumoPreco','insumoUnidade'].forEach(id => {
    document.getElementById(id).addEventListener('input', atualizarCustoUnitario);
    document.getElementById(id).addEventListener('change', atualizarCustoUnitario);
  });

  // Preview composição ao mudar margem/despesas
  ['produtoMargem','produtoDespesas'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderComposicaoTemp);
  });

  // Busca
  document.getElementById('buscaInsumo').addEventListener('input', function() {
    renderInsumos(this.value, document.getElementById('filtroCategoria').value);
  });
  document.getElementById('filtroCategoria').addEventListener('change', function() {
    renderInsumos(document.getElementById('buscaInsumo').value, this.value);
  });
  document.getElementById('buscaProduto').addEventListener('input', function() {
    renderProdutos(this.value);
  });

  // Composição
  document.getElementById('selectInsumoComposicao').addEventListener('change', atualizarUnidadeHint);

  // Cálculos
  document.getElementById('selectProdutoCalculo').addEventListener('change', function() {
    if (this.value) renderDetalheCalculo(this.value);
    else document.getElementById('painelCalculo').classList.add('hidden');
  });
  document.getElementById('simMargem').addEventListener('input', function() {
    const prodId = document.getElementById('selectProdutoCalculo').value;
    const prod   = App.produtos.find(p => p.id === prodId);
    if (!prod) return;
    atualizarSimulador(prod, calcularProduto(prod).custoTotal);
  });

  // Simulação
  document.getElementById('selectProdutoVenda').addEventListener('change', atualizarSimulacaoVenda);
  ['vendaMetaDiaria','vendaQuantidade','vendaDiasMes','vendaPrecoUnitario','vendaDesconto'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      if (document.getElementById('selectProdutoVenda').value) atualizarSimulacaoVenda();
    });
  });
  document.getElementById('btnSimularVenda').addEventListener('click', atualizarSimulacaoVenda);
  document.getElementById('btnLimparVenda').addEventListener('click', () => {
    document.getElementById('selectProdutoVenda').value = '';
    document.getElementById('vendaMetaDiaria').value = 10;
    document.getElementById('vendaQuantidade').value = 10;
    document.getElementById('vendaDiasMes').value = 30;
    document.getElementById('vendaPrecoUnitario').value = '';
    document.getElementById('vendaDesconto').value = 0;
    document.getElementById('painelVenda').classList.add('hidden');
    document.getElementById('semVenda').classList.remove('hidden');
  });

  // Filtros de vendas reais
  document.getElementById('filtroVendasPeriodo').addEventListener('change', renderHistoricoVendas);
  document.getElementById('filtroVendasProduto').addEventListener('change', renderHistoricoVendas);

  // Limpar histórico vendas
  document.getElementById('btnLimparHistVendas').addEventListener('click', async () => {
    const ok = await confirmar('Limpar Histórico', 'Limpar todas as vendas? Os estoques não serão restaurados.');
    if (!ok) return;
    App.vendas = [];
    Storage.saveVendas(App.vendas);
    renderVendasReais();
    showToast('Histórico de vendas limpo.');
  });

  // Limpar histórico movimentações
  document.getElementById('btnLimparHistMov').addEventListener('click', async () => {
    const ok = await confirmar('Limpar Histórico', 'Limpar todo o histórico de movimentações?');
    if (!ok) return;
    App.movEstoque = [];
    Storage.saveMovEstoque(App.movEstoque);
    renderHistoricoMov();
    showToast('Histórico de movimentações limpo.');
  });

  // Exportar
  document.getElementById('btnExportar').addEventListener('click', exportarRelatorio);

  // Limpar tudo
  document.getElementById('btnLimparTudo').addEventListener('click', async () => {
    const ok = await confirmar('Limpar Todos os Dados', 'Apagará insumos, produtos, vendas e movimentações. Irreversível.');
    if (!ok) return;
    Storage.clearAll();
    App.insumos = []; App.produtos = []; App.vendas = []; App.movEstoque = [];
    renderDashboard(); renderInsumos(); renderProdutos();
    atualizarSelectInsumos(); atualizarSelectCalculo(); atualizarSelectVendasReais();
    document.getElementById('painelCalculo').classList.add('hidden');
    atualizarBadgeEstoque();
    showToast('Todos os dados apagados.');
  });
}

document.addEventListener('DOMContentLoaded', init);