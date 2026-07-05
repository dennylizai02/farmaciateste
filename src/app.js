// ============================================================
// SISTEMA FARMACÊUTICO — app.js (Supabase + Chart.js) - BUILD 20260331-2357
// ============================================================

import { createSupabaseClient } from './services/supabase.js';
import { getElement, queryAll, escapeHTML } from './utils/domUtils.js';
import { showNotification } from './utils/notifications.js';
import { showConfirm, closeConfirmModal } from './utils/dialogs.js';
import { renderStock as renderStockModule, getStatus } from './components/stock.js';
import Chart from 'chart.js/auto';

let sb = createSupabaseClient();

const PREFIX = '';

const destroyChart = function (chart) { if (chart && typeof chart.destroy === 'function') chart.destroy(); };
const buildOption = function (value, label) {
    return '<option value="' + escapeHTML(value) + '">' + escapeHTML(label) + '</option>';
};
let chartPrintMensal = null;

function refreshAllViews() {
    renderMovimentos(); renderStock(); renderRelatorios(); renderCaixa(); renderAlertas(); renderNecessidades(); renderDocsHistory();
}

function checkLowStock(p) {
    if (p && p.qtd <= p.min) {
        showNotification('⚠️ Stock Baixo: ' + p.nome + ' (Resta: ' + p.qtd + ')', 'error');
    }
}

let produtos = [];
let movimentos = [];
let despesas = [];
let documentos = [];
let docItems = [];
let planoItems = [];
let saldoMovimentos = [];
let mesaClientes = [];

let tipoActivo = 'entrada';
let periodoActivo = 'diário';
let currentSortField = 'nome';
let currentSortOrder = 'asc';
let chartVendas, chartLucro, chartRelVendas, chartRelLucro, chartTop5, chartDiario, chartROI;
let userRole = 'gestor';
let activeMesa = null;

// ---------- DATE ----------
const dateEl = document.getElementById('current-date');
if (dateEl) dateEl.textContent = new Date().toLocaleDateString('pt-MZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

// ====================== NAVIGATION ======================
function showSection(id) {
    // Fechar sidebar em mobile
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('show');
    }
    queryAll('.section').forEach(function (s) { s.classList.remove('active'); });
    queryAll('.nav-btn').forEach(function (b) { b.classList.remove('active'); });

    const target = getElement('sec-' + id);
    if (target) target.classList.add('active');

    // Highlight the correct nav button
    const btns = queryAll('.nav-btn');
    for (let i = 0; i < btns.length; i++) {
        const oc = btns[i].getAttribute('onclick') || '';
        if (oc.indexOf(id) !== -1) { btns[i].classList.add('active'); break; }
    }

    if (id === 'relatorios') renderRelatorios();
    if (id === 'stock') { renderStock(); renderAlertas(); }
    if (id === 'movimentos') renderMovimentos();
    if (id === 'alertas') renderAlertas();
    if (id === 'caixa') renderCaixa();
    if (id === 'despesas') renderDespesas();
    if (id === 'necessidades') renderNecessidades();
    if (id === 'documentos') populateDocProdutoSelect();
    if (id === 'planocompras') renderPlanoCompras();
    if (id === 'relmensal') renderRelMensal();
    if (id === 'saldo') renderSaldo();
    if (id === 'mesas') renderMesas();
}

function printDailyMovements() {
    var d = new Date();
    var hoje = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    var movs = movimentos.filter(function (m) { 
        return m.data === hoje && (m.tipo === 'saida' || m.tipo === 'quebra'); 
    });
    
    if (movs.length === 0) { 
        showNotification('Nenhum movimento de venda ou quebra para imprimir hoje.', 'info'); 
        return; 
    }
    
    var win = window.open('', '_blank');
    if (win) win.opener = null;
    var html = '<html><head><title>Sistema Farmacêutico - Movimentos do Dia</title><style>' +
               'body { font-family: sans-serif; padding: 20px; font-size: 14px; }' +
               'table { width: 100%; border-collapse: collapse; margin-top: 15px; }' +
               'th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }' +
               'th { background: #f8f9fa; }' +
               'h1 { font-size: 20px; text-align: center; margin-bottom: 5px; }' +
               'p { text-align: center; color: #666; font-size: 13px; }' +
               '</style></head><body>' +
               '<h1>Sistema Farmacêutico</h1>' +
               '<p>Relatório de Movimentos Diários - ' + hoje.split('-').reverse().join('/') + '</p>' +
               '<table><thead><tr><th>Hora</th><th>Produto</th><th>Tipo</th><th>Qtd</th><th>Total (MZN)</th></tr></thead><tbody>';
               
    movs.forEach(function (m) {
        var p = produtos.find(function (x) { return x.id === m.prodId; });
        html += '<tr>' +
                '<td>' + escapeHTML(m.created_at ? new Date(m.created_at).toLocaleTimeString() : '-') + '</td>' +
                '<td>' + escapeHTML(p ? p.nome : m.produto_nome || '-') + '</td>' +
                '<td>' + escapeHTML(m.tipo === 'saida' ? 'Venda' : 'Quebra') + '</td>' +
                '<td>' + m.qtd + '</td>' +
                '<td>' + m.total.toLocaleString() + '</td>' +
                '</tr>';
    });
    
    var totalVendas = movs.filter(m => m.tipo === 'saida').reduce((a, b) => a + b.total, 0);
    
    html += '</tbody></table>' +
            '<div style="margin-top:20px; text-align:right; border-top: 2px solid #333; padding-top: 10px;">' +
            '<strong>Total de Vendas do Dia: ' + totalVendas.toLocaleString() + ' MZN</strong>' +
            '</div>' +
            '<div style="margin-top:40px; font-size:10px; text-align:center;">Processado por Sistema Farmacêutico</div>' +
            '</body></html>';
    
    win.document.write(html);
    win.document.close();
    win.print();
}

function toggleSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (sidebar) {
        sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('show');
    }
}

function setPeriodo(p, btn) {
    periodoActivo = p;
    document.querySelectorAll('.period-btn').forEach(function (b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    
    var sel = document.getElementById('periodo-count');
    if (sel) {
        if (p === 'diário') sel.innerHTML = '<option value="7">Últimos 7 dias</option><option value="14">Últimos 14 dias</option><option value="30">Últimos 30 dias</option>';
        else if (p === 'semanal') sel.innerHTML = '<option value="4">Últimas 4 sem.</option><option value="8">Últimas 8 sem.</option><option value="10">Últimas 10 sem.</option>';
        else if (p === 'mensal') sel.innerHTML = '<option value="6">Últimos 6 meses</option><option value="12">Últimos 12 meses</option>';
        else sel.innerHTML = '<option value="0">Padrão</option>';
        
        sel.style.display = (p === 'diário' || p === 'semanal' || p === 'mensal') ? 'inline-block' : 'none';
    }
    
    renderRelatorios();
}

// ====================== DATA ======================
async function fetchAllRows(table, selectExpr, orderColumn, ascending) {
    const pageSize = 1000;
    let rows = [];
    let page = 0;
    const maxPages = 100;

    while (page < maxPages) {
        const from = page * pageSize;
        const res = await sb
            .from(PREFIX + table)
            .select(selectExpr)
            .order(orderColumn, { ascending: ascending })
            .range(from, from + pageSize - 1);

        if (res.error) return { data: rows, error: res.error };
        if (res.data && res.data.length > 0) rows = rows.concat(res.data);
        if (!res.data || res.data.length < pageSize) return { data: rows, error: null };
        page++;
    }

    console.warn('fetchAllRows: reached maxPages limit for ' + table);
    return { data: rows, error: null };
}

async function fetchData() {
    if (!sb) { console.warn('Supabase not available'); return; }

    var pRes, mRes, dRes, docRes;
    try {
        var results = await Promise.all([
            sb.from(PREFIX + 'produtos').select('*').order('nome'),
            fetchAllRows('movimentos', '*, produtos(nome)', 'data', false),
            fetchAllRows('despesas', '*', 'data', false),
            fetchAllRows('documentos', '*', 'data', false),
            fetchAllRows('saldo_caixa', '*', 'data', false),
            sb.from(PREFIX + 'mesas_clientes').select('*, mesas_pedidos(*)').order('created_at', { ascending: false })
        ]);
        pRes = results[0]; mRes = results[1]; dRes = results[2]; docRes = results[3];
        var sRes = results[4]; var msRes = results[5];
        if (sRes.data) saldoMovimentos = sRes.data;
        if (msRes.data) mesaClientes = msRes.data;
    } catch (e) {
        console.error('fetchData error:', e);
        return;
    }

    if (pRes.error) console.error('Produtos erro:', pRes.error);
    if (mRes.error) console.error('Movimentos erro:', mRes.error);
    if (dRes.error) console.error('Despesas erro:', dRes.error);
    if (docRes.error) console.error('Documentos erro:', docRes.error);


    if (produtos.length === 0) {
        produtos = [
            { id: 1, nome: 'Paracetamol 500mg', cat: 'Analgésicos', qtd: 50, min: 10, custo: 20, venda: 50, forn: 'MedPharma Lda' },
            { id: 2, nome: 'Ibuprofeno 400mg', cat: 'Analgésicos', qtd: 30, min: 10, custo: 30, venda: 70, forn: 'MedPharma Lda' },
            { id: 3, nome: 'Amoxicilina 500mg', cat: 'Antibióticos', qtd: 25, min: 10, custo: 45, venda: 90, forn: 'Farmalab' },
            { id: 4, nome: 'Vitamina C 1000mg', cat: 'Vitaminas e Suplementos', qtd: 20, min: 5, custo: 100, venda: 180, forn: 'Saúde&Co' },
            { id: 5, nome: 'Soro Oral 500ml', cat: 'Primeiros Socorros', qtd: 40, min: 10, custo: 15, venda: 35, forn: 'Farmalab' },
            { id: 6, nome: 'Álcool 70% 500ml', cat: 'Higiene e Cuidados', qtd: 35, min: 15, custo: 25, venda: 55, forn: 'Higilab' },
            { id: 7, nome: 'Gaze Esterilizada', cat: 'Material Médico', qtd: 60, min: 20, custo: 8, venda: 20, forn: 'MedPharma Lda' },
            { id: 8, nome: 'Máscara Cirúrgica', cat: 'Material Médico', qtd: 100, min: 30, custo: 3, venda: 8, forn: 'Higilab' }
        ];
    }

    if (pRes.data && pRes.data.length > 0) {
        produtos = pRes.data.map(function (p) {
            return { id: p.id, nome: p.nome, cat: p.categoria, qtd: p.quantidade, min: p.stock_minimo, custo: p.preco_custo, venda: p.preco_venda, forn: p.fornecedor };
        });
    }
    if (mRes.data) {
        movimentos = mRes.data.map(function (m) {
            var cApp = null;
            if (m.nota && m.nota.indexOf('[C:') !== -1) {
                var match = m.nota.match(/\[C:([\d.]+)\]/);
                if (match) cApp = parseFloat(match[1]);
                m.nota = m.nota.replace(/\[C:[\d.]+\]\s*/, '');
            }
            
            var dObj = new Date(m.data);
            var localDate, localHora;
            
            if (!isNaN(dObj.getTime())) {
                localDate = dObj.getFullYear() + '-' + String(dObj.getMonth() + 1).padStart(2, '0') + '-' + String(dObj.getDate()).padStart(2, '0');
                localHora = dObj.toLocaleString('pt-MZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            } else {
                // Fallback para datas que não o JS não consegue parsar directamente
                localDate = m.data ? m.data.split('T')[0] : '—';
                localHora = m.data || '—';
            }

            return {
                id: m.id,
                tipo: m.tipo,
                prodId: m.produto_id,
                qtd: m.quantidade,
                preco: m.preco_unitario,
                total: m.total,
                data: localDate,
                dataHora: localHora,
                nota: m.nota,
                metodo: m.metodo_pagamento,
                nome_v: m.produtos ? m.produtos.nome : '—',
                custo_aplicado: cApp
            };
        });
    }
    if (dRes.data) {
        despesas = dRes.data.map(function (d) {
            var dObj = new Date(d.data);
            var localDate;
            if (!isNaN(dObj.getTime())) {
                localDate = dObj.getFullYear() + '-' + String(dObj.getMonth() + 1).padStart(2, '0') + '-' + String(dObj.getDate()).padStart(2, '0');
            } else {
                localDate = d.data ? d.data.split('T')[0] : '—';
            }
            return { id: d.id, categoria: d.categoria, descricao: d.descricao, valor: d.valor, metodo: d.metodo_pagamento, data: localDate };
        });
    }
    if (docRes.data) {
        documentos = docRes.data.map(function (d) {
            var dObj = new Date(d.data);
            var localDate;
            if (!isNaN(dObj.getTime())) {
                localDate = dObj.getFullYear() + '-' + String(dObj.getMonth() + 1).padStart(2, '0') + '-' + String(dObj.getDate()).padStart(2, '0');
            } else {
                localDate = d.data ? d.data.split('T')[0] : '—';
            }
            return { id: d.id, tipo: d.tipo, cliente: d.cliente, data: localDate, total: d.total, detalhes: d.detalhes || [] };
        });
    }
    // Ordenar movimentos explicitamente por ID decrescente para garantir que os mais recentes aparecem primeiro
    movimentos.sort((a, b) => b.id - a.id);
    rebuildFifo();
}

// ====================== HELPERS ======================

// ====================== DASHBOARD ======================

function handleSort(field) {
    if (currentSortField === field) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortOrder = 'asc';
    }
    renderStockModule({
        produtos,
        movimentos,
        userRole,
        currentSortField,
        currentSortOrder,
        showNotification,
        sb,
        PREFIX,
        fetchData,
        renderRelatorios,
        renderMovimentos,
        populateProdutoSelect,
        getStatus,
        escapeHTML
    });
}

function renderStock() {
    renderStockModule({
        produtos,
        movimentos,
        userRole,
        currentSortField,
        currentSortOrder,
        showNotification,
        sb,
        PREFIX,
        fetchData,
        renderRelatorios,
        renderMovimentos,
        populateProdutoSelect,
        getStatus,
        escapeHTML
    });
}

async function devolverQuarentena(id) {
    if (await showConfirm("Devolver este item ao stock e anular a quarentena?")) {
        deleteMovimento(id);
    }
}

async function updateQtd(id, val) {
    var p = produtos.find(function (x) { return x.id === id; });
    if (!p) return;
    var newQtd = parseInt(val) || 0;
    var oldQtd = p.qtd;
    if (newQtd === oldQtd) return;
    if (newQtd < 0) { 
        showNotification('O stock não pode ser negativo!', 'error'); 
        renderStock(); return; 
    }

    var diff = Math.abs(newQtd - oldQtd);
    var tipo = '';
    var nota = '[Ajuste Manual de Stock]';

    if (newQtd > oldQtd) {
        if (!(await showConfirm('Deseja aumentar o stock de "' + p.nome + '" em ' + diff + ' unidades? Será gerada uma Entrada.'))) { renderStock(); return; }
        tipo = 'entrada';
    } else {
        var resp = prompt('Diminuição de ' + diff + ' unidades em "' + p.nome + '". Foi Saída (venda), Quebra ou Ajuste/Quarentena? Digite "S" para Saída, "Q" para Quebra ou "A" para Ajuste:');
        if (!resp) { renderStock(); return; }
        if (resp.toUpperCase() === 'S') { tipo = 'saida'; nota = '[Ajuste Manual]'; }
        else if (resp.toUpperCase() === 'Q') { tipo = 'quebra'; nota = '[Ajuste Manual]'; }
        else if (resp.toUpperCase() === 'A') { tipo = 'quebra'; nota = '[Quarentena]'; }
        else { showNotification('Opção inválida. Operação cancelada.'); renderStock(); return; }
    }

    p.qtd = newQtd;
    checkLowStock(p);
    var novoMov = {
        tipo: tipo,
        produto_id: id,
        quantidade: diff,
        preco_unitario: tipo === 'entrada' ? p.custo : p.venda,
        total: diff * (tipo === 'entrada' ? p.custo : p.venda),
        nota: nota,
        metodo_pagamento: 'CASH'
    };

    if (sb) {
        await Promise.all([
            sb.from(PREFIX + 'produtos').update({ quantidade: p.qtd }).eq('id', id),
            sb.from(PREFIX + 'movimentos').insert([novoMov])
        ]);
        await fetchData();
    }
    renderStock(); renderRelatorios(); renderMovimentos();
}

async function updateField(id, field, val) {
    var p = produtos.find(function (x) { return x.id === id; });
    if (p) {
        var nVal = parseFloat(val) || 0;
        if (field === 'stock_minimo') p.min = nVal;
        else if (field === 'preco_custo') p.custo = nVal;
        else if (field === 'preco_venda') p.venda = nVal;
        if (sb) await sb.from(PREFIX + 'produtos').update({ [field]: nVal }).eq('id', id);
        renderStock();
    }
}

async function addProduto() {
    var nome = document.getElementById('p-nome').value.trim();
    if (!nome) { showNotification('Insere o nome do produto'); return; }
    var cat = document.getElementById('p-cat').value;
    if (cat === 'Outra...') {
        cat = document.getElementById('p-cat-custom').value.trim();
        if (!cat) { showNotification('Escreve o nome da nova categoria de produto!'); return; }
    }
    var novoProd = {
        nome: nome,
        categoria: cat,
        quantidade: parseInt(document.getElementById('p-qtd').value) || 0,
        stock_minimo: parseInt(document.getElementById('p-min').value) || 10,
        preco_custo: parseFloat(document.getElementById('p-custo').value) || 0,
        preco_venda: parseFloat(document.getElementById('p-venda').value) || 0,
        fornecedor: document.getElementById('p-fornecedor').value
    };
    if (!sb) { showNotification('Sem ligação à BD'); return; }
    var res = await sb.from(PREFIX + 'produtos').insert([novoProd]).select();
    if (!res.error && res.data && res.data.length > 0) {
        var p = res.data[0];
        showNotification('Produto "' + p.nome + '" adicionado!', 'success');
        produtos.push({ id: p.id, nome: p.nome, cat: p.categoria, qtd: p.quantidade, min: p.stock_minimo, custo: p.preco_custo, venda: p.preco_venda, forn: p.fornecedor });
        ['p-nome', 'p-qtd', 'p-min', 'p-custo', 'p-venda', 'p-fornecedor'].forEach(function (x) { document.getElementById(x).value = ''; });
        document.getElementById('p-cat').value = 'Analgésicos';
        document.getElementById('p-cat-custom').style.display = 'none';
        document.getElementById('p-cat-custom').value = '';
        renderStock(); populateProdutoSelect();
    } else { showNotification('Erro ao salvar no banco: ' + (res.error ? res.error.message : '')); }
}

async function removeProduto(id) {
    if (!(await showConfirm('Remover este produto?'))) return;
    if (sb) await sb.from(PREFIX + 'produtos').delete().eq('id', id);
    produtos = produtos.filter(function (p) { return p.id !== id; });
    renderStock(); populateProdutoSelect();
}

async function updateFornecedor(id, val) {
    var p = produtos.find(function (x) { return x.id === id; });
    if (p) {
        p.forn = val;
        if (sb) await sb.from(PREFIX + 'produtos').update({ fornecedor: val }).eq('id', id);
    }
}

// ====================== MOVIMENTOS ======================
function populateProdutoSelect() {
    var list = document.getElementById('m-produto-list');
    if (list) {
        list.innerHTML = produtos.map(function (p) { return buildOption(p.nome, p.nome); }).join('');
    }
    // Update the hidden select if it exists or other selects
    var selPlano = document.getElementById('plano-produto');
    if (selPlano) selPlano.innerHTML = produtos.map(function (p) { return buildOption(p.id, p.nome); }).join('');
    
    var selDoc = document.getElementById('doc-produto');
    if (selDoc) selDoc.innerHTML = produtos.map(function (p) { return buildOption(p.id, p.nome); }).join('');
    
    updateMovPrice();
}

function onProductSearch() {
    var val = document.getElementById('m-produto-search').value;
    var p = produtos.find(x => x.nome === val);
    if (p) {
        document.getElementById('m-produto').value = p.id;
        updateMovPrice();
    } else {
        document.getElementById('m-produto').value = '';
    }
}

function setTipo(t) {
    tipoActivo = t;
    ['entrada', 'saida', 'quebra'].forEach(function (x) {
        var btn = document.getElementById('tipo-' + x);
        if (btn) btn.className = 'tipo-btn' + (t === x ? ' active-' + x : '');
    });
    var container = document.getElementById('m-metodo-container');
    if (container) container.style.display = (t === 'quebra') ? 'none' : 'flex';
    
    // Not showing Custo Aplicado anymore per user request
    updateMovPrice();
}

function updateMovPrice() {
    var el = document.getElementById('m-produto');
    if (!el || !el.value) return;
    var p = produtos.find(function (x) { return x.id === parseInt(el.value); });
    if (!p) return;
    document.getElementById('m-preco').value = tipoActivo === 'entrada' ? p.custo : tipoActivo === 'saida' ? p.venda : p.custo;
    updateMovTotal();
}

function updateMovTotal() {
    var q = parseInt(document.getElementById('m-qtd').value) || 0;
    var pr = parseFloat(document.getElementById('m-preco').value) || 0;
    var t = document.getElementById('m-total');
    if (t) t.value = (q * pr).toLocaleString() + ' MZN';
}

async function addMovimento() {
    var prodId = parseInt(document.getElementById('m-produto').value);
    var qtd = parseInt(document.getElementById('m-qtd').value) || 0;
    var preco = parseFloat(document.getElementById('m-preco').value) || 0;
    var nota = document.getElementById('m-nota').value;
    var metodo_el = document.getElementById('m-metodo');
    var metodo = metodo_el && tipoActivo !== 'quebra' ? metodo_el.value : null;
    var dataEl = document.getElementById('m-data');
    var dataSel = dataEl && dataEl.value ? dataEl.value + 'T12:00:00' : null;

    if (!qtd) { showNotification('Insere a quantidade'); return; }
    var p = produtos.find(function (x) { return x.id === prodId; });
    if (!p) { showNotification('Produto não encontrado'); return; }

    if (tipoActivo === 'saida' || tipoActivo === 'quebra') {
        if (p.qtd < qtd) { showNotification('Stock insuficiente! Faça uma compra de entrada primeiro.'); return; }
        if (p.qtd - qtd <= p.min) {
            showNotification('⚠ ATENÇÃO: O stock deste produto ficará BAIXO após esta venda!', 'info');
        }
        p.qtd -= qtd;
        checkLowStock(p);
    } else {
        p.qtd += qtd;
        p.custo = preco;
    }

    var novoMov = { tipo: tipoActivo, produto_id: prodId, quantidade: qtd, preco_unitario: preco, total: qtd * preco, nota: nota, metodo_pagamento: metodo };
    if (dataSel) novoMov.data = dataSel;
    if (!sb) { showNotification('Sem ligação à BD'); return; }

    var res = await Promise.all([
        sb.from(PREFIX + 'movimentos').insert([novoMov]).select(),
        sb.from(PREFIX + 'produtos').update({ quantidade: p.qtd, preco_custo: p.custo }).eq('id', prodId)
    ]);

    var mRes = res[0];

    if (!mRes.error && mRes.data && mRes.data.length > 0) {
        var mm = mRes.data[0];
        showNotification('Movimento registado!', 'success');
        movimentos.unshift({ id: mm.id, tipo: mm.tipo, prodId: mm.produto_id, qtd: mm.quantidade, preco: mm.preco_unitario, total: mm.total, data: mm.data.split('T')[0], nota: mm.nota.replace(/\[C:[\d.]+\]\s*/, ''), metodo: mm.metodo_pagamento, nome_v: p.nome, custo_aplicado: null });
        document.getElementById('m-qtd').value = 1; document.getElementById('m-nota').value = '';
        if (document.getElementById('m-produto-search')) document.getElementById('m-produto-search').value = '';
        if (document.getElementById('m-produto')) document.getElementById('m-produto').value = '';
        rebuildFifo(); // Recalcula o motor de lucros
        renderMovimentos(); renderAlertas(); renderStock(); renderCaixa(); renderNecessidades();
        var ac = document.getElementById('alert-count');
        if (ac) ac.textContent = produtos.filter(function (x) { return x.qtd <= x.min; }).length || '';
    } else {
        showNotification('Erro ao gravar movimento.');
        if (tipoActivo === 'entrada') p.qtd -= qtd; else p.qtd += qtd;
    }
}

// ====================== MOTOR DE CUSTO (MARGEM DIRECTA) ======================
function rebuildFifo() {
    // Margem Directa: custo = preço de custo do produto × quantidade
    // Simples, transparente, e não depende de registos de entrada históricos
    for (var m of movimentos) {
        if (m.tipo === 'saida' || m.tipo === 'quebra') {
            var p = produtos.find(x => x.id === m.prodId);
            var custoUnit = p ? p.custo : 0;
            // Override do utilizador (se existir)
            if (m.custo_aplicado != null && !isNaN(m.custo_aplicado)) {
                m.fifo_cost = m.custo_aplicado * m.qtd;
            } else {
                m.fifo_cost = custoUnit * m.qtd;
            }
        }
    }
}

function renderMovimentos() {
    populateProdutoSelect();
    var tipoLabel = { entrada: 'Entrada', saida: 'Venda', quebra: 'Quebra', ajuste: 'Ajuste/Quar.' };
    
    var dateFilter = document.getElementById('mov-hist-date') ? document.getElementById('mov-hist-date').value : '';
    var movsToShow = movimentos;
    
    if (dateFilter) {
        movsToShow = movimentos.filter(function(m) {
            return m.data && m.data.substring(0, 10) === dateFilter;
        });
    } else {
        movsToShow = movimentos.slice(0, 100); // Aumentado para 100 para melhor visibilidade de movimentos antigos
    }

    document.getElementById('mov-table').innerHTML = movsToShow.length ?
        '<table><thead><tr><th><input type="checkbox" onclick="toggleSelectAllMovs(this)"></th><th>Data/Hora</th><th>Tipo</th><th>Produto</th><th>Qtd</th><th>Preço unit.</th><th>Total</th><th>Pagamento</th><th>Notas</th><th>Acções</th></tr></thead><tbody>' +
        movsToShow.map(function (m) {
            var isQuar = (m.tipo === 'quebra' && m.nota === '[Quarentena]');
            var cor = m.tipo === 'entrada' ? 'badge-ok' : m.tipo === 'saida' ? 'badge' : (isQuar ? 'badge' : 'badge-low');
            var style = m.tipo === 'saida' ? ' style="background:#E6F1FB;color:#185FA5;"' : (isQuar ? ' style="background:#F3F4F6;color:#4B5563;"' : '');
            var label = isQuar ? 'Quarentena' : tipoLabel[m.tipo];
        
        return '<tr><td><input type="checkbox" class="mov-checkbox" data-id="' + m.id + '"></td>' +
            '<td style="color:var(--color-text-secondary);font-size:12px;">' + escapeHTML(m.dataHora || m.data) + '</td>' +
            '<td><span class="badge ' + cor + '"' + style + '>' + escapeHTML(label) + '</span></td>' +
                '<td>' + escapeHTML(m.nome_v || '—') + '</td><td>' + m.qtd + '</td><td>' + m.preco + ' MZN</td>' +
                '<td style="font-weight:500;">' + m.total.toLocaleString() + ' MZN</td>' +
                '<td><span class="badge">' + escapeHTML(m.metodo || '—') + '</span></td>' +
                '<td style="font-size:12px;color:var(--color-text-secondary);">' + escapeHTML(m.nota || '—') + '</td>' +
                '<td><button class="btn btn-danger" onclick="deleteMovimento(' + m.id + ')">Anular</button></td></tr>';
        }).join('') + '</tbody></table>' : '<div class="empty">Nenhum movimento registado</div>';
}

function toggleSelectAllMovs(master) {
    const checks = document.querySelectorAll('.mov-checkbox');
    checks.forEach(c => c.checked = master.checked);
}

async function deleteSelectedMovimentos() {
    const selected = Array.from(document.querySelectorAll('.mov-checkbox:checked')).map(c => parseInt(c.getAttribute('data-id')));
    if (selected.length === 0) {
        showNotification('Nenhum movimento selecionado.', 'info');
        return;
    }
    
    if (!(await showConfirm('Tem certeza que deseja eliminar ' + selected.length + ' movimentos selecionados? O stock será revertido para todos.'))) return;
    
    showNotification('A eliminar ' + selected.length + ' movimentos...', 'info');
    
    for (let id of selected) {
        await deleteMovimentoInternal(id);
    }
    
    await fetchData();
    refreshAllViews();
    showNotification(selected.length + ' movimentos eliminados com sucesso!', 'success');
}

async function deleteMovimento(id) {
    if (!(await showConfirm('Tem certeza que deseja anular este movimento? O stock será revertido.'))) return;
    await deleteMovimentoInternal(id);
    await fetchData();
    refreshAllViews();
    showNotification('Movimento anulado com sucesso!', 'success');
}

async function deleteMovimentoInternal(id) {
    var m = movimentos.find(function (x) { return x.id === id; });
    if (!m) return;
    var p = produtos.find(function (x) { return x.id === m.prodId; });

    try {
        if (p) {
            if (m.tipo === 'entrada') p.qtd -= m.qtd;
            else p.qtd += m.qtd;
            if (p.qtd < 0) p.qtd = 0;
            if (sb) await sb.from(PREFIX + 'produtos').update({ quantidade: p.qtd }).eq('id', p.id);
        }

        // Sincronização Inversa: Se for de uma Factura, marcar factura como eliminada
        if (m.nota && m.nota.indexOf('[Factura #') !== -1) {
            var match = m.nota.match(/#(\d+)/);
            if (match) {
                var docId = parseInt(match[1]);
                var doc = documentos.find(function(d) { return d.id === docId; });
                if (doc) {
                    var newD = doc.detalhes || {};
                    newD.status = 'eliminado';
                    if (sb) await sb.from(PREFIX + 'documentos').update({ detalhes: newD }).eq('id', docId);
                }
            }
        }

        if (sb) {
            await sb.from(PREFIX + 'movimentos').delete().eq('id', id);
        }
        
        movimentos = movimentos.filter(function (x) { return x.id !== id; });
        rebuildFifo();
    } catch (err) {
        console.error('Erro ao anular movimento ' + id + ':', err);
    }
}

// ====================== DESPESAS ======================
function toggleCustomCat() {
    var sel = document.getElementById('d-categoria');
    var cust = document.getElementById('d-categoria-custom');
    if (sel.value === 'Outra...') { cust.style.display = 'block'; cust.focus(); }
    else { cust.style.display = 'none'; cust.value = ''; }
}

// ====================== STOCK - CATEGORIA PERSONALIZADA ======================
function toggleCustomProdCat() {
    var sel = document.getElementById('p-cat');
    var cust = document.getElementById('p-cat-custom');
    if (sel.value === 'Outra...') { cust.style.display = 'block'; cust.focus(); }
    else { cust.style.display = 'none'; cust.value = ''; }
}

async function addDespesa() {
    var cat = document.getElementById('d-categoria').value;
    if (cat === 'Outra...') {
        cat = document.getElementById('d-categoria-custom').value.trim();
        if (!cat) { showNotification('Escreva o nome da nova categoria de despesa!'); return; }
    }
    var desc = document.getElementById('d-desc').value.trim();
    var val = parseFloat(document.getElementById('d-valor').value) || 0;
    var met = document.getElementById('d-metodo').value;
    if (!desc || !val) { showNotification('Preencha a descrição curta e o valor'); return; }
    var dDataEl = document.getElementById('d-data');
    var dDataSel = dDataEl && dDataEl.value ? dDataEl.value + 'T12:00:00' : null;

    if (!sb) { showNotification('Sem ligação à BD'); return; }
    var novaDespesa = { categoria: cat, descricao: desc, valor: val, metodo_pagamento: met };
    if (dDataSel) novaDespesa.data = dDataSel;
    var dRes = await sb.from(PREFIX + 'despesas').insert([novaDespesa]).select();
    if (!dRes.error && dRes.data) {
        var dd = dRes.data[0];
        showNotification('Despesa gravada!', 'success');
        despesas.unshift({ id: dd.id, categoria: dd.categoria, descricao: dd.descricao, valor: dd.valor, metodo: dd.metodo_pagamento, data: dd.data.split('T')[0] });
        document.getElementById('d-desc').value = '';
        document.getElementById('d-valor').value = '';
        if (dDataEl) dDataEl.value = '';
        renderDespesas(); renderCaixa();
    } else {
        if (dRes.error && dRes.error.message && dRes.error.message.indexOf('despesas_categoria_check') !== -1) {
            showNotification("O banco de dados tem um bloqueio que impede categorias novas. Por favor, execute o ficheiro SQL fornecido (fix_despesas.sql) no Supabase para remover essa trava.");
        } else { showNotification('Erro ao gravar despesa: ' + (dRes.error ? dRes.error.message : '')); }
    }
}

function renderDespesas() {
    document.getElementById('despesas-list').innerHTML = despesas.length ?
        '<div class="table-responsive"><table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>M. Pagamento</th><th>Acções</th></tr></thead><tbody>' +
        despesas.map(function (d) {
            return '<tr><td style="font-size:12px;color:var(--color-text-secondary);">' + escapeHTML(d.data) + '</td>' +
                '<td><span class="badge badge-low">' + escapeHTML(d.categoria) + '</span></td>' +
                '<td>' + escapeHTML(d.descricao) + '</td>' +
                '<td style="font-weight:500;color:#A32D2D;">' + d.valor.toLocaleString() + ' MZN</td>' +
                '<td><span class="badge">' + escapeHTML(d.metodo) + '</span></td>' +
                '<td><div style="display:flex;gap:4px;flex-wrap:wrap;"><button class="btn" style="font-size:11px;padding:3px 8px;" onclick="editDespesa(' + d.id + ')">Editar</button>' +
                '<button class="btn btn-danger" onclick="deleteDespesa(' + d.id + ')">Apagar</button></div></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">Nenhuma despesa registada</div>';
}

async function deleteDespesa(id) {
    if (!(await showConfirm('Tem certeza que deseja apagar esta despesa?'))) return;
    if (sb) {
        var res = await sb.from(PREFIX + 'despesas').delete().eq('id', id);
        if (res.error) { showNotification('Erro ao apagar: ' + res.error.message); return; }
    }
    despesas = despesas.filter(function (x) { return x.id !== id; });
    showNotification('Despesa apagada!', 'success');
    renderDespesas(); renderCaixa();
}

function editDespesa(id) {
    var d = despesas.find(function (x) { return x.id === id; });
    if (!d) return;
    document.getElementById('d-categoria').value = d.categoria;
    toggleCustomCat();
    // Check if the category is custom
    var catOpts = document.getElementById('d-categoria').options;
    var found = false;
    for (var i = 0; i < catOpts.length; i++) {
        if (catOpts[i].value === d.categoria) { found = true; break; }
    }
    if (!found) {
        document.getElementById('d-categoria').value = 'Outra...';
        document.getElementById('d-categoria-custom').value = d.categoria;
        document.getElementById('d-categoria-custom').style.display = 'block';
    }
    document.getElementById('d-desc').value = d.descricao;
    document.getElementById('d-valor').value = d.valor;
    document.getElementById('d-metodo').value = d.metodo;
    document.getElementById('d-data').value = d.data;
    // Delete old record and let user save as new
    deleteDespesaSilent(id);
}

async function deleteDespesaSilent(id) {
    if (sb) {
        const res = await sb.from(PREFIX + 'despesas').delete().eq('id', id);
        if (res.error) { showNotification('Erro ao apagar: ' + res.error.message); return; }
    }
    despesas = despesas.filter(function (x) { return x.id !== id; });
    renderDespesas();
}

// ====================== CAIXA ======================
function renderCaixa() {
    var entradas = { 'CASH': 0, 'MPESA': 0, 'EMOLA': 0, 'POS': 0, 'TRANSFERENCIA': 0 };
    var saidas = { 'CASH': 0, 'MPESA': 0, 'EMOLA': 0, 'POS': 0, 'TRANSFERENCIA': 0 };
    var despesa_vals = { 'CASH': 0, 'MPESA': 0, 'EMOLA': 0, 'Conta Bancária': 0 };

    movimentos.forEach(function (m) {
        if (m.tipo === 'saida' && m.metodo && entradas[m.metodo] !== undefined) entradas[m.metodo] += m.total;
        if (m.tipo === 'entrada' && m.metodo && saidas[m.metodo] !== undefined) saidas[m.metodo] += m.total;
    });
    despesas.forEach(function (d) {
        if (despesa_vals[d.metodo] !== undefined) despesa_vals[d.metodo] += d.valor;
    });

    var metodosGlobais = ['CASH', 'MPESA', 'EMOLA', 'POS', 'TRANSFERENCIA'];
    var linhas = '';
    var grantTotalEnt = 0, grantTotalSai = 0, grantTotalDesp = 0;

    metodosGlobais.forEach(function (m) {
        var e = entradas[m] || 0;
        var c = saidas[m] || 0;
        var d_val = 0;
        if (m === 'TRANSFERENCIA') d_val = despesa_vals['Conta Bancária'] || 0;
        else if (m === 'CASH' || m === 'MPESA' || m === 'EMOLA') d_val = despesa_vals[m] || 0;
        var saldo = e - c - d_val;
        grantTotalEnt += e; grantTotalSai += c; grantTotalDesp += d_val;
        linhas += '<tr><td><b>' + m + '</b></td>' +
            '<td style="color:#3B6D11;">' + e.toLocaleString() + '</td>' +
            '<td style="color:#A32D2D;">' + c.toLocaleString() + '</td>' +
            '<td style="color:#A32D2D;">' + d_val.toLocaleString() + '</td>' +
            '<td style="font-weight:500;">' + saldo.toLocaleString() + ' MZN</td></tr>';
    });

    var saldoFinal = grantTotalEnt - grantTotalSai - grantTotalDesp;
    var cont = document.getElementById('caixa-resumo');
    if (cont) {
        cont.innerHTML =
            '<div style="font-size:24px;font-weight:500;margin-bottom:1rem;color:' + (saldoFinal >= 0 ? '#3B6D11' : '#A32D2D') + ';">Caixa Global: ' + saldoFinal.toLocaleString() + ' MZN</div>' +
            '<div class="table-responsive"><table><thead><tr><th>Método de Pagamento</th><th>Receitas (Vendas)</th><th>Compras (Stock)</th><th>Despesas/Taxas</th><th>Saldo (Caixa)</th></tr></thead>' +
            '<tbody>' + linhas + '</tbody></table></div>';
    }
}

// ====================== NECESSIDADES ======================
function renderNecessidades() {
    var rep = produtos.filter(function (p) { return p.qtd < p.min; });
    var cont = document.getElementById('nec-list');
    if (!cont) return;

    if (rep.length === 0) {
        cont.innerHTML = '<div class="empty">Stock robusto. Não há necessidade de reforço por enquanto!</div>';
        return;
    }

    var totalCompras = 0, lucroExp = 0;
    var linhas = rep.map(function (p) {
        var comprar = p.min - p.qtd;
        var custoPrev = comprar * p.custo;
        var lucroPrev = comprar * (p.venda - p.custo);
        totalCompras += custoPrev; lucroExp += lucroPrev;
        return '<tr><td>' + escapeHTML(p.nome) + '</td>' +
            '<td style="color:#A32D2D;font-weight:500;">' + p.qtd + '</td>' +
            '<td>' + p.min + '</td><td style="font-weight:bold;">' + comprar + '</td>' +
            '<td>' + p.custo + ' MZN</td><td>' + custoPrev.toLocaleString() + ' MZN</td>' +
            '<td style="color:#3B6D11;">' + lucroPrev.toLocaleString() + ' MZN</td></tr>';
    });

    cont.innerHTML =
        '<div style="margin-bottom:1rem;font-size:14px;background:#F9F9F9;padding:10px;border-radius:8px;">' +
        'Necessidades estimadas em <b>' + totalCompras.toLocaleString() + ' MZN</b> para recuperar stock mínimo. ' +
        'Lucro esperado (venda total): <b style="color:#3B6D11;">' + lucroExp.toLocaleString() + ' MZN</b></div>' +
        '<div class="table-responsive"><table><thead><tr><th>Produto</th><th>Stock Atual</th><th>Mínimo</th><th>A Comprar</th><th>Custo Unit.</th><th>Investimento</th><th>Lucro Esperado</th></tr></thead>' +
        '<tbody>' + linhas.join('') + '</tbody></table></div>';
}

// ====================== ALERTAS ======================
function renderAlertas() {
    var baixo = produtos.filter(function (p) { return p.qtd <= p.min && p.qtd > 0; });
    var esgotados = produtos.filter(function (p) { return p.qtd === 0; });
    var todos = esgotados.concat(baixo);

    var metricsEl = document.getElementById('alertas-metrics');
    if (metricsEl) {
        metricsEl.innerHTML = `
            <div class="metric-card"><div class="metric-label">Esgotados</div><div class="metric-value" style="color:#A32D2D;">${esgotados.length}</div></div>
            <div class="metric-card"><div class="metric-label">Stock Baixo</div><div class="metric-value" style="color:#854F0B;">${baixo.length}</div></div>
            <div class="metric-card"><div class="metric-label">Total Alertas</div><div class="metric-value">${todos.length}</div></div>
        `;
    }

    var quebras = movimentos.filter(function (m) { return m.tipo === 'quebra'; });
    var quebrasEl = document.getElementById('quebras-list');
    if (quebrasEl) {
        // Ordena quebras das mais recentes para as mais antigas e pega as últimas 5? 
        // O utilizador pediu: "Coloca as 5 ultimas quebras e um scroll para que se possa visualizar todas as outras"
        // Como implementamos o scroll por CSS no HTML (max-height), aqui apenas renderizamos todas as quebras. 
        quebrasEl.innerHTML = quebras.length ?
            '<table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Custo estimado</th><th>Notas</th></tr></thead><tbody>' +
            quebras.map(function (m) {
                return '<tr><td style="font-size:12px;color:var(--color-text-secondary);">' + escapeHTML(m.data) + '</td><td>' + escapeHTML(m.nome_v || '—') + '</td><td>' + m.qtd + '</td><td style="color:#A32D2D;">' + m.total.toLocaleString() + ' MZN</td><td style="font-size:12px;color:var(--color-text-secondary);">' + escapeHTML(m.nota || '—') + '</td></tr>';
            }).join('') + '</tbody></table>' : '<div class="empty">Nenhuma quebra registada</div>';
    }
}

// ====================== RELATÓRIOS ======================
function renderRelatorios() {
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    let labels, vendasData, lucroData, unidData, quebrasData;

    const countVal = document.getElementById('periodo-count') ? parseInt(document.getElementById('periodo-count').value) : 0;

    if (periodoActivo === 'diário') {
        labels = []; vendasData = []; lucroData = []; unidData = []; quebrasData = [];
        const loops = countVal > 0 ? countVal : 7;
        for (let i = loops - 1; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            labels.push(d.getDate() + '/' + (d.getMonth() + 1));
            const mSales = movimentos.filter(m => m.tipo === 'saida' && m.data === key);
            const rec = mSales.reduce((a, m) => a + m.total, 0);
            const custoVendas = mSales.reduce((a, m) => a + (m.fifo_cost || 0), 0);
            const unid = mSales.reduce((a, m) => a + m.qtd, 0);
            const mQuebras = movimentos.filter(m => m.tipo === 'quebra' && m.nota !== '[Quarentena]' && m.data === key);
            const loss = mQuebras.reduce((a, m) => a + (m.fifo_cost || 0), 0);
            const luc = rec - custoVendas;
            vendasData.push(rec); lucroData.push(luc); unidData.push(unid); quebrasData.push(loss);
        }
    } else if (periodoActivo === 'semanal') {
        labels = []; vendasData = []; lucroData = []; unidData = []; quebrasData = [];
        const now = new Date();
        const loops = countVal > 0 ? countVal : 4;
        for (let i = loops - 1; i >= 0; i--) {
            const start = new Date(); start.setDate(now.getDate() - (i + 1) * 7);
            const end = new Date(); end.setDate(now.getDate() - i * 7);
            const fStart = start.getDate() + '/' + (start.getMonth() + 1);
            const fEnd = end.getDate() + '/' + (end.getMonth() + 1);
            labels.push(fStart + ' a ' + fEnd);
            
            const mSales = movimentos.filter(m => {
                const d = new Date(m.data);
                return m.tipo === 'saida' && d >= start && d < end;
            });
            const mLoss = movimentos.filter(m => {
                const d = new Date(m.data);
                return m.tipo === 'quebra' && m.nota !== '[Quarentena]' && d >= start && d < end;
            });
            const rec = mSales.reduce((a, m) => a + m.total, 0);
            const custoVendas = mSales.reduce((a, m) => a + (m.fifo_cost || 0), 0);
            const unid = mSales.reduce((a, m) => a + m.qtd, 0);
            const loss = mLoss.reduce((a, m) => a + (m.fifo_cost || 0), 0);
            const luc = rec - custoVendas;
            vendasData.push(rec); lucroData.push(luc); unidData.push(unid); quebrasData.push(loss);
        }
    } else if (periodoActivo === 'mensal') {
        const agora = new Date();
        labels = []; vendasData = []; lucroData = []; unidData = []; quebrasData = [];
        const loops = countVal > 0 ? countVal : 6;
        for (let i = loops - 1; i >= 0; i--) {
            const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
            const mKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            labels.push(meses[d.getMonth()]);
            const mSales = movimentos.filter(m => m.tipo === 'saida' && (m.data || '').startsWith(mKey));
            const mLoss = movimentos.filter(m => m.tipo === 'quebra' && m.nota !== '[Quarentena]' && (m.data || '').startsWith(mKey));
            const rec = mSales.reduce((a, m) => a + m.total, 0);
            const custoVendas = mSales.reduce((a, m) => a + (m.fifo_cost || 0), 0);
            const unid = mSales.reduce((a, m) => a + m.qtd, 0);
            const loss = mLoss.reduce((a, m) => a + (m.fifo_cost || 0), 0);
            const despMes = despesas.filter(d => d.data.startsWith(mKey)).reduce((a, d) => a + d.valor, 0);
            const luc = rec - custoVendas - loss - despMes;
            vendasData.push(rec); lucroData.push(luc); unidData.push(unid); quebrasData.push(loss);
        }
    } else if (periodoActivo === 'trimestral') {
        labels = ['T1', 'T2', 'T3', 'T4'];
        vendasData = [0, 0, 0, 0]; lucroData = [0, 0, 0, 0]; unidData = [0, 0, 0, 0]; quebrasData = [0, 0, 0, 0];
        const anoActual = new Date().getFullYear();
        movimentos.filter(m => m.data.startsWith(String(anoActual))).forEach(m => {
            const trim = Math.floor(new Date(m.data).getMonth() / 3);
            if (m.tipo === 'saida') {
                vendasData[trim] += m.total;
                lucroData[trim] += (m.total - (m.fifo_cost || 0));
                unidData[trim] += m.qtd;
            } else if (m.tipo === 'quebra') {
                quebrasData[trim] += (m.fifo_cost || 0);
                lucroData[trim] -= (m.fifo_cost || 0);
            }
        });
        despesas.filter(d => d.data.startsWith(String(anoActual))).forEach(d => {
            const trim = Math.floor(new Date(d.data).getMonth() / 3);
            lucroData[trim] -= d.valor;
        });
    } else {
        labels = [new Date().getFullYear() - 2, new Date().getFullYear() - 1, new Date().getFullYear()];
        vendasData = [0, 0, 0]; lucroData = [0, 0, 0]; unidData = [0, 0, 0]; quebrasData = [0, 0, 0];
        movimentos.forEach(m => {
            const ano = new Date(m.data).getFullYear();
            const idx = labels.indexOf(ano);
            if (idx !== -1) {
                if (m.tipo === 'saida') {
                    vendasData[idx] += m.total;
                    lucroData[idx] += (m.total - (m.fifo_cost || 0));
                    unidData[idx] += m.qtd;
                } else if (m.tipo === 'quebra') {
                    quebrasData[idx] += (m.fifo_cost || 0);
                    lucroData[idx] -= (m.fifo_cost || 0);
                }
            }
        });
        despesas.forEach(d => {
            const ano = new Date(d.data).getFullYear();
            const idx = labels.indexOf(ano);
            if (idx !== -1) {
                lucroData[idx] -= d.valor;
            }
        });
    }

    const activeIndex = periodoActivo === 'trimestral' ? Math.floor(new Date().getMonth() / 3) : vendasData.length - 1;
    
    const totalV = vendasData[activeIndex] || 0;
    const totalL = lucroData[activeIndex] || 0;
    const totalMov = unidData[activeIndex] || 0;
    const totalQ = quebrasData[activeIndex] || 0;

    document.getElementById('rel-metrics').innerHTML =
        '<div class="metric-card"><div class="metric-label">Receita (período)</div><div class="metric-value">' + Math.round(totalV).toLocaleString() + '</div><div class="metric-sub">MZN</div></div>' +
        '<div class="metric-card"><div class="metric-label">Lucro estimado</div><div class="metric-value" style="color:#3B6D11;">' + Math.round(totalL).toLocaleString() + '</div><div class="metric-sub">MZN</div></div>' +
        '<div class="metric-card"><div class="metric-label">Unidades vendidas</div><div class="metric-value">' + totalMov + '</div><div class="metric-sub">unidades</div></div>' +
        '<div class="metric-card"><div class="metric-label">Perdas (quebras)</div><div class="metric-value" style="color:#A32D2D;">' + totalQ.toLocaleString() + '</div><div class="metric-sub">MZN</div></div>';

    if (typeof Chart !== 'undefined') {
        if (chartRelVendas) chartRelVendas.destroy();
        chartRelVendas = new Chart(document.getElementById('chartRelVendas'), { type: 'line', data: { labels: labels, datasets: [{ label: 'Receita', data: vendasData, borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,0.1)', tension: 0.4, fill: true, pointRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
        if (chartRelLucro) chartRelLucro.destroy();
        chartRelLucro = new Chart(document.getElementById('chartRelLucro'), { type: 'line', data: { labels: labels, datasets: [{ label: 'Lucro', data: lucroData, borderColor: '#639922', backgroundColor: 'rgba(99,153,34,0.1)', tension: 0.4, fill: true, pointRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
        
        // --- GRÁFICOS MOVIDOS DO DASHBOARD (Sincronizados) ---
        if (chartVendas) chartVendas.destroy();
        chartVendas = new Chart(document.getElementById('chartVendas'), { 
            type: 'bar', 
            data: { labels: labels, datasets: [{ label: 'Unidades vendidas', data: unidData, backgroundColor: '#B5D4F4', borderColor: '#378ADD', borderWidth: 1 }] }, 
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } 
        });

        // Helper para filtrar movimentos pelo periodo activo
        var getFilteredMovs = function(m) {
            var match = false;
            if (periodoActivo === 'diário') {
                match = m.data === new Date().toISOString().split('T')[0];
            } else if (periodoActivo === 'semanal') {
                var start = new Date(); start.setDate(new Date().getDate() - 7);
                match = new Date(m.data) >= start;
            } else if (periodoActivo === 'mensal') {
                match = m.data.startsWith(new Date().toISOString().substring(0, 7));
            } else if (periodoActivo === 'trimestral') {
                var trim = Math.floor(new Date().getMonth() / 3);
                var mTrim = Math.floor(new Date(m.data).getMonth() / 3);
                match = m.data.startsWith(new Date().getFullYear()) && mTrim === trim;
            } else {
                match = m.data.startsWith(new Date().getFullYear());
            }
            return match;
        };

        // --- GRÁFICO GLOBAL DE RENTABILIDADE (Receita vs Custo) ---
        var globalProdsData = produtos.map(p => {
            var pSales = movimentos.filter(m => m.tipo === 'saida' && m.prodId === p.id); // Global: sem filtro de período
            var rev = pSales.reduce((a, m) => a + m.total, 0);
            var cost = pSales.reduce((a, m) => a + (m.fifo_cost || 0), 0);
            return { 
                nome: p.nome.split(' ').slice(0, 2).join(' '), 
                receita: rev, 
                custo: cost 
            };
        }).sort((a, b) => b.receita - a.receita);

        // --- NOVO GRÁFICO: EFICIÊNCIA DE LUCRO (ROI) ---
        var roiProdsData = globalProdsData.map(p => {
            var lucro = p.receita - p.custo;
            var roi = p.custo > 0 ? (lucro / p.custo) : 0;
            return { nome: p.nome, roi: roi };
        }).sort((a, b) => b.roi - a.roi);

        var roiContainer = document.getElementById('chart-roi-container');
        if (roiContainer) {
            var minWidthRoi = roiProdsData.length * 45;
            var parentWRoi = roiContainer.parentElement.clientWidth || 800;
            roiContainer.style.width = Math.max(parentWRoi, minWidthRoi) + 'px';
        }

        if (chartROI) chartROI.destroy();
        chartROI = new Chart(document.getElementById('chartROI'), {
            type: 'bar',
            data: {
                labels: roiProdsData.map(p => p.nome),
                datasets: [{
                    label: 'ROI (Lucro por Metical Investido)',
                    data: roiProdsData.map(p => p.roi),
                    backgroundColor: 'rgba(99, 102, 241, 0.6)', 
                    borderColor: 'rgb(99, 102, 241)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'ROI: ' + context.parsed.y.toFixed(2) + ' (Retorno de ' + (context.parsed.y * 100).toFixed(0) + '%)';
                            }
                        }
                    }
                },
                scales: {
                    y: { title: { display: true, text: 'Índice ROI' } }
                }
            }
        });


        var lucroContainer = document.getElementById('chart-lucro-container');
        if (lucroContainer) {
            var minWidth = globalProdsData.length * 45;
            var parentW = lucroContainer.parentElement.clientWidth || 800;
            lucroContainer.style.width = Math.max(parentW, minWidth) + 'px';
        }

        if (chartLucro) chartLucro.destroy();
        chartLucro = new Chart(document.getElementById('chartLucro'), { 
            type: 'bar', 
            data: { 
                labels: globalProdsData.map(p => p.nome), 
                datasets: [
                    { label: 'Receita', data: globalProdsData.map(p => p.receita), backgroundColor: '#C0DD97', borderColor: '#639922', borderWidth: 1 }, 
                    { label: 'Custo', data: globalProdsData.map(p => p.custo), backgroundColor: '#F5C4B3', borderColor: '#D85A30', borderWidth: 1 }
                ] 
            }, 
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { 
                    legend: { display: true, labels: { font: { size: 11 }, boxWidth: 10 } }
                } 
            } 
        });
        // --- FIM DOS GRÁFICOS MOVIDOS ---

        var top5 = produtos.map(function (p) {
            return { 
                nome: p.nome.split(' ').slice(0, 2).join(' '), 
                vendas: movimentos.filter(function (m) { 
                    return m.tipo === 'saida' && m.prodId === p.id && getFilteredMovs(m);
                }).reduce(function (a, m) { return a + m.qtd; }, 0) 
            };
        }).sort(function (a, b) { return b.vendas - a.vendas; }).slice(0, 5);
        if (chartTop5) chartTop5.destroy();
        chartTop5 = new Chart(document.getElementById('chartTop5'), { type: 'bar', data: { labels: top5.map(function (p) { return p.nome; }), datasets: [{ data: top5.map(function (p) { return p.vendas; }), backgroundColor: ['#B5D4F4', '#C0DD97', '#F5C4B3', '#CECBF6', '#9FE1CB'], borderRadius: 4 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });

        // SINCRONIZAÇÃO CHART DIARIO com periodo activo
        var diasLabels = labels;
        var diasVendas = vendasData;
        var diasLucros = lucroData;

        if (chartDiario) chartDiario.destroy();
        chartDiario = new Chart(document.getElementById('chartDiario'), {
            type: 'bar',
            data: {
                labels: diasLabels,
                datasets: [
                    { label: 'Vendas (MZN)', data: diasVendas, backgroundColor: '#B5D4F4', borderColor: '#378ADD', borderWidth: 1, borderRadius: 4 },
                    { label: 'Lucro (MZN)', data: diasLucros, backgroundColor: '#C0DD97', borderColor: '#639922', borderWidth: 1, borderRadius: 4 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, labels: { font: { size: 11 }, boxWidth: 10 } } } }
        });
        
        // Renderizar Produtos com menos stock (movido do dashboard)
        var lowProds = produtos.filter(function (p) { return p.qtd <= p.min * 2; }).sort(function (a, b) { return a.qtd - b.qtd; }).slice(0, 10);
        var tableEl = document.getElementById('dash-low-table');
        if (tableEl) {
            tableEl.innerHTML = lowProds.length ?
                '<table><thead><tr><th>Produto</th><th>Categoria</th><th>Stock actual</th><th>Mínimo</th><th>Estado</th></tr></thead><tbody>' +
                lowProds.map(function (p) { return '<tr><td>' + escapeHTML(p.nome) + '</td><td>' + escapeHTML(p.cat || '') + '</td><td>' + p.qtd + '</td><td>' + p.min + '</td><td>' + getStatus(p) + '</td></tr>'; }).join('') +
                '</tbody></table>' : '<div class="empty">Todos os produtos com stock adequado</div>';
        }
    }
}



// ====================== RELATÓRIO MENSAL ======================
function renderRelMensal() {
    var mesEl = document.getElementById('rm-mes');
    if (!mesEl.value) {
        var now = new Date();
        mesEl.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }
    var mesSel = mesEl.value; // "2026-03"

    var movMes = movimentos.filter(function (m) { return m.data.substring(0, 7) === mesSel; });
    var despMes = despesas.filter(function (d) { return d.data.substring(0, 7) === mesSel; });

    var vendas = movMes.filter(function (m) { return m.tipo === 'saida'; });
    var compras = movMes.filter(function (m) { return m.tipo === 'entrada'; });
    var quebras = movMes.filter(function (m) { return m.tipo === 'quebra' && m.nota !== '[Quarentena]'; });

    var totalVendas = vendas.reduce(function (a, m) { return a + m.total; }, 0);
    var totalCompras = compras.reduce(function (a, m) { return a + m.total; }, 0);
    var totalQuebras = quebras.reduce(function (a, m) { return a + m.total; }, 0);
    var totalDespesas = despMes.reduce(function (a, d) { return a + d.valor; }, 0);

    var custoVendas = vendas.reduce(function (a, m) { return a + (m.fifo_cost || 0); }, 0);
    var lucroBruto = totalVendas - custoVendas;
    var custoQuebras = quebras.reduce(function (a, m) { return a + (m.fifo_cost || 0); }, 0);
    var lucroLiquido = lucroBruto - totalDespesas - custoQuebras;

    // Métricas
    document.getElementById('rm-metrics').innerHTML =
        '<div class="metric-card"><div class="metric-label">Receita (Vendas)</div><div class="metric-value">' + totalVendas.toLocaleString() + '</div><div class="metric-sub">MZN | ' + vendas.length + ' transacções</div></div>' +
        '<div class="metric-card"><div class="metric-label">Custo de Stock Comprado</div><div class="metric-value" style="color:#854F0B;">' + totalCompras.toLocaleString() + '</div><div class="metric-sub">MZN | ' + compras.length + ' entradas</div></div>' +
        '<div class="metric-card"><div class="metric-label">Lucro Bruto</div><div class="metric-value" style="color:#3B6D11;">' + lucroBruto.toLocaleString() + '</div><div class="metric-sub">MZN | Margem ' + (totalVendas > 0 ? Math.round(lucroBruto / totalVendas * 100) : 0) + '%</div></div>' +
        '<div class="metric-card"><div class="metric-label">Total Quebras</div><div class="metric-value" style="color:#854F0B;">' + totalQuebras.toLocaleString() + '</div><div class="metric-sub">MZN | ' + quebras.length + ' quebras</div></div>' +
        '<div class="metric-card"><div class="metric-label">Total Despesas</div><div class="metric-value" style="color:#A32D2D;">' + totalDespesas.toLocaleString() + '</div><div class="metric-sub">MZN | ' + despMes.length + ' lançamentos</div></div>' +
        '<div class="metric-card"><div class="metric-label">Lucro Líquido</div><div class="metric-value" style="color:' + (lucroLiquido >= 0 ? '#3B6D11' : '#A32D2D') + ';">' + lucroLiquido.toLocaleString() + '</div><div class="metric-sub">MZN (Bruto − Despesas − Quebras)</div></div>';

    // Tabela Vendas
    document.getElementById('rm-vendas').innerHTML = vendas.length ?
        '<table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Preço</th><th>Total</th><th>Pagamento</th></tr></thead><tbody>' +
        vendas.map(function (m) {
            return '<tr><td style="font-size:12px;">' + escapeHTML(m.data) + '</td><td>' + escapeHTML(m.nome_v || '—') + '</td><td>' + m.qtd + '</td><td>' + m.preco + '</td><td style="font-weight:500;">' + m.total.toLocaleString() + ' MZN</td><td><span class="badge">' + escapeHTML(m.metodo || '—') + '</span></td></tr>';
        }).join('') +
        '<tr style="font-weight:bold;background:var(--color-background-secondary);"><td colspan="4">TOTAL VENDAS</td><td>' + totalVendas.toLocaleString() + ' MZN</td><td></td></tr>' +
        '</tbody></table>' : '<div class="empty">Nenhuma venda neste mês</div>';

    // Tabela Compras
    document.getElementById('rm-compras').innerHTML = compras.length ?
        '<table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Preço</th><th>Total</th><th>Pagamento</th></tr></thead><tbody>' +
        compras.map(function (m) {
            return '<tr><td style="font-size:12px;">' + escapeHTML(m.data) + '</td><td>' + escapeHTML(m.nome_v || '—') + '</td><td>' + m.qtd + '</td><td>' + m.preco + '</td><td style="font-weight:500;">' + m.total.toLocaleString() + ' MZN</td><td><span class="badge">' + escapeHTML(m.metodo || '—') + '</span></td></tr>';
        }).join('') +
        '<tr style="font-weight:bold;background:var(--color-background-secondary);"><td colspan="4">TOTAL COMPRAS</td><td>' + totalCompras.toLocaleString() + ' MZN</td><td></td></tr>' +
        '</tbody></table>' : '<div class="empty">Nenhuma compra neste mês</div>';

    // Tabela Quebras
    var realQuebrasCost = quebras.reduce(function (a, m) { return a + (m.fifo_cost || 0); }, 0);
    document.getElementById('rm-quebras').innerHTML = quebras.length ?
        '<table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Custo (FIFO)</th><th>Notas</th></tr></thead><tbody>' +
        quebras.map(function (m) {
            return '<tr><td style="font-size:12px;">' + escapeHTML(m.data) + '</td><td>' + escapeHTML(m.nome_v || '—') + '</td><td>' + m.qtd + '</td><td style="color:#A32D2D;">' + (m.fifo_cost || 0).toLocaleString() + ' MZN</td><td style="font-size:12px;">' + escapeHTML(m.nota || '—') + '</td></tr>';
        }).join('') +
        '<tr style="font-weight:bold;background:var(--color-background-secondary);"><td colspan="3">CUSTO TOTAL QUEBRAS</td><td>' + realQuebrasCost.toLocaleString() + ' MZN</td><td></td></tr>' +
        '</tbody></table>' : '<div class="empty">Nenhuma quebra neste mês</div>';

    // Tabela Despesas
    document.getElementById('rm-despesas').innerHTML = despMes.length ?
        '<table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Pagamento</th></tr></thead><tbody>' +
        despMes.map(function (d) {
            return '<tr><td style="font-size:12px;">' + escapeHTML(d.data) + '</td><td><span class="badge badge-low">' + escapeHTML(d.categoria) + '</span></td><td>' + escapeHTML(d.descricao) + '</td><td style="font-weight:500;color:#A32D2D;">' + d.valor.toLocaleString() + ' MZN</td><td><span class="badge">' + escapeHTML(d.metodo) + '</span></td></tr>';
        }).join('') +
        '<tr style="font-weight:bold;background:var(--color-background-secondary);"><td colspan="3">TOTAL DESPESAS</td><td>' + totalDespesas.toLocaleString() + ' MZN</td><td></td></tr>' +
        '</tbody></table>' : '<div class="empty">Nenhuma despesa neste mês</div>';
}

async function printMensal() {
    prepareMensalPrintArea();
    // Aguardar o gráfico ser renderizado no background
    await new Promise(r => setTimeout(r, 800));
    
    var canvas = document.getElementById('printChartMensal');
    if (canvas) {
        var imgData = canvas.toDataURL('image/png');
        var parent = canvas.parentElement;
        // Definir altura fixa para a imagem para manter consistência com o canvas original
        parent.innerHTML = `<img src="${imgData}" style="width:100%; max-height:250px; object-fit: contain;">`;
    }
    
    var content = document.getElementById('print-area').innerHTML;
    var printContent = `<!DOCTYPE html><html><head><title>Relatório Mensal</title>
        <style>
            body { font-family: sans-serif; color: #000; padding: 20px; }
            @media print { body { padding: 0; } }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ccc; padding: 6px; font-size: 12px; }
            th { background: #f0f0f0; }
        </style></head><body>${content}</body></html>`;

    var win = window.open('', '_blank');
    if (win) win.opener = null;
    win.document.write(printContent);
    win.document.close();
    win.onload = function() { win.print(); };
}

async function printFaturacao() {
    var today = new Date().toLocaleDateString('pt-MZ', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // Capturar gráficos do Dashboard se existirem
    var charts = document.querySelectorAll('#sec-relatorios canvas');
    var chartImgs = Array.from(charts).map(c => c.toDataURL('image/png'));

    var cards = Array.from(document.querySelectorAll('#sec-relatorios .card')).filter(card => !card.querySelector('.btn'));
    
    var printContent = `<!DOCTYPE html><html><head><title>Relatório de Faturação</title>
        <style>
            body { font-family: Arial, sans-serif; color: #000; padding: 20px; font-size: 14px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h2 { margin: 0; font-size: 24px; }
            .header .subtitle { font-size: 16px; font-weight: bold; margin-top: 5px; }
            .header .date { font-size: 13px; color: #555; margin-top: 3px; }
            .card { border: 1px solid #ccc; padding: 15px; border-radius: 8px; margin-bottom: 20px; page-break-inside: avoid; }
            .card-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 15px; }
            th { background: #f0f0f0; border: 1px solid #ccc; padding: 6px; text-align: left; }
            td { border: 1px solid #ccc; padding: 6px; }
            .footer { text-align: center; font-size: 11px; color: #999; margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 10px; }
            @media print { body { padding: 0; } }
            .metrics { display: flex; flex-wrap: wrap; gap: 10px; }
            .metric-card { border: 1px solid #eee; padding: 10px; border-radius: 4px; flex: 1; }
        </style></head><body>
        <div class="header">
            <h2>Sistema Farmacêutico</h2>
            <div class="subtitle">RELATÓRIO DE FATURAÇÃO E DASHBOARD</div>
            <div class="date">${today} | Período: ${periodoActivo}</div>
        </div>
        <div class="card">
            <div class="card-title">Métricas Gerais</div>
            <div class="metrics">${document.getElementById('rel-metrics').innerHTML}</div>
        </div>
        ${cards.map((card, i) => {
            var html = card.innerHTML;
            // Se o card tiver um canvas, substituir pelo índice correspondente da imagem capturada
            if (html.indexOf('<canvas') !== -1 && chartImgs.length > 0) {
                html = html.replace(/<canvas[^>]*><\/canvas>/, `<img src="${chartImgs[0]}" style="width:100%; height:auto;">`);
                chartImgs.shift();
            }
            return `<div class="card">${html}</div>`;
        }).join('')}
        <div class="footer">Processado por Computador (Sistema Farmacêutico)</div>
        </body></html>`;

    var win = window.open('', '_blank');
    if (win) win.opener = null;
    win.document.write(printContent);
    win.document.close();
    win.onload = function() { win.print(); };
}

function printHistoricoMovimentos() {
    var today = new Date().toLocaleDateString('pt-MZ', { year: 'numeric', month: 'long', day: 'numeric' });
    var movTable = document.getElementById('mov-table');
    
    var printContent = `<!DOCTYPE html><html><head>
        <title>Histórico de Movimentos</title>
        <style>
            body { font-family: Arial, sans-serif; color: #000; padding: 20px; font-size: 14px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h2 { margin: 0; font-size: 24px; }
            .header .subtitle { font-size: 16px; font-weight: bold; margin-top: 5px; }
            .header .date { font-size: 13px; color: #555; margin-top: 3px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background: #f0f0f0; border: 1px solid #ccc; padding: 8px; text-align: left; }
            td { border: 1px solid #ccc; padding: 6px 8px; }
            .footer { text-align: center; font-size: 11px; color: #999; margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 10px; }
            @media print { body { padding: 0; } }
        </style></head><body>
        <div class="header">
            <h2>Sistema Farmacêutico</h2>
            <div class="subtitle">HISTÓRICO DE MOVIMENTOS</div>
            <div class="date">${today}</div>
        </div>
        <div>${movTable.innerHTML}</div>
        <div class="footer">Processado por Computador (Sistema de Gestão)</div>
        </body></html>`;

    var win = window.open('', '_blank');
    if (win) win.opener = null;
    win.document.write(printContent);
    win.document.close();
    win.onload = function() { win.print(); };
}

function prepareMensalPrintArea() {
    var mesSel = document.getElementById('rm-mes').value;
    if (!mesSel) { showNotification('Seleccione um mês primeiro.'); return; }

    var movMes = movimentos.filter(m => m.data.substring(0, 7) === mesSel);
    var despMes = despesas.filter(d => d.data.substring(0, 7) === mesSel);
    var vendas = movMes.filter(m => m.tipo === 'saida');
    var receita = vendas.reduce((a, m) => a + m.total, 0);
    var custo = vendas.reduce((a, m) => a + (m.fifo_cost || 0), 0);
    var lucroBruto = receita - custo;
    var totalDespesas = despMes.reduce((a, d) => a + d.valor, 0);
    var quebras = movMes.filter(m => m.tipo === 'quebra');
    var totalQuebras = quebras.reduce((a, m) => a + (m.fifo_cost || 0), 0);
    var lucroLiquido = lucroBruto - totalDespesas - totalQuebras;

    // Prev month computation
    var dObj = new Date(mesSel + '-01T00:00:00');
    dObj.setMonth(dObj.getMonth() - 1);
    var mesAnt = dObj.getFullYear() + '-' + String(dObj.getMonth() + 1).padStart(2, '0');
    var vAnt = movimentos.filter(m => m.data.substring(0, 7) === mesAnt && m.tipo === 'saida');
    var recAnt = vAnt.reduce((a, m) => a + m.total, 0);
    var custAnt = vAnt.reduce((a, m) => a + (m.fifo_cost || 0), 0);
    var despAnt = despesas.filter(d => d.data.substring(0, 7) === mesAnt).reduce((a, d) => a + d.valor, 0);
    var quebrasAnt = movimentos.filter(m => m.data.substring(0, 7) === mesAnt && m.tipo === 'quebra').reduce((a, m) => a + (m.fifo_cost || 0), 0);
    var lucroAnt = (recAnt - custAnt) - despAnt - quebrasAnt;

    var percL = 0;
    if (lucroAnt !== 0) {
        percL = Math.round(((lucroLiquido - lucroAnt) / Math.abs(lucroAnt)) * 100);
    } else {
        percL = lucroLiquido > 0 ? 100 : (lucroLiquido < 0 ? -100 : 0);
    }

    // Insights logic
    var diasMap = {};
    vendas.forEach(m => {
        if (!diasMap[m.data]) diasMap[m.data] = { r: 0, c: 0 };
        diasMap[m.data].r += m.total;
        diasMap[m.data].c += (m.fifo_cost || 0);
    });
    var melhorDia = ''; var maxL = -999999;
    var chartLabels = []; var chartData = [];
    Object.keys(diasMap).sort().forEach(d => {
        var l = diasMap[d].r - diasMap[d].c;
        if (l > maxL) { maxL = l; melhorDia = d; }
        chartLabels.push(d.split('-').reverse().slice(0, 2).join('/'));
        chartData.push(l);
    });

    var prodsMap = {};
    vendas.forEach(m => { prodsMap[m.nome_v] = (prodsMap[m.nome_v] || 0) + m.qtd; });
    var topProdArr = Object.keys(prodsMap).sort((a, b) => prodsMap[b] - prodsMap[a]);
    var topProd = topProdArr.length > 0 ? topProdArr[0] : 'N/A';

    var printArea = document.getElementById('print-area');
    printArea.innerHTML = `
        <div id="pdf-content" style="font-family:sans-serif; color:#000; padding:20px; max-width:1100px; margin:0 auto; background:#fff;">
            <div style="text-align:center; margin-bottom:20px;">
                <h2 style="margin:0; font-size:24px;">Sistema Farmacêutico</h2>
                <div style="font-size:16px; font-weight:bold; margin-top:5px;">RELATÓRIO MENSAL DE PERFORMANCE</div>
                <div style="font-size:13px; color:#555; margin-top:3px;">Mês: ${mesSel.split('-').reverse().join('/')}</div>
            </div>
            
            <div style="display:flex; justify-content:space-between; margin-bottom:20px; border-bottom:2px solid #000; padding-bottom:10px; font-size:14px; flex-wrap:wrap; gap:10px;">
                <div><b>Receita Total:</b> ${receita.toLocaleString()} MZN</div>
                <div><b>Despesas Totais:</b> ${totalDespesas.toLocaleString()} MZN</div>
                <div><b>Lucro Líquido:</b> <span style="color:${lucroLiquido >= 0 ? '#3B6D11' : '#A32D2D'}">${lucroLiquido.toLocaleString()} MZN</span></div>
                <div><b>Crescimento:</b> <span style="color:${percL >= 0 ? '#3B6D11' : '#A32D2D'}">${percL}%</span></div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px;">
                <div style="border:1px solid #ccc; padding:10px; border-radius:8px; display: flex; flex-direction: column;">
                    <div style="font-weight:bold; margin-bottom:10px; text-align:center; border-bottom:1px solid #eee; padding-bottom:5px;">Evolução de Lucro Diário</div>
                    <div style="flex-grow: 1; min-height:250px; width: 100%;"><canvas id="printChartMensal" width="500" height="250" style="width:100% !important; height:250px !important;"></canvas></div>
                </div>
                <div style="border:1px solid #ccc; padding:10px; border-radius:8px;">
                    <div style="font-weight:bold; margin-bottom:10px; text-align:center; border-bottom:1px solid #eee; padding-bottom:5px;">Métricas e Insights</div>
                    <div style="font-size:13px; line-height:1.6;">
                        • <b>Melhor dia de vendas:</b> ${melhorDia ? melhorDia.split('-').reverse().join('/') : '—'}<br>
                        • <b>Produto mais vendido:</b> ${topProd}<br>
                        • <b>Ticket Médio:</b> ${(vendas.length > 0 ? receita / vendas.length : 0).toLocaleString()} MZN<br>
                        • <b>Total de Quebras:</b> ${totalQuebras.toLocaleString()} MZN<br>
                        • <b>Total de Despesas:</b> ${totalDespesas.toLocaleString()} MZN
                    </div>
                </div>
            </div>

            <div style="margin-top:20px;">
                <div style="font-weight:bold; margin-bottom:10px;">Detalhamento de Vendas do Mês</div>
                <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:20px;">
                    <thead style="background:#f0f0f0;">
                        <tr>
                            <th style="border:1px solid #ccc; padding:6px; text-align:left;">Data</th>
                            <th style="border:1px solid #ccc; padding:6px; text-align:left;">Produto</th>
                            <th style="border:1px solid #ccc; padding:6px; text-align:right;">Qtd</th>
                            <th style="border:1px solid #ccc; padding:6px; text-align:right;">Preço</th>
                            <th style="border:1px solid #ccc; padding:6px; text-align:right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${vendas.map(m => `
                            <tr>
                                <td style="border:1px solid #ccc; padding:5px;">${m.data.split('-').reverse().slice(0, 2).join('/')}</td>
                                <td style="border:1px solid #ccc; padding:5px;">${m.nome_v}</td>
                                <td style="border:1px solid #ccc; padding:5px; text-align:right;">${m.qtd}</td>
                                <td style="border:1px solid #ccc; padding:5px; text-align:right;">${m.preco.toLocaleString()}</td>
                                <td style="border:1px solid #ccc; padding:5px; text-align:right; font-weight:bold;">${m.total.toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div style="margin-top:40px; font-size:12px; color:#777; display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                <div>_________________________<br>Assinatura do Gestor</div>
                <div>_________________________<br>Assinatura do Proprietário</div>
            </div>
            <div style="text-align:center; font-size:11px; margin-top:30px; color:#999; border-top:1px dashed #ccc; padding-top:10px;">
                Processado por Computador (Sistema Farmacêutico)
            </div>
        </div>
    `;

    var ctx = document.getElementById('printChartMensal');
    destroyChart(chartPrintMensal);
    chartPrintMensal = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Lucro Diário (MZN)',
                data: chartData,
                backgroundColor: '#378ADD',
                borderRadius: 4
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: true,
            animation: false,
            plugins: { legend: { display: false } }
        }
    });
}

// ====================== DOCUMENTOS ======================
function populateDocProdutoSelect() {
    var sel = document.getElementById('doc-produto');
    if (sel) sel.innerHTML = produtos.map(function (p) { return '<option value="' + escapeHTML(p.id) + '">' + escapeHTML(p.nome) + ' (' + p.venda + ' MZN)</option>'; }).join('');
    renderDocsHistory();
}

function addDocItem() {
    var sel = document.getElementById('doc-produto');
    var qStr = document.getElementById('doc-qtd').value;
    var tipoDoc = document.getElementById('doc-tipo').value;
    if (!sel || !qStr) return;
    var pId = parseInt(sel.value);
    var q = parseInt(qStr);
    var prod = produtos.find(function (x) { return x.id === pId; });
    if (!prod || q <= 0) return;

    if (tipoDoc === 'factura') {
        if (prod.qtd <= 0) { showNotification('Stock ESGOTADO!', 'error'); return; }
        if (q > prod.qtd) { showNotification('Stock insuficiente! Apenas ' + prod.qtd + ' em stock.', 'error'); return; }
        if (prod.qtd - q <= prod.min) showNotification('⚠ Stock BAIXO para este produto após venda.', 'info');
    }

    docItems.push({ id: prod.id, nome: prod.nome, qtd: q, preco: prod.venda, total: q * prod.venda });
    document.getElementById('doc-qtd').value = 1;
    renderDocList();
}

function removeDocItem(index) { docItems.splice(index, 1); renderDocList(); }

function calcDesconto(subtotal) {
    var tipo = document.getElementById('doc-desconto-tipo');
    var val = parseFloat(document.getElementById('doc-desconto').value) || 0;
    if (!tipo) return val;
    if (tipo.value === 'percentagem') return Math.round(subtotal * val / 100);
    return val;
}

function renderDocList() {
    var tbody = document.getElementById('doc-items');
    if (!tbody) return;
    tbody.innerHTML = docItems.map(function (item, i) {
        return '<tr><td>' + escapeHTML(item.nome) + '</td><td>' + item.qtd + '</td><td>' + item.preco + '</td><td>' + item.total.toLocaleString() + '</td>' +
            '<td><button class="btn btn-danger" onclick="removeDocItem(' + i + ')">X</button></td></tr>';
    }).join('');
    var subtotal = docItems.reduce(function (acc, it) { return acc + it.total; }, 0);
    var desconto = calcDesconto(subtotal);
    var t = subtotal - desconto;
    document.getElementById('doc-subtotal').textContent = subtotal.toLocaleString();
    document.getElementById('doc-desconto-calc').textContent = desconto.toLocaleString();
    document.getElementById('doc-total').textContent = Math.max(t, 0).toLocaleString();
}

async function syncInvoiceToStock(doc) {
    if (doc.tipo !== 'factura' || !sb) return;
    var details = doc.detalhes;
    var newMovs = [];
    showNotification('A sincronizar stock e vendas...', 'info');
    
    try {
        for (var item of details.items) {
            var p = produtos.find(function(x) { return x.id === item.id || x.nome === item.nome; });
            if (p) {
                p.qtd -= item.qtd;
                newMovs.push({
                    tipo: 'saida',
                    produto_id: p.id,
                    quantidade: item.qtd,
                    preco_unitario: item.preco,
                    total: item.total,
                    nota: '[Factura #' + doc.id + ']',
                    metodo_pagamento: 'CASH'
                });
                if (sb) await sb.from(PREFIX + 'produtos').update({ quantidade: p.qtd }).eq('id', p.id);
            }
        }
        if (newMovs.length > 0 && sb) {
            await sb.from(PREFIX + 'movimentos').insert(newMovs);
        }
        await fetchData();
    } catch (err) {
        console.error('Erro de sincronização:', err);
    }
}

async function saveAndDownloadPDF() {
    if (docItems.length === 0) { showNotification('Adicione produtos primeiro.'); return; }
    var tipo = document.getElementById('doc-tipo').value;
    var cliente = document.getElementById('doc-cliente').value.trim() || 'Consumidor Final';
    var subtotal = docItems.reduce(function (a, i) { return a + i.total; }, 0);
    var desconto = calcDesconto(subtotal);
    var total = Math.max(subtotal - desconto, 0);
    var payload = { tipo: tipo, cliente: cliente, total: total, detalhes: { items: docItems, desconto: desconto } };
    if (!sb) { showNotification('Sem ligação à BD'); return; }
    var dRes = await sb.from(PREFIX + 'documentos').insert([payload]).select();
    if (!dRes.error && dRes.data) {
        var doc = dRes.data[0];
        documentos.unshift({ id: doc.id, tipo: doc.tipo, cliente: doc.cliente, data: doc.data.split('T')[0], total: doc.total, detalhes: doc.detalhes });

        // Sincronizar Stock e Vendas se for Factura
        if (doc.tipo === 'factura') {
            await syncInvoiceToStock(doc);
        }

        // Preparar para PDF
        var printArea = document.getElementById('print-area');
        prepareDocPrintArea(doc);
        var filename = (doc.tipo === 'factura' ? 'Factura_' : 'Cotacao_') + doc.id + '.pdf';
        generatePDF(printArea, filename);

        docItems = [];
        document.getElementById('doc-cliente').value = '';
        document.getElementById('doc-desconto').value = '0';
        renderDocList(); renderDocsHistory();
    } else { showNotification('Erro ao gravar documento: ' + (dRes.error ? dRes.error.message : '')); }
}

function prepareDocPrintArea(doc) {
    var printArea = document.getElementById('print-area');
    var details = doc.detalhes;
    var docName = doc.tipo === 'factura' ? 'FACTURA' : 'COTAÇÃO';
    var rows = details.items.map(function (item, i) {
        return '<tr>' +
            '<td style="border:1px solid #ccc; padding:6px; text-align:center;">' + (i + 1) + '</td>' +
            '<td style="border:1px solid #ccc; padding:6px;">' + item.nome + '</td>' +
            '<td style="border:1px solid #ccc; padding:6px; text-align:center;">' + item.qtd + '</td>' +
            '<td style="border:1px solid #ccc; padding:6px; text-align:right;">' + item.preco.toLocaleString() + '</td>' +
            '<td style="border:1px solid #ccc; padding:6px; text-align:right; font-weight:bold;">' + item.total.toLocaleString() + '</td></tr>';
    });
    printArea.innerHTML =
        '<div style="font-family:sans-serif; color:#000; padding:20px; max-width:800px; margin:0 auto; background:#fff;">' +
        '<div style="text-align:center; margin-bottom:20px;">' +
        '<h2 style="margin:0; font-size:24px;">Sistema Farmacêutico</h2>' +
        '<div style="font-size:16px; font-weight:bold; margin-top:5px;">' + docName + ' N.º ' + doc.id + '</div>' +
        '<div style="font-size:13px; color:#555; margin-top:3px;">Data: ' + doc.data + '</div></div>' +
        '<div style="margin-bottom:20px; font-size:14px;"><b>Cliente:</b> ' + escapeHTML(doc.cliente) + '</div>' +
        '<table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:20px;">' +
        '<thead style="background:#f0f0f0;">' +
        '<tr><th style="border:1px solid #ccc; padding:8px; text-align:center;">#</th><th style="border:1px solid #ccc; padding:8px; text-align:left;">Descrição</th>' +
        '<th style="border:1px solid #ccc; padding:8px; text-align:center;">Qtd</th><th style="border:1px solid #ccc; padding:8px; text-align:right;">Preço Unit.</th>' +
        '<th style="border:1px solid #ccc; padding:8px; text-align:right;">Total (MZN)</th></tr></thead>' +
        '<tbody>' + rows.join('') + '</tbody></table>' +
        '<div style="text-align:right; font-size:14px;">' +
        '<div>Subtotal: ' + (doc.total + (details.desconto || 0)).toLocaleString() + ' MZN</div>' +
        (details.desconto > 0 ? '<div>Desconto: -' + details.desconto.toLocaleString() + ' MZN</div>' : '') +
        '<div style="font-size:18px; font-weight:bold; margin-top:10px; border-top:2px solid #000; padding-top:10px;">TOTAL: ' + doc.total.toLocaleString() + ' MZN</div></div>' +
        '<div style="margin-top:40px; font-size:12px; color:#777; display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;">' +
        '<div>_________________________<br>Entregue por</div>' +
        '<div>_________________________<br>Recebido por</div></div>' +
        '<div style="text-align:center; font-size:11px; margin-top:30px; color:#999; border-top:1px dashed #ccc; padding-top:10px;">Agradecemos a sua preferência. Volte sempre.<br> Processado por Computador (Sistema Farmacêutico)</div></div>';
}

function generatePDF(element, filename, orientation) {
    orientation = orientation || 'portrait';
    var origStyle = element.style.cssText;
    var targetWidth = orientation === 'landscape' ? '1100px' : '750px';
    
    element.style.cssText = 'position:static; left:auto; top:auto; width:' + targetWidth + '; height:auto; overflow:visible; visibility:visible; background:#fff;';

    var opt = {
        margin: [10, 10, 10, 10],
        filename: filename,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { scale: 3, useCORS: true, logging: false, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: orientation }
    };

    // Delay to ensure DOM rendering completes for large tables/charts
    setTimeout(function() {
        html2pdf().set(opt).from(element).save().then(function () {
            element.style.cssText = origStyle;
        }).catch(function (err) {
            console.error('PDF error:', err);
            element.style.cssText = origStyle;
        });
    }, 300);
}

function printDoc(doc) {
    var details = doc.detalhes;
    var docName = doc.tipo === 'factura' ? 'FACTURA' : 'COTAÇÃO';
    var rows = details.items.map(function (item, i) {
        return '<tr>' +
            '<td style="border:1px solid #ccc; padding:6px; text-align:center;">' + (i + 1) + '</td>' +
            '<td style="border:1px solid #ccc; padding:6px;">' + item.nome + '</td>' +
            '<td style="border:1px solid #ccc; padding:6px; text-align:center;">' + item.qtd + '</td>' +
            '<td style="border:1px solid #ccc; padding:6px; text-align:right;">' + item.preco.toLocaleString() + '</td>' +
            '<td style="border:1px solid #ccc; padding:6px; text-align:right; font-weight:bold;">' + item.total.toLocaleString() + '</td></tr>';
    });
    
    var printContent = `<!DOCTYPE html><html><head><title>${docName}</title>
        <style>
            body { font-family: sans-serif; color: #000; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h2 { margin: 0; font-size: 24px; }
            .header .subtitle { font-size: 16px; font-weight: bold; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ccc; padding: 6px; font-size: 13px; }
            th { background: #f0f0f0; }
            .total-box { text-align: right; font-size: 14px; }
            .signatures { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; }
            .footer { text-align: center; font-size: 11px; color: #999; margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 10px; }
        </style></head><body>
        <div class="header">
            <h2>Sistema Farmacêutico</h2>
            <div class="subtitle">${docName} N.º ${doc.id}</div>
            <div class="date">Data: ${doc.data}</div>
        </div>
        <div style="margin-bottom:20px;"><b>Cliente:</b> ${doc.cliente}</div>
        <table><thead><tr><th>#</th><th>Descrição</th><th>Qtd</th><th>Preço Unit.</th><th>Total (MZN)</th></tr></thead>
        <tbody>${rows.join('')}</tbody></table>
        <div class="total-box">
            <div>Subtotal: ${(doc.total + (details.desconto || 0)).toLocaleString()} MZN</div>
            ${details.desconto > 0 ? `<div>Desconto: -${details.desconto.toLocaleString()} MZN</div>` : ''}
            <div style="font-size:18px; font-weight:bold; margin-top:10px; border-top:2px solid #000; padding-top:10px;">TOTAL: ${doc.total.toLocaleString()} MZN</div>
        </div>
        <div class="signatures">
            <div>_________________________<br>Entregue por</div>
            <div>_________________________<br>Recebido por</div>
        </div>
        <div class="footer">Agradecemos a sua preferência. Volte sempre.<br> Processado por Computador (Sistema Farmacêutico)</div>
        </body></html>`;

    var win = window.open('', '_blank');
    if (win) win.opener = null;
    win.document.write(printContent);
    win.document.close();
    win.onload = function() { win.print(); };
}

function renderDocsHistory() {
    var cont = document.getElementById('doc-history');
    if (!cont) return;
    cont.innerHTML = documentos.length ?
        '<div class="table-responsive"><table><thead><tr><th>N.º</th><th>Data</th><th>Tipo</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Acções</th></tr></thead><tbody>' +
        documentos.map(function (d) {
            var isEliminado = d.detalhes && d.detalhes.status === 'eliminado';
            var rowClass = isEliminado ? 'class="cancelled-doc"' : '';
            return '<tr ' + rowClass + '><td>#' + d.id + '</td><td style="font-size:12px;color:var(--color-text-secondary);">' + escapeHTML(d.data) + '</td>' +
                '<td><span class="badge ' + (d.tipo === 'factura' ? 'badge-ok' : 'badge-low') + '">' + escapeHTML(d.tipo.toUpperCase()) + '</span></td>' +
                '<td>' + escapeHTML(d.cliente) + '</td>' +
                '<td style="font-weight:bold;">' + d.total.toLocaleString() + ' MZN</td>' +
                '<td>' + (isEliminado ? '<span class="cancelled-label">Eliminado</span>' : 'Ativo') + '</td>' +
                '<td><div style="display:flex;gap:5px;flex-wrap:wrap;">' +
                '<button class="btn" style="font-size:11px;padding:3px 8px;background:#378ADD;color:#fff;border:none;" onclick="downloadPDFFromHistory(' + d.id + ')">PDF</button>' +
                (!isEliminado ? '<button class="btn btn-danger" style="font-size:11px;padding:3px 8px;" onclick="deleteDocumento(' + d.id + ')">Eliminar</button>' : '') +
                '</div></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">Nenhum documento emitido.</div>';
}

async function deleteDocumento(id) {
    if (!(await showConfirm('Deseja eliminar esta factura? O stock será restaurado.'))) return;
    var doc = documentos.find(x => x.id === id);
    if (!doc) return;

    try {
        if (doc.tipo === 'factura' && doc.detalhes && doc.detalhes.items) {
            for (var item of doc.detalhes.items) {
                var p = produtos.find(x => x.id === item.id || x.nome === item.nome);
                if (p) {
                    p.qtd += item.qtd;
                    await sb.from(PREFIX + 'produtos').update({ quantidade: p.qtd }).eq('id', p.id);
                }
            }
            await sb.from(PREFIX + 'movimentos').delete().eq('nota', '[Factura #' + doc.id + ']');
            // Sync local state
            movimentos = movimentos.filter(m => m.nota !== '[Factura #' + doc.id + ']');
        }
        var newD = doc.detalhes || {}; newD.status = 'eliminado';
        if (sb) await sb.from(PREFIX + 'documentos').update({ detalhes: newD }).eq('id', id);
        showNotification('Documento anulado e stock restaurado!', 'success');
        await fetchData();
        refreshAllViews();
    } catch (err) {
        showNotification('Erro ao eliminar.');
    }
}

function downloadPDFFromHistory(id) {
    var doc = documentos.find(function (d) { return d.id === id; });
    if (doc) {
        var printArea = document.getElementById('print-area');
        prepareDocPrintArea(doc);
        var filename = (doc.tipo === 'factura' ? 'Factura_' : 'Cotacao_') + doc.id + '.pdf';
        generatePDF(printArea, filename);
    }
}

// ====================== INIT ======================
function setDefaultDates() {
    var today = new Date().toISOString().split('T')[0];
    var md = document.getElementById('m-data');
    var dd = document.getElementById('d-data');
    if (md) md.value = today;
    if (dd) dd.value = today;
    var rmEl = document.getElementById('rm-mes');
    if (rmEl && !rmEl.value) {
        var now = new Date();
        rmEl.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }
}

// ====================== AUTH & ROLES ======================
async function checkSession() {
    console.log('[checkSession] INICIO');
    const role = localStorage.getItem('local_session_role');
    const user = localStorage.getItem('local_session_user');
    console.log('[checkSession] role=' + role + ' user=' + user);
    if (role && user) {
        userRole = role;
        console.log('[checkSession] userRole=' + userRole);
        document.getElementById('login-screen').style.display = 'none';
        console.log('[checkSession] login-screen oculto');
        document.querySelector('.app').style.display = 'flex';
        console.log('[checkSession] app visivel');
        document.getElementById('user-label').textContent = userRole === 'gestor' ? 'Administrador' : 'Vendas';
        console.log('[checkSession] user-label definido');
        
        applyRoleRestrictions();
        console.log('[checkSession] applyRoleRestrictions chamado');
        initApp();
        console.log('[checkSession] initApp chamado');
    }
    console.log('[checkSession] FIM');
}

async function loginUser() {
    const email = document.getElementById('l-email').value.trim();
    const pass = document.getElementById('l-pass').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = 'A entrar...';

    console.log('Login attempt:', email);

    if (email === 'admin' && pass === 'admin') {
        userRole = 'gestor';
        localStorage.setItem('local_session_role', 'gestor');
        localStorage.setItem('local_session_user', 'admin');
    } else if (email === 'vendas1' && pass === 'v1235') {
        userRole = 'vendedor';
        localStorage.setItem('local_session_role', 'vendedor');
        localStorage.setItem('local_session_user', 'vendas1');
    } else if (email === 'vendas2' && pass === 'vendas2') {
        userRole = 'vendedor';
        localStorage.setItem('local_session_role', 'vendedor');
        localStorage.setItem('local_session_user', 'vendas2');
    } else {
        errorEl.textContent = 'Credenciais inválidas!';
        return;
    }

    showNotification('Login efetuado com sucesso!', 'success');
    
    setTimeout(() => {
        window.location.reload();
    }, 1000);
}

async function logoutUser() {
    localStorage.removeItem('local_session_role');
    localStorage.removeItem('local_session_user');
    window.location.reload();
}

function renderVendedor() {
    console.log('[renderVendedor] INICIO');
    document.getElementById('v-user-label').textContent = localStorage.getItem('local_session_user') || 'Vendedor';
    console.log('[renderVendedor] label OK');
    renderVendedorStock();
    console.log('[renderVendedor] stock OK');
    renderVendedorAtendimento();
        console.log('[renderVendedor] atendimento OK, sec-vendedor=' + (document.getElementById('sec-vendedor') ? 'EXISTE' : 'AUSENTE'));
    console.log('[renderVendedor] FIM, sec-vendedor=' + (document.getElementById('sec-vendedor') ? 'EXISTE' : 'AUSENTE'));
}

function renderVendedorStock(query) {
    var q = (query || '').toLowerCase();
    var filtered = produtos.filter(function (p) {
        return !q || p.nome.toLowerCase().indexOf(q) !== -1 || (p.cat && p.cat.toLowerCase().indexOf(q) !== -1);
    });
    var html = '<table class="table"><thead><tr><th>Produto</th><th>Categoria</th><th>Stock</th><th>Preço Venda</th></tr></thead><tbody>';
    for (var i = 0; i < filtered.length; i++) {
        var p = filtered[i];
        var lowClass = p.qtd <= p.min ? 'style="color:#E24B4A; font-weight:bold;"' : '';
        html += '<tr><td>' + escapeHTML(p.nome) + '</td><td>' + escapeHTML(p.cat || '—') + '</td><td ' + lowClass + '>' + p.qtd + '</td><td>' + (p.venda || 0).toFixed(2) + ' MT</td></tr>';
    }
    html += '</tbody></table>';
    if (filtered.length === 0) html = '<p class="text-muted" style="padding:1rem;">Nenhum medicamento encontrado.</p>';
    document.getElementById('v-stock-table').innerHTML = html;
}

function filterVendedorStock() {
    renderVendedorStock(document.getElementById('v-stock-search').value);
}

async function vAddCliente() {
    var nome = document.getElementById('c-nome-v').value.trim();
    if (!nome) { showNotification('Insira o nome do utente'); return; }
    activeMesa = 1;
    var existing = mesaClientes.find(function (c) { return c.mesa_numero === 1 && c.status === 'ativo' && c.nome_cliente === nome; });
    if (existing) {
        showNotification('Utente já está em atendimento.');
        return;
    }
    await addClienteMesaComVendedor(nome, document.getElementById('c-nota-v').value.trim());
}

async function addClienteMesaComVendedor(nome, nota) {
    try {
        var nextId = Date.now();
        var novoCliente = { id: nextId, mesa_numero: 1, nome_cliente: nome, nota_aparencia: nota || '', status: 'ativo', mesas_pedidos: [], created_at: new Date().toISOString() };
        if (sb) {
            var { data: res, error } = await sb.from(PREFIX + 'mesas_clientes').insert([{ mesa_numero: 1, nome_cliente: nome, nota_aparencia: nota || '' }]).select();
            if (error) { showNotification('Erro: ' + error.message, 'error'); return; }
            if (res && res[0]) novoCliente = { ...res[0], mesas_pedidos: [] };
        }
        showNotification('Utente adicionado!');
        document.getElementById('c-nome-v').value = '';
        document.getElementById('c-nota-v').value = '';
        mesaClientes.unshift(novoCliente);
        renderVendedorAtendimento();
    } catch (e) {
        showNotification('Erro inesperado: ' + e.message, 'error');
        console.error(e);
    }
}

function renderVendedorAtendimento() {
    var el = document.getElementById('v-active-clients');
    var clients = mesaClientes.filter(function (c) { return c.mesa_numero === 1 && c.status === 'ativo'; });
    if (clients.length === 0) {
        el.innerHTML = '<div class="empty">Nenhum utente em atendimento.</div>';
        return;
    }
    el.innerHTML = clients.map(function (c) {
        return '<div class="card" style="border:1px solid #ddd; margin-bottom:10px;">'
            + '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; flex-wrap:wrap;">'
            + '<div><strong style="font-size:16px;">' + escapeHTML(c.nome_cliente) + '</strong>'
            + (c.nota_aparencia ? '<div style="font-size:12px; color:#666;">Obs: ' + escapeHTML(c.nota_aparencia) + '</div>' : '')
            + '</div>'
            + '<button class="btn btn-primary" onclick="openPayment(' + c.id + ')">Finalizar e Pagar</button>'
            + '</div>'
            + '<div style="background:#f9f9f9; padding:10px; border-radius:5px;">'
            + '<div style="display:flex; gap:10px; margin-bottom:10px; flex-wrap:wrap;">'
            + '<select id="vp-prod-' + c.id + '" style="flex:1;">' + produtos.map(function (p) { return '<option value="' + p.id + '">' + escapeHTML(p.nome) + ' (' + (p.venda || 0).toFixed(2) + ' MT)</option>'; }).join('') + '</select>'
            + '<input id="vp-qtd-' + c.id + '" type="number" value="1" style="width:60px;max-width:100%;flex:1 0 50px;">'
            + '<button class="btn" onclick="vAddPedido(' + c.id + ')">+ Pedido</button>'
            + '</div>'
            + '<table style="width:100%; font-size:12px;"><thead><tr style="text-align:left;"><th>Item</th><th>Qtd</th><th>Preço</th><th>Total</th><th></th></tr></thead><tbody>'
            + (c.mesas_pedidos || []).map(function (p) {
                return '<tr><td>' + escapeHTML(p.produto_nome) + '</td><td>' + p.quantidade + '</td><td>' + (p.preco_unitario || 0).toFixed(2) + '</td><td>' + (p.total || 0).toFixed(2) + ' MT</td>'
                    + '<td><button type="button" style="border:none; background:none; color:#E24B4A; cursor:pointer;" onclick="vRemovePedido(event, ' + p.id + ', ' + c.id + ')">🗑</button></td></tr>';
            }).join('')
            + '</tbody></table>'
            + '<div style="text-align:right; margin-top:10px; font-weight:bold; font-size:14px;">Total: ' + ((c.mesas_pedidos || []).reduce(function (a, b) { return a + (b.total || 0); }, 0)).toFixed(2) + ' MT</div>'
            + '</div></div>';
    }).join('');
}

async function vAddPedido(clientId) {
    try {
        var pId = parseInt(document.getElementById('vp-prod-' + clientId).value);
        var qtd = parseInt(document.getElementById('vp-qtd-' + clientId).value) || 0;
        var prod = produtos.find(function (p) { return p.id === pId; });
        if (!prod || qtd <= 0) return;
        if (qtd > prod.qtd) { showNotification('Stock insuficiente. Disponível: ' + prod.qtd, 'error'); return; }
        prod.qtd -= qtd;
        var pedido = { id: Date.now(), cliente_id: clientId, produto_id: pId, produto_nome: prod.nome, quantidade: qtd, preco_unitario: prod.venda, total: qtd * prod.venda };
        if (sb) {
            var { data: res, error } = await sb.from(PREFIX + 'mesas_pedidos').insert([{ cliente_id: clientId, produto_id: pId, produto_nome: prod.nome, quantidade: qtd, preco_unitario: prod.venda, total: qtd * prod.venda }]).select();
            if (error) { prod.qtd += qtd; showNotification('Erro: ' + error.message, 'error'); return; }
            if (res && res[0]) pedido = res[0];
        }
        var client = mesaClientes.find(function (c) { return c.id === clientId; });
        if (client) {
            if (!client.mesas_pedidos) client.mesas_pedidos = [];
            client.mesas_pedidos.push(pedido);
        }
        renderVendedorAtendimento();
        renderVendedorStock(document.getElementById('v-stock-search').value);
    } catch (e) {
        showNotification('Erro inesperado: ' + e.message, 'error');
        console.error(e);
    }
}

async function vRemovePedido(event, pedidoId, clientId) {
    try {
        if (event) event.stopPropagation();
        if (!(await showConfirm('Remover este pedido?'))) return;
        var client = mesaClientes.find(function (c) { return c.id === clientId; });
        if (!client) return;
        var pedido = (client.mesas_pedidos || []).find(function (p) { return p.id === pedidoId; });
        if (!pedido) return;
        if (sb) {
            var { error } = await sb.from(PREFIX + 'mesas_pedidos').delete().eq('id', pedidoId);
            if (error) { showNotification('Erro: ' + error.message, 'error'); return; }
        }
        var prod = produtos.find(function (p) { return p.id === pedido.produto_id; });
        if (prod) {
            prod.qtd += pedido.quantidade;
            if (sb) await sb.from(PREFIX + 'produtos').update({ quantidade: prod.qtd }).eq('id', prod.id);
        }
        client.mesas_pedidos = client.mesas_pedidos.filter(function (p) { return p.id !== pedidoId; });
        showNotification('Pedido removido.', 'success');
        renderVendedorAtendimento();
        renderVendedorStock(document.getElementById('v-stock-search').value);
    } catch (e) {
        showNotification('Erro inesperado: ' + e.message, 'error');
        console.error(e);
    }
}

async function applyRoleRestrictions() {
    console.log('[applyRoleRestrictions] INICIO role=' + userRole);
    const isGestor = userRole === 'gestor';
    const sidebar = document.querySelector('.sidebar');
    const app = document.querySelector('.app');
    console.log('[applyRoleRestrictions] sidebar=' + (!!sidebar) + ' app=' + (!!app));
    
    if (!isGestor) {
        console.log('[applyRoleRestrictions] modo VENDEDOR');
        document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
        var sec = document.getElementById('sec-vendedor');
        console.log('[applyRoleRestrictions] sec-vendedor=' + (!!sec));
        if (sec) {
            sec.classList.add('active');
            sec.style.backgroundColor = 'red';
            sec.style.border = '10px solid green';
            console.log('[applyRoleRestrictions] sec-vendedor background vermelho');
        }
        if (sidebar) sidebar.style.display = 'none';
        if (app) app.classList.add('seller-mode');
        console.log('[applyRoleRestrictions] chamando renderVendedor...');
        renderVendedor();
        console.log('[applyRoleRestrictions] renderVendedor OK');
    } else {
        console.log('[applyRoleRestrictions] modo GESTOR');
        if (sidebar) sidebar.style.display = 'flex';
        if (app) app.classList.remove('seller-mode');
        showSection('relatorios');
    }

    // Restrições na aba Movimentos
    const btnEntrada = document.getElementById('tipo-entrada');
    const inputPreco = document.getElementById('m-preco');
    const mDataEl = document.getElementById('m-data');
    const mNotaEl = document.getElementById('m-nota');
    const groupData = mDataEl ? mDataEl.closest('.form-group') : null;
    const groupNota = mNotaEl ? mNotaEl.closest('.form-group') : null;
    const groupCusto = document.getElementById('group-custo');

    if (userRole === 'vendedor') {
        if (btnEntrada) btnEntrada.style.display = 'none';
        if (inputPreco) inputPreco.readOnly = true;
        if (groupData) groupData.style.display = 'none';
        if (groupNota) groupNota.style.display = 'none';
        if (groupCusto) groupCusto.style.display = 'none';
        if (tipoActivo === 'entrada') setTipo('saida');
    } else {
        if (btnEntrada) btnEntrada.style.display = 'inline-block';
        if (inputPreco) inputPreco.readOnly = false;
        if (groupData) groupData.style.display = 'flex';
        if (groupNota) groupNota.style.display = 'flex';
        if (tipoActivo === 'entrada' && groupCusto) groupCusto.style.display = 'flex';
    }
}

async function initApp() {
    console.log('[initApp] INICIO role=' + userRole);
    try {
        setDefaultDates();
        console.log('[initApp] setDefaultDates OK');
        await fetchData();
        console.log('[initApp] fetchData OK');
        if (userRole === 'vendedor') {
            renderVendedor();
        } else {
            renderRelatorios();
            renderMovimentos();
            renderDespesas();
            renderCaixa();
            renderNecessidades();
            renderDocsHistory();
            var ac = document.getElementById('alert-count');
            if (ac) ac.textContent = produtos.filter(function (p) { return p.qtd <= p.min; }).length || '';
        }
    } catch (e) {
        console.error('INIT APP ERROR:', e);
    }
    console.log('[initApp] FIM, sec-vendedor=' + (document.getElementById('sec-vendedor') ? 'EXISTE' : 'AUSENTE'));
}

// Expor funções usadas por handlers inline no HTML
Object.assign(window, {
    addClienteMesa,
    addDespesa,
    addDocItem,
    addMovimento,
    addPaymentRow,
    addPedidoMesa,
    addPlanoItem,
    addProduto,
    addSaldoMovimento,
    clearPlano,
    closeConfirmModal,
    closePayment,
    confirmarCompra,
    confirmarMesaPagamento,
    deleteDocumento,
    deleteDespesa,
    deleteMovimento,
    deleteSelectedMovimentos,
    devolverQuarentena,
    downloadPDFFromHistory,
    editDespesa,
    loginUser,
    logoutUser,
    onProductSearch,
    openPayment,
    prePopulatePlano,
    printDailyMovements,
    printFaturacao,
    printHistoricoMovimentos,
    printMensal,
    printPlanoCompras,
    prepareDocPrintArea,
    renderDocList,
    renderMesas,
    renderMovimentos,
    renderRelMensal,
    renderRelatorios,
    renderStock,
    saveAndDownloadPDF,
    setPeriodo,
    setSaldoInicial,
    setTipo,
    showSection,
    toggleSidebar,
    toggleCustomCat,
    toggleCustomProdCat,
    toggleSelectAllMovs,
    updateMovTotal,
    updatePaymentSummary,
    updatePlanoQtd,
    vAddCliente,
    vAddPedido,
    vRemovePedido,
    filterVendedorStock,
    voltarAtendimento,
    removeDocItem,
    removePedidoMesa,
    removePlanoItem
});

// Check session on load
console.log('[TOP LEVEL] sec-vendedor=' + (document.getElementById('sec-vendedor') ? 'EXISTE' : 'AUSENTE'));
checkSession();

// ====================== SALDO ======================
function renderSaldo() {
    const metricsEl = document.getElementById('saldo-metrics');
    const listEl = document.getElementById('saldo-list');
    
    // Totais por método
    const totals = { CASH: 0, MPESA: 0, EMOLA: 0, POS: 0, TRANSFERENCIA: 0, BANCO: 0 };
    
    // Considerar movimentos de saldo
    saldoMovimentos.forEach(m => {
        const val = parseFloat(m.valor) || 0;
        if (m.tipo === 'saldo_inicial' || m.tipo === 'investimento') {
            totals[m.metodo] += val;
        } else if (m.tipo === 'gasto') {
            totals[m.metodo] -= val;
        }
    });

    // Subtrair despesas
    despesas.forEach(d => {
        let m = d.metodo;
        if (m === 'Conta Bancária') m = 'TRANSFERENCIA';
        if (totals[m] !== undefined) totals[m] -= d.valor;
    });

    // Somar vendas (saídas)
    movimentos.filter(m => m.tipo === 'saida').forEach(m => {
        if (totals[m.metodo] !== undefined) totals[m.metodo] += m.total;
    });

    // Subtrair compras (entradas)
    movimentos.filter(m => m.tipo === 'entrada').forEach(m => {
        if (totals[m.metodo] !== undefined) totals[m.metodo] -= m.total;
    });

    const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);

    metricsEl.innerHTML = `
        <div class="metric-card"><div class="metric-label">Saldo Total Disponível</div><div class="metric-value ${grandTotal >= 0 ? '' : 'text-danger'}">${grandTotal.toLocaleString()} MZN</div></div>
        <div class="metric-card"><div class="metric-label">Dinheiro (CASH)</div><div class="metric-value">${totals.CASH.toLocaleString()} MZN</div></div>
        <div class="metric-card"><div class="metric-label">M-Pesa</div><div class="metric-value">${totals.MPESA.toLocaleString()} MZN</div></div>
        <div class="metric-card"><div class="metric-label">e-Mola</div><div class="metric-value">${totals.EMOLA.toLocaleString()} MZN</div></div>
        <div class="metric-card"><div class="metric-label">Banco</div><div class="metric-value">${(totals.BANCO + totals.TRANSFERENCIA + totals.POS).toLocaleString()} MZN</div></div>
    `;

    listEl.innerHTML = saldoMovimentos.length ?
        '<div class="table-responsive"><table><thead><tr><th>Data</th><th>Tipo</th><th>Método</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>' +
        saldoMovimentos.map(m => `
            <tr>
                <td>${escapeHTML(new Date(m.data).toLocaleDateString())}</td>
                <td><span class="badge ${m.tipo === 'investimento' ? 'badge-ok' : 'badge-low'}">${escapeHTML(m.tipo.toUpperCase())}</span></td>
                <td>${escapeHTML(m.metodo)}</td>
                <td>${escapeHTML(m.descricao || '—')}</td>
                <td style="font-weight:bold; color:${m.tipo === 'gasto' ? '#A32D2D' : '#3B6D11'};">${m.tipo === 'gasto' ? '-' : '+'}${m.valor.toLocaleString()} MZN</td>
            </tr>
        `).join('') + '</tbody></table></div>' : '<div class="empty">Nenhum movimento manual de saldo.</div>';
}

async function addSaldoMovimento() {
    const tipo = document.getElementById('s-tipo').value;
    const metodo = document.getElementById('s-metodo').value;
    const valor = parseFloat(document.getElementById('s-valor').value) || 0;
    const desc = document.getElementById('s-desc').value.trim();
    const data = document.getElementById('s-data').value || new Date().toISOString();

    if (!valor) { showNotification('Insira um valor válido'); return; }

    const payload = { tipo, metodo, valor, descricao: desc, data };
    const { data: res, error } = await sb.from(PREFIX + 'saldo_caixa').insert([payload]).select();
    
    if (!error) {
        showNotification('Movimento registado!', 'success');
        saldoMovimentos.unshift(res[0]);
        renderSaldo();
    } else { showNotification('Erro: ' + error.message); }
}

async function setSaldoInicial() {
    const val = prompt('Qual o valor do Saldo Inicial total? (Será distribuído como CASH)');
    if (val === null) return;
    const num = parseFloat(val) || 0;
    
    const payload = { tipo: 'saldo_inicial', metodo: 'CASH', valor: num, descricao: 'Saldo Inicial do Sistema' };
    const { error } = await sb.from(PREFIX + 'saldo_caixa').insert([payload]);
    if (!error) {
        showNotification('Saldo inicial definido!', 'success');
        fetchData().then(renderSaldo);
    }
}

// ====================== MESAS ======================
function renderMesas() {
    const grid = document.getElementById('mesas-grid');
    const panel = document.getElementById('mesa-panel');
    
    grid.style.display = 'grid';
    panel.style.display = 'none';
    grid.innerHTML = '';
    
    for (let i = 1; i <= 10; i++) {
        const client = mesaClientes.find(c => c.mesa_numero === i && c.status === 'ativo');
        const card = document.createElement('div');
        card.className = 'mesa-card ' + (client ? 'occupied' : 'free');
        card.onclick = () => openMesa(i);
        
        let totalVal = 0;
        if (client && client.mesas_pedidos) {
            totalVal = client.mesas_pedidos.reduce((a, b) => a + b.total, 0);
        }

        card.innerHTML = `
            <h3 style="margin-bottom:10px;">🏥 Balcão ${i}</h3>
            <div class="mesa-badge" style="background:${client ? '#FFEBEE' : '#E8F5E9'}; color:${client ? '#C62828' : '#2E7D32'};">${client ? 'Em Atendimento' : 'Livre'}</div>
            ${client ? `<div style="font-size:12px; margin-top:10px; font-weight:bold;">${escapeHTML(client.nome_cliente)}</div>` : ''}
            ${totalVal > 0 ? `<div style="font-size:14px; margin-top:5px; color:#1565C0;">Total: ${totalVal.toLocaleString()} MT</div>` : ''}
        `;
        grid.appendChild(card);
    }
}

function openMesa(n) {
    activeMesa = n;
    const grid = document.getElementById('mesas-grid');
    const panel = document.getElementById('mesa-panel');
    const title = document.getElementById('mesa-title');
    
    grid.style.display = 'none';
    panel.style.display = 'block';
    title.textContent = '💊 Balcão de Atendimento ' + n;
    
    renderMesaContent();
}

function renderMesaContent() {
    const clientListEl = document.getElementById('active-clients');
    const clients = mesaClientes.filter(c => c.mesa_numero === activeMesa && c.status === 'ativo');
    
    if (clients.length === 0) {
        clientListEl.innerHTML = '<div class="empty">Nenhum utente activo neste balcão.</div>';
        return;
    }

    clientListEl.innerHTML = clients.map(c => `
        <div class="card" style="border:1px solid #ddd; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; flex-wrap:wrap;">
                <div>
                    <strong style="font-size:16px;">${escapeHTML(c.nome_cliente)}</strong>
                    ${c.nota_aparencia ? `<div style="font-size:12px; color:#666;">Obs: ${escapeHTML(c.nota_aparencia)}</div>` : ''}
                </div>
                <button class="btn btn-primary" onclick="openPayment(${c.id})">Finalizar e Pagar</button>
            </div>
            
            <div style="background:#f9f9f9; padding:10px; border-radius:5px;">
                <div style="display:flex; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
                    <select id="p-prod-${c.id}" style="flex:1;">${produtos.map(p => `<option value="${p.id}">${escapeHTML(p.nome)} (${p.venda} MT)</option>`).join('')}</select>
                    <input id="p-qtd-${c.id}" type="number" value="1" style="width:60px;max-width:100%;flex:1 0 50px;">
                    <button class="btn" onclick="addPedidoMesa(${c.id})">+ Pedido</button>
                </div>
                <table style="width:100%; font-size:12px;">
                    <thead><tr style="text-align:left;"><th>Item</th><th>Qtd</th><th>Preço</th><th>Total</th><th style="width:20px;"></th></tr></thead>
                    <tbody>
                        ${(c.mesas_pedidos || []).map(p => `
                            <tr>
                                <td>${escapeHTML(p.produto_nome)}</td>
                                <td>${p.quantidade}</td>
                                <td>${p.preco_unitario}</td>
                                <td>${p.total} MT</td>
                                <td><button type="button" style="border:none; background:none; color:#E24B4A; cursor:pointer; font-weight:bold;" onclick="removePedidoMesa(event, ${p.id}, ${c.id})">🗑</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div style="text-align:right; margin-top:10px; font-weight:bold; font-size:14px;">Total Cliente: ${c.mesas_pedidos.reduce((a, b) => a + b.total, 0).toLocaleString()} MT</div>
            </div>
        </div>
    `).join('');
}

async function addClienteMesa() {
    const nome = document.getElementById('c-nome').value.trim();
    const nota = document.getElementById('c-nota').value.trim();
    if (!nome) { showNotification('Insira o nome do utente'); return; }

    const payload = { mesa_numero: activeMesa, nome_cliente: nome, nota_aparencia: nota };
    const { data: res, error } = await sb.from(PREFIX + 'mesas_clientes').insert([payload]).select();
    
    if (!error) {
        showNotification('Cliente adicionado!');
        document.getElementById('c-nome').value = '';
        document.getElementById('c-nota').value = '';
        mesaClientes.unshift({ ...res[0], mesas_pedidos: [] });
        renderMesaContent();
    }
}

async function removePedidoMesa(event, pedidoId, clientId) {
    if (event) event.stopPropagation();
    if (!(await showConfirm('Eliminar este pedido e devolver o stock?'))) return;
    const client = mesaClientes.find(c => c.id === clientId);
    if (!client) return;
    const pedido = client.mesas_pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    const { error } = await sb.from(PREFIX + 'mesas_pedidos').delete().eq('id', pedidoId);
    if (!error) {
        // Devolver stock
        const prod = produtos.find(p => p.id === pedido.produto_id);
        if (prod) {
            prod.qtd += pedido.quantidade;
            await sb.from(PREFIX + 'produtos').update({ quantidade: prod.qtd }).eq('id', prod.id);
        }
        client.mesas_pedidos = client.mesas_pedidos.filter(p => p.id !== pedidoId);
        showNotification('Pedido removido e stock devolvido.', 'success');
        renderMesaContent();
        renderStock();
    } else {
        showNotification('Erro ao remover pedido: ' + error.message);
    }
}
async function addPedidoMesa(clientId) {
    const pId = parseInt(document.getElementById('p-prod-' + clientId).value);
    const qtd = parseInt(document.getElementById('p-qtd-' + clientId).value) || 0;
    const prod = produtos.find(p => p.id === pId);
    
    if (!prod || qtd <= 0) return;
    
    const payload = { 
        cliente_id: clientId, 
        produto_id: pId, 
        produto_nome: prod.nome, 
        quantidade: qtd, 
        preco_unitario: prod.venda, 
        total: qtd * prod.venda 
    };
    
    const { data: res, error } = await sb.from(PREFIX + 'mesas_pedidos').insert([payload]).select();
    if (!error) {
        const client = mesaClientes.find(c => c.id === clientId);
        if (client) {
            if (!client.mesas_pedidos) client.mesas_pedidos = [];
            client.mesas_pedidos.push(res[0]);
        }
        renderMesaContent();
    }
}

function voltarMesas() {
    activeMesa = null;
    renderMesas();
}

function voltarAtendimento() {
    voltarMesas();
}

// Lógica de Pagamento Múltiplo
let currentPayClient = null;
let currentPayTotal = 0;

function openPayment(clientId) {
    currentPayClient = mesaClientes.find(c => c.id === clientId);
    if (!currentPayClient || !currentPayClient.mesas_pedidos || currentPayClient.mesas_pedidos.length === 0) {
        showNotification('Nenhum pedido para pagar.'); return;
    }

    currentPayTotal = currentPayClient.mesas_pedidos.reduce((a, b) => a + b.total, 0);
    
    document.getElementById('pay-client-name').textContent = currentPayClient.nome_cliente;
    document.getElementById('pay-total-amount').textContent = currentPayTotal.toLocaleString();
    document.getElementById('payment-methods-list').innerHTML = '';
    
    // Adicionar primeira linha de pagamento
    addPaymentRow('CASH', currentPayTotal);
    
    document.getElementById('payment-modal').style.display = 'block';
    document.getElementById('payment-overlay').style.display = 'block';
}

function closePayment() {
    document.getElementById('payment-modal').style.display = 'none';
    document.getElementById('payment-overlay').style.display = 'none';
}

function addPaymentRow(method = 'CASH', value = 0) {
    const list = document.getElementById('payment-methods-list');
    const div = document.createElement('div');
    div.className = 'payment-row';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginBottom = '10px';
    div.style.flexWrap = 'wrap';
    
    div.innerHTML = `
        <select class="pay-method" style="flex:2;" onchange="updatePaymentSummary()">
            <option value="CASH" ${method === 'CASH' ? 'selected' : ''}>Dinheiro (CASH)</option>
            <option value="MPESA" ${method === 'MPESA' ? 'selected' : ''}>M-Pesa</option>
            <option value="EMOLA" ${method === 'EMOLA' ? 'selected' : ''}>e-Mola</option>
            <option value="POS" ${method === 'POS' ? 'selected' : ''}>Cartão (POS)</option>
            <option value="TRANSFERENCIA" ${method === 'TRANSFERENCIA' ? 'selected' : ''}>Transferência</option>
            <option value="BANCO" ${method === 'BANCO' ? 'selected' : ''}>Banco / Outro</option>
        </select>
        <input class="pay-value" type="number" step="0.01" value="${value}" style="flex:1;" oninput="updatePaymentSummary()">
        <button class="btn btn-danger" onclick="this.parentElement.remove(); updatePaymentSummary()">X</button>
    `;
    list.appendChild(div);
    updatePaymentSummary();
}

function updatePaymentSummary() {
    const rows = document.querySelectorAll('.payment-row');
    let sum = 0;
    rows.forEach(row => {
        sum += parseFloat(row.querySelector('.pay-value').value) || 0;
    });
    
    document.getElementById('pay-current-sum').textContent = sum.toLocaleString();
    
    const change = sum - currentPayTotal;
    const changeRow = document.getElementById('pay-change-row');
    const changeEl = document.getElementById('pay-change-amount');
    
    if (change > 0) {
        changeRow.style.display = 'flex';
        changeEl.textContent = change.toLocaleString();
    } else {
        changeRow.style.display = 'none';
        changeEl.textContent = '0';
    }

    const btn = document.getElementById('btn-confirm-pay');
    
    // Permitir confirmar se valor for >= total
    if (sum >= currentPayTotal - 0.01) {
        btn.disabled = false;
        btn.style.opacity = '1';
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    }
}

async function confirmarMesaPagamento() {
    const rows = document.querySelectorAll('.payment-row');
    const payments = [];
    rows.forEach(row => {
        payments.push({
            metodo: row.querySelector('.pay-method').value,
            valor: parseFloat(row.querySelector('.pay-value').value) || 0
        });
    });

    // 1. Gerar Factura Documento
    var invoice;
    const payloadDoc = {
        tipo: 'factura',
        cliente: currentPayClient.nome_cliente + ' (Balcão ' + currentPayClient.mesa_numero + ')',
        total: currentPayTotal,
        metodo_pagamento: payments.map(p => p.metodo).join(' / '),
        detalhes: { 
            items: currentPayClient.mesas_pedidos.map(p => ({ nome: p.produto_nome, id: p.produto_id, qtd: p.quantidade, preco: p.preco_unitario, total: p.total })),
            pagamentos: payments
        }
    };

    if (sb) {
        const { data: docRes, error: docErr } = await sb.from(PREFIX + 'documentos').insert([payloadDoc]).select();
        let dbInvoice = docRes && docRes.length > 0 ? docRes[0] : null;
        if (!docErr && !dbInvoice) {
            const { data: latest } = await sb.from(PREFIX + 'documentos').select('*').eq('cliente', payloadDoc.cliente).order('created_at', { ascending: false }).limit(1);
            if (latest) dbInvoice = latest[0];
        }
        if (docErr || !dbInvoice) {
            console.error('Erro Fatura:', docErr);
            showNotification('Erro ao gerar factura. Tente novamente.', 'error'); 
            return;
        }
        invoice = dbInvoice;

        // 2. Registar em Saldo Caixa
        for (const p of payments) {
            if (p.valor > 0) {
                await sb.from(PREFIX + 'saldo_caixa').insert([{
                    tipo: 'investimento',
                    metodo: p.metodo,
                    valor: p.valor,
                    descricao: 'Venda Balcão ' + currentPayClient.mesa_numero + ' (' + currentPayClient.nome_cliente + ')'
                }]);
            }
        }

        // 3. Fechar cliente e sincronizar stock
        await sb.from(PREFIX + 'mesas_clientes').update({ status: 'pago' }).eq('id', currentPayClient.id);
        await syncInvoiceToStock(dbInvoice);
    } else {
        // Modo offline: factura local apenas para impressão
        invoice = { id: 'OFF-' + Date.now(), ...payloadDoc, data: new Date().toISOString().split('T')[0] };
        currentPayClient.status = 'pago';
    }

    currentPayClient.status = 'pago';
    showNotification('Pagamento concluído!', 'success');
    closePayment();
    if (userRole === 'vendedor') {
        prepareDocPrintArea(invoice);
        setTimeout(function () {
            generatePDF(document.getElementById('print-area'), 'Factura_' + invoice.id + '.pdf');
        }, 500);
        fetchData().then(function () { renderVendedor(); });
    } else {
        voltarMesas();
        fetchData().then(renderMesas);
    }
}



// ====================== PLANO DE COMPRAS ======================
function renderPlanoCompras() {
    populatePlanoProdutoSelect();
    var tbody = document.getElementById('plano-items');
    if (!tbody) return;
    tbody.innerHTML = planoItems.map(function (item, i) {
        return '<tr><td>' + escapeHTML(item.nome) + '</td>' +
            '<td><input type="number" value="' + item.qtd + '" min="1" style="width:60px;max-width:80px;padding:3px 6px;" onchange="updatePlanoQtd(' + i + ',this.value)"></td>' +
            '<td>' + item.custo.toLocaleString() + '</td>' +
            '<td style="font-weight:500;">' + (item.qtd * item.custo).toLocaleString() + '</td>' +
            '<td>' + escapeHTML(item.forn || '-') + '</td>' +
            '<td><button class="btn btn-danger" onclick="removePlanoItem(' + i + ')">X</button></td></tr>';
    }).join('');
    var totalPlano = planoItems.reduce(function (a, it) { return a + (it.qtd * it.custo); }, 0);
    document.getElementById('plano-total').textContent = totalPlano.toLocaleString();
    document.getElementById('plano-count').textContent = planoItems.length;
}

function populatePlanoProdutoSelect() {
    var sel = document.getElementById('plano-produto');
    if (sel) sel.innerHTML = produtos.map(function (p) { return '<option value="' + escapeHTML(p.id) + '">' + escapeHTML(p.nome) + ' (' + p.custo + ' MZN)</option>'; }).join('');
}

function addPlanoItem() {
    var sel = document.getElementById('plano-produto');
    var qtdEl = document.getElementById('plano-qtd');
    if (!sel || !qtdEl) return;
    var pId = parseInt(sel.value);
    var q = parseInt(qtdEl.value) || 1;
    var prod = produtos.find(function (x) { return x.id === pId; });
    if (!prod) return;
    // Check if already in list
    var existing = planoItems.find(function (x) { return x.id === pId; });
    if (existing) { existing.qtd += q; }
    else { planoItems.push({ id: prod.id, nome: prod.nome, qtd: q, custo: prod.custo, forn: prod.forn || '-' }); }
    qtdEl.value = 1;
    renderPlanoCompras();
}

function removePlanoItem(i) { planoItems.splice(i, 1); renderPlanoCompras(); }

function updatePlanoQtd(i, val) {
    planoItems[i].qtd = parseInt(val) || 1;
    renderPlanoCompras();
}

function prePopulatePlano() {
    planoItems = [];
    var rep = produtos.filter(function (p) { return p.qtd < p.min; });
    rep.forEach(function (p) {
        var comprar = p.min - p.qtd;
        planoItems.push({ id: p.id, nome: p.nome, qtd: comprar, custo: p.custo, forn: p.forn || '-' });
    });
    showNotification(planoItems.length > 0 ? planoItems.length + ' produtos adicionados ao plano!' : 'Stock robusto — sem necessidades.', planoItems.length > 0 ? 'success' : 'info');
    renderPlanoCompras();
}

async function clearPlano() {
    if (await showConfirm('Deseja limpar todos os itens do plano de compras?')) {
        planoItems = [];
        renderPlanoCompras();
        showNotification('Plano limpo com sucesso!', 'success');
    }
}

function printPlanoCompras() {
    if (planoItems.length === 0) { showNotification('Adicione produtos ao plano primeiro.'); return; }
    var totalPlano = planoItems.reduce(function (a, it) { return a + (it.qtd * it.custo); }, 0);
    var today = new Date().toLocaleDateString('pt-MZ', { year: 'numeric', month: 'long', day: 'numeric' });
    var rows = planoItems.map(function (item, i) {
        return '<tr>' +
            '<td style="padding:6px 8px;border:1px solid #ccc;">' + (i + 1) + '</td>' +
            '<td style="padding:6px 8px;border:1px solid #ccc;">' + item.nome + '</td>' +
            '<td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">' + item.qtd + '</td>' +
            '<td style="padding:6px 8px;border:1px solid #ccc;text-align:right;">' + item.custo.toLocaleString() + '</td>' +
            '<td style="padding:6px 8px;border:1px solid #ccc;text-align:right;font-weight:bold;">' + (item.qtd * item.custo).toLocaleString() + '</td>' +
            '<td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">☐</td></tr>';
    });

    var printContent = `<!DOCTYPE html><html><head>
        <title>Plano de Compras</title>
        <style>
            body { font-family: Arial, sans-serif; color: #000; padding: 20px; font-size: 14px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h2 { margin: 0; font-size: 22px; }
            .header .subtitle { font-size: 16px; font-weight: bold; margin-top: 5px; }
            .header .date { font-size: 13px; color: #555; margin-top: 3px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }
            th { background: #f0f0f0; border: 1px solid #ccc; padding: 8px; text-align: left; }
            td { border: 1px solid #ccc; padding: 6px 8px; }
            .total { text-align: right; font-size: 16px; font-weight: bold; border-top: 2px solid #000; padding-top: 10px; }
            .signatures { margin-top: 40px; font-size: 12px; color: #777; display: flex; justify-content: space-between; }
            .footer { text-align: center; font-size: 11px; color: #999; margin-top: 30px; }
            @media print { body { padding: 0; } }
        </style></head><body>
        <div class="header">
            <h2>Sistema Farmacêutico</h2>
            <div class="subtitle">PLANO DE COMPRAS</div>
            <div class="date">${today}</div>
        </div>
        <table><thead><tr>
            <th>#</th><th>Produto</th><th>Qtd</th><th>Custo Unit.</th><th>Custo Total</th><th>✓</th>
        </tr></thead><tbody>${rows.join('')}</tbody></table>
        <div class="total">TOTAL ESTIMADO: ${totalPlano.toLocaleString()} MZN</div>
        <div class="signatures"><div>_________________________<br>Assinatura do Comprador</div>
            <div>_________________________<br>Aprovado por</div></div>
        <div class="footer">Processado por Computador (Sistema Farmacêutico)</div>
        </body></html>`;

    var win = window.open('', '_blank');
    if (win) win.opener = null;
    win.document.write(printContent);
    win.document.close();
    win.onload = function() { win.print(); };
}

async function confirmarCompra() {
    if (!(await showConfirm('Deseja confirmar o recebimento e actualizar o stock? ' + planoItems.length + ' produtos serão adicionados.'))) return;

    showNotification('A processar entrada de mercadoria...', 'info');

    try {
        var newMovs = [];
        for (var item of planoItems) {
            var p = produtos.find(function(x) { return x.id === item.id; });
            if (p) {
                p.qtd += item.qtd;
                // Registar entrada no histórico
                newMovs.push({
                    tipo: 'entrada',
                    produto_id: item.id,
                    quantidade: item.qtd,
                    preco_unitario: item.custo,
                    total: item.qtd * item.custo,
                    nota: '[Entrada Automática - Plano de Compra]',
                    metodo_pagamento: 'CASH'
                });
                await sb.from(PREFIX + 'produtos').update({ quantidade: p.qtd }).eq('id', p.id);
            }
        }
        if (newMovs.length > 0) {
            await sb.from(PREFIX + 'movimentos').insert(newMovs);
        }
        
        showNotification('Stock actualizado com sucesso!', 'success');
        planoItems = [];
        await fetchData();
        renderPlanoCompras(); renderStock(); renderRelatorios();
    } catch (err) {
        console.error('Erro na confirmação:', err);
        showNotification('Erro ao confirmar compra.', 'error');
    }
}

