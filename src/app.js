// ============================================================
// SISTEMA FARMACÊUTICO — app.js (Supabase + Chart.js) - BUILD 20260331-2357
// ============================================================

import { createSupabaseClient } from './services/supabase.js';
import { getElement, queryAll, escapeHTML } from './utils/domUtils.js';
import { showNotification } from './utils/notifications.js';
import { showConfirm, closeConfirmModal } from './utils/dialogs.js';
import { renderStock as renderStockModule, getStatus } from './components/stock.js';
import { pharmacy } from './config/pharmacy.js';
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
    renderMovimentosDoDia();
}

function checkLowStock(p) {
    if (p && p.qtd <= p.min) {
        showNotification('Stock Baixo: ' + p.nome + ' (Resta: ' + p.qtd + ')', 'error');
    }
}

let produtos = [];
let movimentos = [];
let despesas = [];
let documentos = [];
let docItems = [];
let planoItems = [];
let saldoMovimentos = [];
let tipoActivo = 'entrada';
let periodoActivo = 'diário';
let currentSortField = 'nome';
let currentSortOrder = 'asc';
let chartVendas, chartLucro, chartRelVendas, chartRelLucro, chartTop5, chartDiario, chartROI;
let userRole = 'gestor';
let currentUserEmail = '';
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
    if (id === 'stock') { showStockTab('all'); populateGestaoData(); renderAlertas(); }
    if (id === 'movimentos') renderMovimentos();
    if (id === 'alertas') renderAlertas();
    if (id === 'caixa') renderCaixa();
    if (id === 'despesas') renderDespesas();
    if (id === 'necessidades') renderNecessidades();
    if (id === 'documentos') populateDocProdutoSelect();
    if (id === 'planocompras') renderPlanoCompras();
    if (id === 'relmensal') {
        if (!periodoActivo || (periodoActivo !== 'dia' && periodoActivo !== 'intervalo')) {
            setPeriodo('mensal', document.querySelector('#sec-relmensal .period-btn'));
        }
        renderRelMensal();
    }
    if (id === 'saldo') renderSaldo();
    if (id === 'vnova-venda') renderVendedor();
    if (id === 'vvendas') renderVendasDoDia();
    if (id === 'vstock') renderVendedorStock();
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
    var html = '<html><head><title>' + pharmacy.nome + ' - Movimentos do Dia</title><style>' +
               'body { font-family: sans-serif; padding: 20px; font-size: 14px; }' +
               'table { width: 100%; border-collapse: collapse; margin-top: 15px; }' +
               'th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }' +
               'th { background: #f8f9fa; }' +
               'h1 { font-size: 20px; text-align: center; margin-bottom: 5px; }' +
               'p { text-align: center; color: #666; font-size: 13px; }' +
               '</style></head><body>' +
               '<h1>' + pharmacy.nome + '</h1>' +
               '<p>' + pharmacy.endereco + ' | NUIT: ' + pharmacy.nuit + '</p>' +
               '<p>Relatório de Movimentos Diários - ' + hoje.split('-').reverse().join('/') + '</p>' +
               '<table><thead><tr><th>Hora</th><th>Produto</th><th>Tipo</th><th>Vendedor</th><th>Qtd</th><th>Total (MZN)</th></tr></thead><tbody>';
                
    movs.forEach(function (m) {
        var p = produtos.find(function (x) { return x.id === m.prodId; });
        html += '<tr>' +
                '<td>' + escapeHTML(m.created_at ? new Date(m.created_at).toLocaleTimeString() : '-') + '</td>' +
                '<td>' + escapeHTML(p ? p.nome : m.produto_nome || '-') + '</td>' +
                '<td>' + escapeHTML(m.tipo === 'saida' ? 'Venda' : 'Quebra') + '</td>' +
                '<td>' + escapeHTML(m.vendedor ? getVendedorDisplayName(m.vendedor) : '—') + '</td>' +
                '<td>' + m.qtd + '</td>' +
                '<td>' + m.total.toLocaleString() + '</td>' +
                '</tr>';
    });
    
    var totalVendas = movs.filter(m => m.tipo === 'saida').reduce((a, b) => a + b.total, 0);
    
    html += '</tbody></table>' +
            '<div style="margin-top:20px; text-align:right; border-top: 2px solid #333; padding-top: 10px;">' +
            '<strong>Total de Vendas do Dia: ' + totalVendas.toLocaleString() + ' MZN</strong>' +
            '</div>' +
            '<div style="margin-top:40px; font-size:10px; text-align:center;">Processado por ' + pharmacy.nome + '</div>' +
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

    // Dashboard date inputs
    var dateInputs = document.getElementById('periodo-date-inputs');
    if (dateInputs) {
        var dataDia = document.getElementById('periodo-data-dia');
        var dataFim = document.getElementById('periodo-data-fim');
        var dataSep = document.getElementById('periodo-data-sep');
        if (p === 'dia') {
            dateInputs.style.display = 'flex';
            dataDia.style.display = 'inline-block';
            dataFim.style.display = 'none';
            dataSep.style.display = 'none';
            if (!dataDia.value) dataDia.value = new Date().toISOString().split('T')[0];
        } else if (p === 'intervalo') {
            dateInputs.style.display = 'flex';
            dataDia.style.display = 'inline-block';
            dataFim.style.display = 'inline-block';
            dataSep.style.display = 'inline';
            if (!dataDia.value) dataDia.value = new Date().toISOString().split('T')[0];
            if (!dataFim.value) {
                var d = new Date(); d.setDate(d.getDate() + 7);
                dataFim.value = d.toISOString().split('T')[0];
            }
        } else {
            dateInputs.style.display = 'none';
        }
    }

    // Relatório Mensal date inputs
    var dateInputsRm = document.getElementById('periodo-date-inputs-rm');
    if (dateInputsRm) {
        var dataDiaRm = document.getElementById('rm-data-dia');
        var dataFimRm = document.getElementById('rm-data-fim');
        var dataSepRm = document.getElementById('rm-data-sep');
        if (p === 'dia') {
            dateInputsRm.style.display = 'flex';
            dataDiaRm.style.display = 'inline-block';
            dataFimRm.style.display = 'none';
            dataSepRm.style.display = 'none';
            if (!dataDiaRm.value) dataDiaRm.value = new Date().toISOString().split('T')[0];
        } else if (p === 'intervalo') {
            dateInputsRm.style.display = 'flex';
            dataDiaRm.style.display = 'inline-block';
            dataFimRm.style.display = 'inline-block';
            dataSepRm.style.display = 'inline';
            if (!dataDiaRm.value) dataDiaRm.value = new Date().toISOString().split('T')[0];
            if (!dataFimRm.value) {
                var d2 = new Date(); d2.setDate(d2.getDate() + 7);
                dataFimRm.value = d2.toISOString().split('T')[0];
            }
        } else {
            dateInputsRm.style.display = 'none';
        }
    }
    
    // Refresh the right section
    var relmensal = document.getElementById('sec-relmensal');
    if (relmensal && relmensal.classList.contains('active')) {
        renderRelMensal();
    } else {
        renderRelatorios();
    }
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
            fetchAllRows('saldo_caixa', '*', 'data', false)
        ]);
        pRes = results[0]; mRes = results[1]; dRes = results[2]; docRes = results[3];
        var sRes = results[4];
        if (sRes.data) saldoMovimentos = sRes.data;
    } catch (e) {
        console.error('fetchData error:', e);
        return;
    }

    if (pRes.error) console.error('Produtos erro:', pRes.error);
    if (mRes.error) console.error('Movimentos erro:', mRes.error);
    if (dRes.error) console.error('Despesas erro:', dRes.error);
    if (docRes.error) console.error('Documentos erro:', docRes.error);


    if (pRes.data && pRes.data.length > 0) {
        produtos = pRes.data.map(function (p) {
            return { id: p.id, nome: p.nome, cat: p.categoria, qtd: p.quantidade, min: p.stock_minimo, custo: p.preco_custo, venda: p.preco_venda, forn: p.fornecedor, validade: p.validade, lote: p.lote };
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
                vendedor: m.vendedor || '',
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

    if (newQtd > oldQtd) {
        if (!(await showConfirm('Deseja aumentar o stock de "' + p.nome + '" em ' + diff + ' unidades? Será gerada uma Entrada.'))) { renderStock(); return; }
        p.qtd = newQtd;
        checkLowStock(p);
        var novoMov = {
            tipo: 'entrada',
            produto_id: id,
            quantidade: diff,
            preco_unitario: p.custo,
            total: diff * p.custo,
            nota: '[Ajuste Manual]',
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
    } else {
        // Reverter o input para o valor antigo enquanto o modal está aberto
        renderStock();
        openDiminuirStockModal(id, diff, newQtd);
    }
}

var pendingDiminuir = null;

function openDiminuirStockModal(id, diff, newQtd) {
    var p = produtos.find(function (x) { return x.id === id; });
    if (!p) return;
    pendingDiminuir = { id: id, diff: diff, newQtd: newQtd };
    document.getElementById('stock-modal-title').textContent = 'Diminuir Stock';
    document.getElementById('stock-modal-produto').textContent = p.nome + ' — Diminuir ' + diff + ' unidades (Stock actual: ' + p.qtd + ')';
    var tipoSel = document.getElementById('stock-modal-tipo');
    tipoSel.innerHTML =
        '<option value="saida">Saída (venda)</option>' +
        '<option value="quebra">Quebra</option>' +
        '<option value="quarentena">Quarentena</option>';
    document.getElementById('stock-modal-tipo-group').style.display = 'block';
    document.getElementById('stock-modal').classList.add('open');
}

async function confirmStockModal() {
    if (!pendingDiminuir) { closeStockModal(); return; }
    var p = produtos.find(function (x) { return x.id === pendingDiminuir.id; });
    if (!p) { closeStockModal(); return; }

    var tipo = document.getElementById('stock-modal-tipo').value;
    var diff = pendingDiminuir.diff;
    var notas = '';

    if (tipo === 'quarentena') {
        tipo = 'quebra';
        notas = '[Quarentena]';
    }

    if (p.qtd < diff) {
        showNotification('Stock insuficiente! Tem apenas ' + p.qtd + ' unidades.', 'error');
        closeStockModal();
        return;
    }

    p.qtd = pendingDiminuir.newQtd;
    checkLowStock(p);

    var novoMov = {
        tipo: tipo,
        produto_id: pendingDiminuir.id,
        quantidade: diff,
        preco_unitario: p.venda,
        total: diff * p.venda,
        nota: notas || '[Ajuste Manual]',
        metodo_pagamento: 'CASH'
    };

    if (sb) {
        await Promise.all([
            sb.from(PREFIX + 'produtos').update({ quantidade: p.qtd }).eq('id', pendingDiminuir.id),
            sb.from(PREFIX + 'movimentos').insert([novoMov])
        ]);
        await fetchData();
    }

    pendingDiminuir = null;
    closeStockModal();
    showNotification('Stock actualizado com sucesso!', 'success');
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
        fornecedor: document.getElementById('p-fornecedor').value,
        validade: document.getElementById('p-validade').value || null,
        lote: document.getElementById('p-lote').value.trim()
    };
    if (!sb) { showNotification('Sem ligação à BD'); return; }
    var res = await sb.from(PREFIX + 'produtos').insert([novoProd]).select();
    if (!res.error && res.data && res.data.length > 0) {
        var p = res.data[0];
        showNotification('Produto "' + p.nome + '" adicionado!', 'success');
        produtos.push({ id: p.id, nome: p.nome, cat: p.categoria, qtd: p.quantidade, min: p.stock_minimo, custo: p.preco_custo, venda: p.preco_venda, forn: p.fornecedor, validade: p.validade, lote: p.lote });
        ['p-nome', 'p-qtd', 'p-min', 'p-custo', 'p-venda', 'p-fornecedor', 'p-validade', 'p-lote'].forEach(function (x) { document.getElementById(x).value = ''; });
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

async function updateLote(id, val) {
    var p = produtos.find(function (x) { return x.id === id; });
    if (p) {
        p.lote = val;
        if (sb) await sb.from(PREFIX + 'produtos').update({ lote: val }).eq('id', id);
    }
}

async function updateValidade(id, val) {
    var p = produtos.find(function (x) { return x.id === id; });
    if (p) {
        p.validade = val || null;
        if (sb) await sb.from(PREFIX + 'produtos').update({ validade: val || null }).eq('id', id);
    }
}

// ====================== STOCK TABS ======================
function showStockTab(tab) {
    document.querySelectorAll('.stock-tab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.stock-tab-content').forEach(function (c) { c.classList.remove('active'); });
    var btn = document.querySelector('.stock-tab[data-tab="' + tab + '"]');
    if (btn) btn.classList.add('active');
    var content = document.getElementById('stock-tab-' + tab);
    if (content) content.classList.add('active');

    if (tab === 'add') {
        // Populate gestao select when switching to gestao tab
    }
    if (tab === 'gestao' || tab === 'all' || tab === 'quarentena') {
        populateGestaoSelect();
    }
    if (tab === 'gestao') {
        renderMovimentosDoDia();
    }
    if (tab === 'all') {
        renderStock();
    }
    if (tab === 'quarentena') {
        renderStock();
    }
}

function populateGestaoSelect() {
    var sel = document.getElementById('gestao-produto');
    if (!sel) return;
    sel.innerHTML = '<option value="">Seleccione um produto...</option>' +
        produtos.map(function (p) {
            return '<option value="' + p.id + '">' + escapeHTML(p.nome) + ' (Stock: ' + p.qtd + ')</option>';
        }).join('');
}

function populateGestaoData() {
    var dataInput = document.getElementById('gestao-data');
    if (dataInput && !dataInput.value) {
        dataInput.value = new Date().toISOString().split('T')[0];
    }
}

function renderMovimentosDoDia() {
    var hoje = new Date();
    var hojeStr = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
    var tipoFiltro = document.getElementById('mov-dia-tipo').value;
    var tipoLabel = { entrada: 'Entrada', saida: 'Venda', quebra: 'Quebra' };

    var movs = movimentos.filter(function (m) {
        if (m.data !== hojeStr) return false;
        if (tipoFiltro && m.tipo !== tipoFiltro) return false;
        return true;
    });

    movs.sort(function (a, b) {
        return (b.id || 0) - (a.id || 0);
    });

    var container = document.getElementById('mov-dia-table');
    if (!container) return;

    if (movs.length === 0) {
        container.innerHTML = '<div class="empty">Nenhum movimento registado hoje</div>';
        return;
    }

    var totalEntradas = 0, totalSaidas = 0;
    movs.forEach(function (m) {
        if (m.tipo === 'entrada') totalEntradas += m.total;
        else totalSaidas += m.total;
    });

    container.innerHTML =
        '<table><thead><tr><th>Hora</th><th>Tipo</th><th>Produto</th><th>Qtd</th><th>Valor</th><th>Vendedor</th></tr></thead><tbody>' +
        movs.map(function (m) {
            var isQuar = (m.tipo === 'quebra' && m.nota && m.nota.indexOf('[Quarentena]') !== -1);
            var label = isQuar ? 'Quarentena' : (tipoLabel[m.tipo] || m.tipo);
            var cor = m.tipo === 'entrada' ? 'badge-ok' : m.tipo === 'saida' ? 'badge' : 'badge-low';
            var vendedorLabel = m.vendedor ? getVendedorDisplayName(m.vendedor) : 'Administrador';
            return '<tr>' +
                '<td style="color:var(--color-text-secondary);font-size:12px;">' + escapeHTML(m.dataHora || m.data || '') + '</td>' +
                '<td><span class="badge ' + cor + '">' + escapeHTML(label) + '</span></td>' +
                '<td>' + escapeHTML(m.nome_v || '—') + '</td>' +
                '<td>' + m.qtd + '</td>' +
                '<td>' + m.total.toLocaleString() + ' MZN</td>' +
                '<td style="font-size:12px;">' + escapeHTML(vendedorLabel) + '</td></tr>';
        }).join('') +
        '</tbody></table>' +
        '<div class="mov-dia-summary">' +
        '<span class="mov-dia-summary-item"><strong>Entradas:</strong> ' + totalEntradas.toLocaleString() + ' MZN</span>' +
        '<span class="mov-dia-summary-item"><strong>Saídas:</strong> ' + totalSaidas.toLocaleString() + ' MZN</span>' +
        '<span class="mov-dia-summary-item"><strong>Fluxo:</strong> ' + (totalSaidas - totalEntradas).toLocaleString() + ' MZN</span>' +
        '</div>';
}

async function gestaoMovimento() {
    var prodId = parseInt(document.getElementById('gestao-produto').value);
    if (!prodId) { showNotification('Seleccione um produto!'); return; }
    var tipo = document.getElementById('gestao-tipo').value;
    var qtd = parseInt(document.getElementById('gestao-qtd').value);
    if (!qtd || qtd < 1) { showNotification('Insira uma quantidade válida!'); return; }
    var data = document.getElementById('gestao-data').value;
    var notas = document.getElementById('gestao-notas').value.trim();

    var p = produtos.find(function (x) { return x.id === prodId; });
    if (!p) { showNotification('Produto não encontrado!'); return; }

    if (tipo === 'saida' && p.qtd < qtd) {
        if (!(await showConfirm('Stock insuficiente! Tem apenas ' + p.qtd + ' unidades. Deseja continuar mesmo assim?'))) return;
    }
    if ((tipo === 'quebra' || tipo === 'quarentena') && p.qtd < qtd) {
        showNotification('Stock insuficiente! Tem apenas ' + p.qtd + ' unidades.', 'error');
        return;
    }

    if (tipo === 'quarentena') {
        tipo = 'quebra';
        notas = (notas ? notas + ' | ' : '') + '[Quarentena]';
    }

    var diff = qtd;
    var novoMov = {
        tipo: tipo,
        produto_id: prodId,
        quantidade: diff,
        preco_unitario: tipo === 'entrada' ? p.custo : p.venda,
        total: diff * (tipo === 'entrada' ? p.custo : p.venda),
        nota: notas || (tipo === 'entrada' ? '[Gestão manual]' : '[Gestão manual]'),
        metodo_pagamento: 'CASH',
        data: data || undefined
    };

    if (tipo === 'entrada') p.qtd += diff;
    else p.qtd -= diff;
    if (p.qtd < 0) p.qtd = 0;
    checkLowStock(p);

    if (sb) {
        await Promise.all([
            sb.from(PREFIX + 'produtos').update({ quantidade: p.qtd }).eq('id', prodId),
            sb.from(PREFIX + 'movimentos').insert([novoMov])
        ]);
        await fetchData();
    }

    document.getElementById('gestao-qtd').value = '';
    document.getElementById('gestao-notas').value = '';
    showNotification('Movimento registado com sucesso!', 'success');
    renderStock();
    renderMovimentos();
    renderMovimentosDoDia();
    renderRelatorios();
}

function closeStockModal() {
    document.getElementById('stock-modal').classList.remove('open');
    pendingDiminuir = null;
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
            showNotification('ATENÇÃO: O stock deste produto ficará BAIXO após esta venda!', 'info');
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
        '<table><thead><tr><th><input type="checkbox" onclick="toggleSelectAllMovs(this)"></th><th>Data/Hora</th><th>Tipo</th><th>Produto</th><th>Qtd</th><th>Preço unit.</th><th>Total</th><th>Pagamento</th><th>Vendedor</th><th>Notas</th><th>Acções</th></tr></thead><tbody>' +
        movsToShow.map(function (m) {
            var isQuar = (m.tipo === 'quebra' && m.nota && m.nota.indexOf('[Quarentena]') !== -1);
            var cor = m.tipo === 'entrada' ? 'badge-ok' : m.tipo === 'saida' ? 'badge' : (isQuar ? 'badge' : 'badge-low');
            var style = m.tipo === 'saida' ? ' style="background:#E6F1FB;color:#185FA5;"' : (isQuar ? ' style="background:#F3F4F6;color:#4B5563;"' : '');
            var label = isQuar ? 'Quarentena' : tipoLabel[m.tipo];
            var vendedorLabel = m.vendedor ? getVendedorDisplayName(m.vendedor) : '—';
        
        return '<tr><td><input type="checkbox" class="mov-checkbox" data-id="' + m.id + '"></td>' +
            '<td style="color:var(--color-text-secondary);font-size:12px;">' + escapeHTML(m.dataHora || m.data) + '</td>' +
            '<td><span class="badge ' + cor + '"' + style + '>' + escapeHTML(label) + '</span></td>' +
                '<td>' + escapeHTML(m.nome_v || '—') + '</td><td>' + m.qtd + '</td><td>' + m.preco + ' MZN</td>' +
                '<td style="font-weight:500;">' + m.total.toLocaleString() + ' MZN</td>' +
                '<td><span class="badge">' + escapeHTML(m.metodo || '—') + '</span></td>' +
                '<td style="font-size:12px;">' + escapeHTML(vendedorLabel) + '</td>' +
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

    var hoje = new Date();
    var expirar30 = produtos.filter(function (p) {
        if (!p.validade) return false;
        var d = new Date(p.validade);
        var diff = Math.ceil((d - hoje) / (1000 * 60 * 60 * 24));
        return diff >= 0 && diff <= 30;
    });
    var expirados = produtos.filter(function (p) {
        if (!p.validade) return false;
        var d = new Date(p.validade);
        return d < hoje;
    });

    var html = '<div class="metrics" style="margin-bottom:1rem;">' +
        '<div class="metric-card"><div class="metric-label">A Expirar (30d)</div><div class="metric-value" style="color:#B8860B;">' + expirar30.length + '</div></div>' +
        '<div class="metric-card"><div class="metric-label">Expirados</div><div class="metric-value" style="color:#A32D2D;">' + expirados.length + '</div></div>' +
        '</div>';

    if (rep.length > 0) {
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
        html +=
            '<div style="margin-bottom:1rem;font-size:14px;background:#F9F9F9;padding:10px;border-radius:8px;">' +
            'Necessidades estimadas em <b>' + totalCompras.toLocaleString() + ' MZN</b> para recuperar stock mínimo. ' +
            'Lucro esperado (venda total): <b style="color:#3B6D11;">' + lucroExp.toLocaleString() + ' MZN</b></div>' +
            '<div class="table-responsive"><table><thead><tr><th>Produto</th><th>Stock Atual</th><th>Mínimo</th><th>A Comprar</th><th>Custo Unit.</th><th>Investimento</th><th>Lucro Esperado</th></tr></thead>' +
            '<tbody>' + linhas.join('') + '</tbody></table></div>';
    } else {
        html += '<div class="empty">Stock robusto. Não há necessidade de reforço por enquanto!</div>';
    }

    var aExpirar = expirados.concat(expirar30);
    aExpirar.sort(function (a, b) { return new Date(a.validade) - new Date(b.validade); });
    html += '<div style="margin-top:1.5rem;"><div class="card-title">Produtos a Expirar</div>' +
        '<div class="table-responsive"><table><thead><tr><th>Produto</th><th>Validade</th><th>Stock</th><th>Estado</th></tr></thead><tbody>' +
        (aExpirar.length ? aExpirar.map(function (p) {
            var d = new Date(p.validade);
            var expirado = d < hoje;
            var cor = expirado ? 'color:#A32D2D;' : 'color:#B8860B;';
            var label = expirado ? 'Expirado' : 'A expirar';
            return '<tr><td>' + escapeHTML(p.nome) + '</td><td style="' + cor + 'font-weight:500;">' + escapeHTML(p.validade) + '</td><td>' + p.qtd + '</td><td><span class="badge ' + (expirado ? 'badge-out' : 'badge-low') + '">' + label + '</span></td></tr>';
        }).join('') : '<tr><td colspan="4" class="empty">Nenhum produto próximo da validade</td></tr>') +
        '</tbody></table></div></div>';

    cont.innerHTML = html;
}

// ====================== ALERTAS ======================
function renderAlertas() {
    var baixo = produtos.filter(function (p) { return p.qtd <= p.min && p.qtd > 0; });
    var esgotados = produtos.filter(function (p) { return p.qtd === 0; });
    var todos = esgotados.concat(baixo);

    var hoje = new Date();
    var expirar30 = produtos.filter(function (p) {
        if (!p.validade) return false;
        var d = new Date(p.validade);
        var diff = Math.ceil((d - hoje) / (1000 * 60 * 60 * 24));
        return diff >= 0 && diff <= 30;
    });
    var expirados = produtos.filter(function (p) {
        if (!p.validade) return false;
        var d = new Date(p.validade);
        return d < hoje;
    });

    var metricsEl = document.getElementById('alertas-metrics');
    if (metricsEl) {
        metricsEl.innerHTML = `
            <div class="metric-card"><div class="metric-label">Esgotados</div><div class="metric-value" style="color:#A32D2D;">${esgotados.length}</div></div>
            <div class="metric-card"><div class="metric-label">Stock Baixo</div><div class="metric-value" style="color:#854F0B;">${baixo.length}</div></div>
            <div class="metric-card"><div class="metric-label">A Expirar (30d)</div><div class="metric-value" style="color:#B8860B;">${expirar30.length}</div></div>
            <div class="metric-card"><div class="metric-label">Expirados</div><div class="metric-value" style="color:#A32D2D;">${expirados.length}</div></div>
        `;
    }

    var quebras = movimentos.filter(function (m) { return m.tipo === 'quebra'; });
    var quebrasEl = document.getElementById('quebras-list');
    if (quebrasEl) {
        quebrasEl.innerHTML = quebras.length ?
            '<table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Custo estimado</th><th>Notas</th></tr></thead><tbody>' +
            quebras.map(function (m) {
                return '<tr><td style="font-size:12px;color:var(--color-text-secondary);">' + escapeHTML(m.data) + '</td><td>' + escapeHTML(m.nome_v || '—') + '</td><td>' + m.qtd + '</td><td style="color:#A32D2D;">' + m.total.toLocaleString() + ' MZN</td><td style="font-size:12px;color:var(--color-text-secondary);">' + escapeHTML(m.nota || '—') + '</td></tr>';
            }).join('') + '</tbody></table>' : '<div class="empty">Nenhuma quebra registada</div>';
    }

    var expirarEl = document.getElementById('expirar-list');
    if (expirarEl) {
        var aExpirar = expirados.concat(expirar30);
        aExpirar.sort(function (a, b) { return new Date(a.validade) - new Date(b.validade); });
        var hojeStr = hoje.toISOString().split('T')[0];
        expirarEl.innerHTML = aExpirar.length ?
            '<table><thead><tr><th>Produto</th><th>Validade</th><th>Stock</th><th>Estado</th></tr></thead><tbody>' +
            aExpirar.map(function (p) {
                var d = new Date(p.validade);
                var expirado = d < hoje;
                var cor = expirado ? 'color:#A32D2D;' : 'color:#B8860B;';
                var label = expirado ? 'Expirado' : 'A expirar';
                var diasRest = Math.ceil((d - hoje) / (1000 * 60 * 60 * 24));
                return '<tr><td>' + escapeHTML(p.nome) + '</td><td style="' + cor + 'font-weight:500;">' + escapeHTML(p.validade) + ' ' + (expirado ? '(vencido)' : '(' + diasRest + ' dias)') + '</td><td>' + p.qtd + '</td><td><span class="badge ' + (expirado ? 'badge-out' : 'badge-low') + '">' + label + '</span></td></tr>';
            }).join('') + '</tbody></table>' : '<div class="empty">Nenhum produto próximo da validade</div>';
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
    } else if (periodoActivo === 'dia') {
        labels = []; vendasData = []; lucroData = []; unidData = []; quebrasData = [];
        var dataDia = document.getElementById('periodo-data-dia');
        var key = dataDia ? dataDia.value : new Date().toISOString().split('T')[0];
        labels.push(key);
        const mSales = movimentos.filter(m => m.tipo === 'saida' && m.data === key);
        const rec = mSales.reduce((a, m) => a + m.total, 0);
        const custoVendas = mSales.reduce((a, m) => a + (m.fifo_cost || 0), 0);
        const unid = mSales.reduce((a, m) => a + m.qtd, 0);
        const mQuebras = movimentos.filter(m => m.tipo === 'quebra' && m.nota !== '[Quarentena]' && m.data === key);
        const loss = mQuebras.reduce((a, m) => a + (m.fifo_cost || 0), 0);
        const despDia = despesas.filter(d => d.data === key).reduce((a, d) => a + d.valor, 0);
        const luc = rec - custoVendas - loss - despDia;
        vendasData.push(rec); lucroData.push(luc); unidData.push(unid); quebrasData.push(loss);
    } else if (periodoActivo === 'intervalo') {
        labels = []; vendasData = []; lucroData = []; unidData = []; quebrasData = [];
        var dataIni = document.getElementById('periodo-data-dia');
        var dataFim = document.getElementById('periodo-data-fim');
        var ini = dataIni ? dataIni.value : new Date().toISOString().split('T')[0];
        var fim = dataFim ? dataFim.value : new Date().toISOString().split('T')[0];
        labels.push(ini + ' a ' + fim);
        const mSales = movimentos.filter(m => {
            return m.tipo === 'saida' && m.data >= ini && m.data <= fim;
        });
        const rec = mSales.reduce((a, m) => a + m.total, 0);
        const custoVendas = mSales.reduce((a, m) => a + (m.fifo_cost || 0), 0);
        const unid = mSales.reduce((a, m) => a + m.qtd, 0);
        const mQuebras = movimentos.filter(m => {
            return m.tipo === 'quebra' && m.nota !== '[Quarentena]' && m.data >= ini && m.data <= fim;
        });
        const loss = mQuebras.reduce((a, m) => a + (m.fifo_cost || 0), 0);
        const despInt = despesas.filter(d => d.data >= ini && d.data <= fim).reduce((a, d) => a + d.valor, 0);
        const luc = rec - custoVendas - loss - despInt;
        vendasData.push(rec); lucroData.push(luc); unidData.push(unid); quebrasData.push(loss);
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
            } else if (periodoActivo === 'dia') {
                var dd = document.getElementById('periodo-data-dia');
                match = m.data === (dd ? dd.value : new Date().toISOString().split('T')[0]);
            } else if (periodoActivo === 'intervalo') {
                var di = document.getElementById('periodo-data-dia');
                var df = document.getElementById('periodo-data-fim');
                var ini = di ? di.value : '';
                var fim = df ? df.value : '';
                match = ini && fim && m.data >= ini && m.data <= fim;
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
    var titleEl = document.getElementById('rm-title');
    var mesEl = document.getElementById('rm-mes');
    var dataDia = document.getElementById('rm-data-dia');
    var dataFim = document.getElementById('rm-data-fim');

    var movMes, despMes;

    if (periodoActivo === 'dia') {
        var key = dataDia ? dataDia.value : new Date().toISOString().split('T')[0];
        if (!dataDia.value) dataDia.value = key;
        movMes = movimentos.filter(function (m) { return m.data === key; });
        despMes = despesas.filter(function (d) { return d.data === key; });
        if (titleEl) titleEl.textContent = 'Relatório — Dia ' + key;
        mesEl.style.display = 'none';
    } else if (periodoActivo === 'intervalo') {
        var ini = dataDia ? dataDia.value : new Date().toISOString().split('T')[0];
        var fim = dataFim ? dataFim.value : '';
        if (!dataDia.value) dataDia.value = ini;
        if (!fim) {
            var d = new Date(); d.setDate(d.getDate() + 7);
            fim = d.toISOString().split('T')[0];
            dataFim.value = fim;
        }
        movMes = movimentos.filter(function (m) { return m.data >= ini && m.data <= fim; });
        despMes = despesas.filter(function (d) { return d.data >= ini && d.data <= fim; });
        if (titleEl) titleEl.textContent = 'Relatório — ' + ini + ' a ' + fim;
        mesEl.style.display = 'none';
    } else {
        if (!mesEl.value) {
            var now = new Date();
            mesEl.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        }
        var mesSel = mesEl.value;
        movMes = movimentos.filter(function (m) { return m.data.substring(0, 7) === mesSel; });
        despMes = despesas.filter(function (d) { return d.data.substring(0, 7) === mesSel; });
        if (titleEl) titleEl.textContent = 'Relatório — ' + mesSel;
        mesEl.style.display = 'inline-block';
    }

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
        '<table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Preço</th><th>Total</th><th>Pagamento</th><th>Acções</th></tr></thead><tbody>' +
        vendas.map(function (m) {
            return '<tr><td style="font-size:12px;">' + escapeHTML(m.data) + '</td><td>' + escapeHTML(m.nome_v || '—') + '</td><td>' + m.qtd + '</td><td>' + m.preco + '</td><td style="font-weight:500;">' + m.total.toLocaleString() + ' MZN</td><td><span class="badge">' + escapeHTML(m.metodo || '—') + '</span></td><td><button class="btn btn-danger" style="padding:2px 6px;font-size:10px;" onclick="deleteMovimento(' + m.id + ')">Remover</button></td></tr>';
        }).join('') +
        '<tr style="font-weight:bold;background:var(--color-background-secondary);"><td colspan="4">TOTAL VENDAS</td><td>' + totalVendas.toLocaleString() + ' MZN</td><td colspan="2"></td></tr>' +
        '</tbody></table>' : '<div class="empty">Nenhuma venda neste mês</div>';

    // Tabela Compras
    document.getElementById('rm-compras').innerHTML = compras.length ?
        '<table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Preço</th><th>Total</th><th>Pagamento</th><th>Acções</th></tr></thead><tbody>' +
        compras.map(function (m) {
            return '<tr><td style="font-size:12px;">' + escapeHTML(m.data) + '</td><td>' + escapeHTML(m.nome_v || '—') + '</td><td>' + m.qtd + '</td><td>' + m.preco + '</td><td style="font-weight:500;">' + m.total.toLocaleString() + ' MZN</td><td><span class="badge">' + escapeHTML(m.metodo || '—') + '</span></td><td><button class="btn btn-danger" style="padding:2px 6px;font-size:10px;" onclick="deleteMovimento(' + m.id + ')">Remover</button></td></tr>';
        }).join('') +
        '<tr style="font-weight:bold;background:var(--color-background-secondary);"><td colspan="4">TOTAL COMPRAS</td><td>' + totalCompras.toLocaleString() + ' MZN</td><td colspan="2"></td></tr>' +
        '</tbody></table>' : '<div class="empty">Nenhuma compra neste mês</div>';

    // Tabela Quebras
    var realQuebrasCost = quebras.reduce(function (a, m) { return a + (m.fifo_cost || 0); }, 0);
    document.getElementById('rm-quebras').innerHTML = quebras.length ?
        '<table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Custo (FIFO)</th><th>Notas</th><th>Acções</th></tr></thead><tbody>' +
        quebras.map(function (m) {
            return '<tr><td style="font-size:12px;">' + escapeHTML(m.data) + '</td><td>' + escapeHTML(m.nome_v || '—') + '</td><td>' + m.qtd + '</td><td style="color:#A32D2D;">' + (m.fifo_cost || 0).toLocaleString() + ' MZN</td><td style="font-size:12px;">' + escapeHTML(m.nota || '—') + '</td><td><button class="btn btn-danger" style="padding:2px 6px;font-size:10px;" onclick="deleteMovimento(' + m.id + ')">Remover</button></td></tr>';
        }).join('') +
        '<tr style="font-weight:bold;background:var(--color-background-secondary);"><td colspan="3">CUSTO TOTAL QUEBRAS</td><td>' + realQuebrasCost.toLocaleString() + ' MZN</td><td colspan="2"></td></tr>' +
        '</tbody></table>' : '<div class="empty">Nenhuma quebra neste mês</div>';

    // Tabela Despesas
    document.getElementById('rm-despesas').innerHTML = despMes.length ?
        '<table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Pagamento</th><th>Acções</th></tr></thead><tbody>' +
        despMes.map(function (d) {
            return '<tr><td style="font-size:12px;">' + escapeHTML(d.data) + '</td><td><span class="badge badge-low">' + escapeHTML(d.categoria) + '</span></td><td>' + escapeHTML(d.descricao) + '</td><td style="font-weight:500;color:#A32D2D;">' + d.valor.toLocaleString() + ' MZN</td><td><span class="badge">' + escapeHTML(d.metodo) + '</span></td><td><button class="btn btn-danger" style="padding:2px 6px;font-size:10px;" onclick="deleteDespesa(' + d.id + ')">Remover</button></td></tr>';
        }).join('') +
        '<tr style="font-weight:bold;background:var(--color-background-secondary);"><td colspan="3">TOTAL DESPESAS</td><td>' + totalDespesas.toLocaleString() + ' MZN</td><td colspan="2"></td></tr>' +
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
            <h2>${pharmacy.nome}</h2>
            <div style="font-size:12px; color:#555;">${pharmacy.endereco} | NUIT: ${pharmacy.nuit}</div>
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
        <div class="footer">Processado por Computador (${pharmacy.nome})</div>
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
            <h2>${pharmacy.nome}</h2>
            <div style="font-size:12px; color:#555;">${pharmacy.endereco} | NUIT: ${pharmacy.nuit}</div>
            <div class="subtitle">HISTÓRICO DE MOVIMENTOS</div>
            <div class="date">${today}</div>
        </div>
        <div>${movTable.innerHTML}</div>
        <div class="footer">Processado por Computador (${pharmacy.nome})</div>
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
                <h2 style="margin:0; font-size:24px;">${pharmacy.nome}</h2>
                <div style="font-size:12px; color:#555;">${pharmacy.endereco} | NUIT: ${pharmacy.nuit}</div>
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
                Processado por Computador (${pharmacy.nome})
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
        if (prod.qtd - q <= prod.min) showNotification('Stock BAIXO para este produto após venda.', 'info');
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
        '<h2 style="margin:0; font-size:24px;">' + pharmacy.nome + '</h2>' +
        '<div style="font-size:12px; color:#555;">' + pharmacy.endereco + ' | NUIT: ' + pharmacy.nuit + '</div>' +
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
        '<div style="text-align:center; font-size:11px; margin-top:30px; color:#999; border-top:1px dashed #ccc; padding-top:10px;">Agradecemos a sua preferência. Volte sempre.<br> Processado por Computador (' + pharmacy.nome + ')</div></div>';
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
            <h2>${pharmacy.nome}</h2>
            <div style="font-size:12px; color:#555;">${pharmacy.endereco} | NUIT: ${pharmacy.nuit}</div>
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
        <div class="footer">Agradecemos a sua preferência. Volte sempre.<br> Processado por Computador (${pharmacy.nome})</div>
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

async function fetchProfile(userId) {
    try {
        const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();
        if (error) return null;
        return data;
    } catch {
        return null;
    }
}

function getVendedorDisplayName(user) {
    if (user === 'vendas1@farmacia.picoco') return 'Vendedor 1';
    if (user === 'vendas2@farmacia.picoco') return 'Vendedor 2';
    return user || 'Vendedor';
}

function applyAuthSession(user, profile) {
    currentUserEmail = user.email;
    if (profile) {
        userRole = profile.role;
    } else {
        userRole = user.user_metadata?.role || 'vendedor';
    }
    document.getElementById('login-screen').style.display = 'none';
    document.querySelector('.app').style.display = 'flex';
    document.getElementById('user-label').textContent = userRole === 'gestor' ? 'Administrador' : getVendedorDisplayName(currentUserEmail);
    applyRoleRestrictions();
    initApp();
}

async function checkSession() {
    if (!sb) {
        var role = localStorage.getItem('local_session_role');
        var user = localStorage.getItem('local_session_user');
        if (role && user) {
            userRole = role;
            currentUserEmail = user;
            document.getElementById('login-screen').style.display = 'none';
            document.querySelector('.app').style.display = 'flex';
            document.getElementById('user-label').textContent = userRole === 'gestor' ? 'Administrador' : getVendedorDisplayName(currentUserEmail);
            applyRoleRestrictions();
            initApp();
        }
        return;
    }

    var sessionRes = await sb.auth.getSession();
    var session = sessionRes.data.session;

    if (session) {
        var profile = await fetchProfile(session.user.id);
        applyAuthSession(session.user, profile);
    }

    sb.auth.onAuthStateChange(function (event, session) {
        if (event === 'SIGNED_OUT') {
            window.location.reload();
        }
    });
}

async function loginUser() {
    const email = document.getElementById('l-email').value.trim();
    const pass = document.getElementById('l-pass').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = 'A entrar...';

    if (!sb) {
        errorEl.textContent = 'Erro de ligação à base de dados.';
        return;
    }

    try {
        var authRes = await sb.auth.signInWithPassword({ email: email, password: pass });

        if (authRes.error) {
            errorEl.textContent = 'Email ou palavra-passe inválidos!';
            return;
        }

        var user = authRes.data.user;
        var profile = await fetchProfile(user.id);

        if (profile) {
            userRole = profile.role;
        } else {
            userRole = user.user_metadata?.role || 'vendedor';
        }

        showNotification('Login efetuado com sucesso!', 'success');
        setTimeout(function () { window.location.reload(); }, 1000);
    } catch (e) {
        errorEl.textContent = 'Erro ao autenticar: ' + e.message;
    }
}

async function logoutUser() {
    if (sb) {
        await sb.auth.signOut();
    }
    localStorage.removeItem('local_session_role');
    localStorage.removeItem('local_session_user');
    window.location.reload();
}

function renderVendedor() {
    populateVProdList();
    showSection('vnova-venda');
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

function populateVProdList() {
    var list = document.getElementById('v-prod-list');
    if (list) list.innerHTML = produtos.map(function (p) { return '<option value="' + escapeHTML(p.nome) + '">'; }).join('');
}

function onVProdSearch() {
    var val = document.getElementById('v-prod-search').value;
    var p = produtos.find(function (x) { return x.nome === val; });
    var infoEl = document.getElementById('v-prod-info');
    if (p) {
        document.getElementById('v-prod-id').value = p.id;
        document.getElementById('v-preco').value = p.venda || 0;
        vUpdateTotal();
        infoEl.innerHTML = '<span class="v-info-stock ' + (p.qtd <= p.min ? 'v-info-low' : '') + '">Stock: ' + p.qtd + '</span>' +
            '<span class="v-info-price">Preço venda: ' + (p.venda || 0).toFixed(2) + ' MT</span>';
        infoEl.style.display = 'flex';
    } else {
        document.getElementById('v-prod-id').value = '';
        document.getElementById('v-preco').value = '';
        document.getElementById('v-total').textContent = '0,00 MT';
        infoEl.innerHTML = '';
        infoEl.style.display = 'none';
    }
}

function onVProdChange() {
    onVProdSearch();
}

function vQtdChange(delta) {
    var el = document.getElementById('v-qtd');
    var val = parseInt(el.value) || 1;
    val = Math.max(1, val + delta);
    el.value = val;
    vUpdateTotal();
}

function vUpdateTotal() {
    var qtd = parseInt(document.getElementById('v-qtd').value) || 0;
    var preco = parseFloat(document.getElementById('v-preco').value) || 0;
    document.getElementById('v-total').textContent = (qtd * preco).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' MT';
}

function vSelectMetodo(el) {
    document.querySelectorAll('.v-metodo-btn').forEach(function (b) { b.classList.remove('active'); });
    el.classList.add('active');
    el.querySelector('input[type="radio"]').checked = true;
}

function renderVendasDoDia() {
    var hoje = new Date();
    var hojeStr = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
    var vendas = movimentos.filter(function (m) {
        return m.tipo === 'saida' && m.data === hojeStr && m.vendedor === currentUserEmail;
    });
    var el = document.getElementById('v-vendas-table');
    if (!el) return;
    if (vendas.length === 0) {
        el.innerHTML = '<div class="empty">Nenhuma venda hoje.</div>';
        return;
    }
    var totalDia = vendas.reduce(function (a, m) { return a + m.total; }, 0);
    el.innerHTML = '<table><thead><tr><th>Hora</th><th>Produto</th><th>Qtd</th><th>Total</th><th>Pagamento</th><th></th></tr></thead><tbody>' +
        vendas.map(function (m) {
            return '<tr><td style="font-size:11px;color:var(--color-text-secondary);">' + escapeHTML(m.dataHora || m.data || '') + '</td>' +
                '<td>' + escapeHTML(m.nome_v || '—') + '</td>' +
                '<td>' + m.qtd + '</td>' +
                '<td style="font-weight:500;">' + m.total.toLocaleString() + ' MT</td>' +
                '<td><span class="badge">' + escapeHTML(m.metodo || '—') + '</span></td>' +
                '<td><button class="v-recibo-btn" onclick="vPrintDocFromMov(' + m.id + ')" title="Reimprimir recibo">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>' +
            '<rect x="6" y="14" width="12" height="8"/></svg></button></td></tr>';
        }).join('') +
        '<tr style="font-weight:bold;background:var(--color-background-secondary);"><td colspan="3">Total do Dia</td><td>' + totalDia.toLocaleString() + ' MT</td><td colspan="2"></td></tr>' +
        '</tbody></table>';
}

function vPrintDocFromMov(movId) {
    var m = movimentos.find(function (x) { return x.id === movId; });
    if (!m) { showNotification('Movimento não encontrado.'); return; }
    var doc = {
        tipo: 'factura',
        id: 'R' + m.id,
        data: m.data || new Date().toISOString().split('T')[0],
        cliente: 'Cliente Avulso',
        total: m.total,
        detalhes: {
            items: [{ nome: m.nome_v || '—', qtd: m.qtd, preco: m.preco || 0, total: m.total }],
            desconto: 0
        }
    };
    printDoc(doc);
}

function vPrintVendasDoDia() {
    var hoje = new Date();
    var hojeStr = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
    var vendas = movimentos.filter(function (m) { return m.tipo === 'saida' && m.data === hojeStr && m.vendedor === currentUserEmail; });
    if (vendas.length === 0) { showNotification('Nenhuma venda hoje para imprimir.'); return; }
    var totalDia = vendas.reduce(function (a, m) { return a + m.total; }, 0);
    var win = window.open('', '_blank');
    if (win) win.opener = null;
    var html = '<html><head><title>' + pharmacy.nome + ' - Vendas do Dia</title><style>' +
        'body { font-family: sans-serif; padding: 20px; font-size: 14px; }' +
        'table { width: 100%; border-collapse: collapse; margin-top: 15px; }' +
        'th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }' +
        'th { background: #f8f9fa; }' +
        'h1 { font-size: 20px; text-align: center; margin-bottom: 5px; }' +
        'p { text-align: center; color: #666; font-size: 13px; }' +
        '</style></head><body>' +
        '<h1>' + pharmacy.nome + '</h1>' +
        '<p>' + pharmacy.endereco + ' | NUIT: ' + pharmacy.nuit + '</p>' +
        '<p>Relatório de Vendas - ' + hojeStr.split('-').reverse().join('/') + '</p>' +
        '<table><thead><tr><th>Hora</th><th>Produto</th><th>Qtd</th><th>Total (MZN)</th><th>Pagamento</th></tr></thead><tbody>';
    vendas.forEach(function (m) {
        html += '<tr><td>' + escapeHTML(m.dataHora || m.data || '') + '</td>' +
            '<td>' + escapeHTML(m.nome_v || '—') + '</td>' +
            '<td>' + m.qtd + '</td>' +
            '<td>' + m.total.toLocaleString() + '</td>' +
            '<td>' + escapeHTML(m.metodo || '—') + '</td></tr>';
    });
    html += '</tbody></table>' +
        '<div style="margin-top:20px; text-align:right; border-top: 2px solid #333; padding-top: 10px;">' +
        '<strong>Total de Vendas: ' + totalDia.toLocaleString() + ' MZN</strong></div>' +
        '<div style="margin-top:40px; font-size:10px; text-align:center;">Processado por ' + pharmacy.nome + '</div>' +
        '</body></html>';
    win.document.write(html);
    win.document.close();
    win.print();
}

function vGerarRecibo(movId) {
    var m = movimentos.find(function (x) { return x.id === movId; });
    if (!m) { showNotification('Movimento não encontrado.'); return; }
    var printArea = document.getElementById('print-area');
    var hoje = new Date().toLocaleDateString('pt-MZ');
    var hora = m.dataHora || '';
    var metodoLabel = m.metodo || '—';
    var vendedorLabel = m.vendedor ? getVendedorDisplayName(m.vendedor) : '—';
    var subtotal = (m.preco || 0) * m.qtd;
    var clienteEl = document.getElementById('v-cliente');
    var clienteNome = clienteEl ? clienteEl.value.trim() : '';
    if (!clienteNome) clienteNome = 'Cliente';
    printArea.innerHTML =
        '<div style="font-family:sans-serif; color:#000; padding:30px; max-width:700px; margin:0 auto; background:#fff; border:1px solid #ddd;">' +
        '<div style="text-align:center; border-bottom:2px solid #333; padding-bottom:20px; margin-bottom:20px;">' +
        '<h1 style="margin:0; font-size:26px;">' + pharmacy.nome + '</h1>' +
        '<div style="font-size:12px; color:#555; margin-top:3px;">' + pharmacy.endereco + ' | NUIT: ' + pharmacy.nuit + '</div>' +
        '<div style="font-size:16px; font-weight:bold; margin-top:15px;">FACTURA N.º ' + movId + '</div>' +
        '<div style="font-size:12px; color:#555; margin-top:3px;">' + (hoje + ' ' + hora).trim() + '</div>' +
        '<div style="font-size:12px; color:#555;">Cliente: ' + escapeHTML(clienteNome) + '</div>' +
        '<div style="font-size:12px; color:#555;">Vendedor: ' + vendedorLabel + '</div></div>' +
        '<table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:20px;">' +
        '<thead>' +
        '<tr style="background:#f0f0f0;">' +
        '<th style="border:1px solid #ccc; padding:8px; text-align:center;">#</th>' +
        '<th style="border:1px solid #ccc; padding:8px; text-align:left;">Descrição</th>' +
        '<th style="border:1px solid #ccc; padding:8px; text-align:center;">Qtd</th>' +
        '<th style="border:1px solid #ccc; padding:8px; text-align:right;">Preço Unit.</th>' +
        '<th style="border:1px solid #ccc; padding:8px; text-align:right;">Total (MZN)</th>' +
        '</tr></thead><tbody>' +
        '<tr>' +
        '<td style="border:1px solid #ccc; padding:8px; text-align:center;">1</td>' +
        '<td style="border:1px solid #ccc; padding:8px;">' + escapeHTML(m.nome_v || '—') + '</td>' +
        '<td style="border:1px solid #ccc; padding:8px; text-align:center;">' + m.qtd + '</td>' +
        '<td style="border:1px solid #ccc; padding:8px; text-align:right;">' + (m.preco || 0).toLocaleString() + '</td>' +
        '<td style="border:1px solid #ccc; padding:8px; text-align:right; font-weight:bold;">' + subtotal.toLocaleString() + '</td>' +
        '</tr></tbody></table>' +
        '<div style="text-align:right; font-size:14px; border-top:2px solid #333; padding-top:10px;">' +
        '<div>Subtotal: ' + subtotal.toLocaleString() + ' MZN</div>' +
        '<div style="font-size:20px; font-weight:bold; margin-top:5px;">TOTAL: ' + m.total.toLocaleString() + ' MZN</div>' +
        '<div style="font-size:12px; color:#555; margin-top:5px;">Pagamento: ' + metodoLabel + '</div></div>' +
        '<div style="margin-top:40px; font-size:12px; color:#777; display:flex; justify-content:space-between;">' +
        '<div>_________________________<br>Entregue por</div>' +
        '<div>_________________________<br>Recebido por</div></div>' +
        '<div style="text-align:center; font-size:11px; margin-top:30px; color:#999; border-top:1px dashed #ccc; padding-top:10px;">Agradecemos a sua preferência. Volte sempre.<br>Processado por ' + pharmacy.nome + '</div></div>';
    generatePDF(printArea, 'Factura_' + movId + '.pdf');
}

async function venderProduto() {
    var searchEl = document.getElementById('v-prod-search');
    var idEl = document.getElementById('v-prod-id');
    var prodId = parseInt(idEl.value);

    if (!prodId) {
        var nome = searchEl.value.trim();
        var pByName = produtos.find(function (x) { return x.nome === nome; });
        if (pByName) {
            prodId = pByName.id;
            idEl.value = prodId;
            document.getElementById('v-preco').value = pByName.venda || 0;
            onVProdSearch();
        } else {
            showNotification('Selecione um medicamento válido');
            return;
        }
    }

    var qtd = parseInt(document.getElementById('v-qtd').value) || 0;
    if (!qtd) { showNotification('Insira a quantidade'); return; }

    var p = produtos.find(function (x) { return x.id === prodId; });
    if (!p) { showNotification('Produto não encontrado'); return; }
    if (p.qtd < qtd) { showNotification('Stock insuficiente! Disponível: ' + p.qtd); return; }

    if (p.qtd - qtd <= p.min) {
        showNotification('O stock ficará baixo após esta venda!', 'info');
    }

    var metodoEl = document.querySelector('input[name="v-metodo"]:checked');
    var metodo = metodoEl ? metodoEl.value : 'CASH';

    p.qtd -= qtd;
    checkLowStock(p);

    if (!sb) { showNotification('Sem ligação à BD'); p.qtd += qtd; return; }

    try {
        var prodRes = await sb.from(PREFIX + 'produtos').select('id').eq('id', prodId);
        if (prodRes.error || !prodRes.data || prodRes.data.length === 0) {
            var insRes = await sb.from(PREFIX + 'produtos').insert([
                { id: prodId, nome: p.nome, categoria: p.cat || '', quantidade: p.qtd, stock_minimo: p.min || 0, preco_custo: p.custo || 0, preco_venda: p.venda || 0, fornecedor: p.forn || '', validade: p.validade || null, lote: p.lote || '' }
            ]).select();
            if (insRes.error) {
                p.qtd += qtd;
                showNotification('Erro ao criar produto na BD: ' + insRes.error.message);
                return;
            }
        } else {
            await sb.from(PREFIX + 'produtos').update({ quantidade: p.qtd }).eq('id', prodId);
        }

        var novoMov = { tipo: 'saida', produto_id: prodId, quantidade: qtd, preco_unitario: p.venda, total: qtd * p.venda, nota: '[Venda Balcão]', metodo_pagamento: metodo, vendedor: currentUserEmail };
        var mRes = await sb.from(PREFIX + 'movimentos').insert([novoMov]).select();

        if (!mRes.error && mRes.data && mRes.data.length > 0) {
            var mm = mRes.data[0];
            showNotification('Venda registada com sucesso!', 'success');
            movimentos.unshift({ id: mm.id, tipo: 'saida', prodId: mm.produto_id, qtd: mm.quantidade, preco: mm.preco_unitario, total: mm.total, data: mm.data.split('T')[0], nota: '', metodo: mm.metodo_pagamento, nome_v: p.nome, vendedor: mm.vendedor, custo_aplicado: null });
            searchEl.value = '';
            idEl.value = '';
            document.getElementById('v-preco').value = '';
            document.getElementById('v-total').textContent = '0,00 MT';
            document.getElementById('v-qtd').value = 1;
            var cliEl = document.getElementById('v-cliente');
            if (cliEl) cliEl.value = '';
            var infoEl = document.getElementById('v-prod-info');
            infoEl.innerHTML = '';
            infoEl.style.display = 'none';
            rebuildFifo();
            renderVendedorStock(document.getElementById('v-stock-search').value);
            renderVendasDoDia();
            var imprimirRecibo = document.getElementById('v-imprimir-recibo').checked;
            if (imprimirRecibo) {
                setTimeout(function () { vPrintDocFromMov(mm.id); }, 500);
            } else {
                setTimeout(function () { vGerarRecibo(mm.id); }, 500);
            }
        } else {
            p.qtd += qtd;
            showNotification('Erro ao registar venda: ' + (mRes.error ? mRes.error.message : 'resposta vazia'));
        }
    } catch (e) {
        p.qtd += qtd;
        showNotification('Erro inesperado: ' + e.message);
        console.error('[venderProduto]', e);
    }
}

async function applyRoleRestrictions() {
    console.log('[applyRoleRestrictions] INICIO role=' + userRole);
    const isGestor = userRole === 'gestor';
    const sidebar = document.querySelector('.sidebar');
    const app = document.querySelector('.app');
    console.log('[applyRoleRestrictions] sidebar=' + (!!sidebar) + ' app=' + (!!app));
    
    document.getElementById('nav-admin-group').style.display = isGestor ? 'block' : 'none';
    document.getElementById('nav-vendedor-group').style.display = isGestor ? 'none' : 'block';
    
    if (!isGestor) {
        console.log('[applyRoleRestrictions] modo VENDEDOR');
        if (sidebar) sidebar.style.display = 'flex';
        if (app) app.classList.remove('seller-mode');
        renderVendedor();
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
    addDespesa,
    addDocItem,
    addMovimento,
    addPlanoItem,
    addProduto,
    addSaldoMovimento,
    clearPlano,
    closeConfirmModal,
    closeStockModal,
    confirmStockModal,
    confirmarCompra,
    deleteDocumento,
    deleteDespesa,
    deleteMovimento,
    deleteSelectedMovimentos,
    devolverQuarentena,
    downloadPDFFromHistory,
    editDespesa,
    gestaoMovimento,
    handleSort,
    loginUser,
    logoutUser,
    onProductSearch,
    prePopulatePlano,
    printDailyMovements,
    printFaturacao,
    printHistoricoMovimentos,
    printMensal,
    printPlanoCompras,
    printStockReport,
    prepareDocPrintArea,
    renderDocList,
    renderMovimentos,
    renderMovimentosDoDia,
    renderRelMensal,
    renderRelatorios,
    renderStock,
    removeProduto,
    saveAndDownloadPDF,
    setPeriodo,
    setSaldoInicial,
    setTipo,
    showSection,
    showStockTab,
    toggleSidebar,
    toggleCustomCat,
    toggleCustomProdCat,
    toggleSelectAllMovs,
    updateField,
    updateFornecedor,
    updateLote,
    updateMovTotal,
    updatePlanoQtd,
    updateQtd,
    updateValidade,
    filterVendedorStock,
    onVProdSearch,
    onVProdChange,
    vQtdChange,
    vUpdateTotal,
    vSelectMetodo,
    venderProduto,
    vGerarRecibo,
    vPrintDocFromMov,
    vPrintVendasDoDia,
    removeDocItem,
    removePlanoItem,
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
            <h2>${pharmacy.nome}</h2>
            <div style="font-size:12px; color:#555;">${pharmacy.endereco} | NUIT: ${pharmacy.nuit}</div>
            <div class="subtitle">PLANO DE COMPRAS</div>
            <div class="date">${today}</div>
        </div>
        <table><thead><tr>
            <th>#</th><th>Produto</th><th>Qtd</th><th>Custo Unit.</th><th>Custo Total</th><th>✓</th>
        </tr></thead><tbody>${rows.join('')}</tbody></table>
        <div class="total">TOTAL ESTIMADO: ${totalPlano.toLocaleString()} MZN</div>
        <div class="signatures"><div>_________________________<br>Assinatura do Comprador</div>
            <div>_________________________<br>Aprovado por</div></div>
        <div class="footer">Processado por Computador (${pharmacy.nome})</div>
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

function printStockReport() {
    if (!produtos || produtos.length === 0) {
        showNotification('Nenhum produto cadastrado no stock para imprimir.', 'info');
        return;
    }

    var searchInput = document.getElementById('search-prod');
    var vSearchInput = document.getElementById('v-stock-search');
    var q = '';
    if (searchInput && searchInput.value) q = searchInput.value.trim().toLowerCase();
    else if (vSearchInput && vSearchInput.value) q = vSearchInput.value.trim().toLowerCase();

    var filtered = produtos.filter(function (p) {
        return !q || (p.nome || '').toLowerCase().indexOf(q) !== -1 || (p.cat || '').toLowerCase().indexOf(q) !== -1;
    });

    if (filtered.length === 0) {
        showNotification('Nenhum produto encontrado com a pesquisa actual.', 'info');
        return;
    }

    filtered.sort(function (a, b) {
        return (a.nome || '').localeCompare(b.nome || '');
    });

    var totalSKUs = filtered.length;
    var totalUnidades = filtered.reduce(function (acc, p) { return acc + (Number(p.qtd) || 0); }, 0);
    var totalVenda = filtered.reduce(function (acc, p) { return acc + ((Number(p.qtd) || 0) * (Number(p.venda) || 0)); }, 0);
    var today = new Date().toLocaleString('pt-MZ');

    var rows = filtered.map(function (p, index) {
        var qtd = Number(p.qtd) || 0;
        var venda = Number(p.venda) || 0;
        var totalVendaProd = qtd * venda;

        return '<tr>' +
            '<td style="text-align:center;">' + (index + 1) + '</td>' +
            '<td><strong>' + escapeHTML(p.nome || '') + '</strong></td>' +
            '<td>' + escapeHTML(p.cat || '—') + '</td>' +
            '<td style="text-align:center; font-weight:bold;">' + qtd.toLocaleString() + '</td>' +
            '<td style="text-align:right;">' + venda.toLocaleString() + ' MZN</td>' +
            '<td style="text-align:right; font-weight:800; font-size:12px; color:#047857; background-color:#f0fdf4;">' + totalVendaProd.toLocaleString() + ' MZN</td>' +
            '</tr>';
    });

    var htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${pharmacy.nome} - Relatório de Stock (Preços de Venda)</title>
    <style>
        body { font-family: Arial, sans-serif; color: #333; padding: 20px; font-size: 12px; line-height: 1.4; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #10b981; padding-bottom: 15px; }
        .header h1 { margin: 0; font-size: 24px; color: #047857; }
        .header .sub { font-size: 12px; color: #666; margin-top: 4px; }
        .header .title { font-size: 16px; font-weight: bold; margin-top: 10px; text-transform: uppercase; color: #111; letter-spacing: 0.5px; }
        .header .meta { font-size: 11px; color: #6b7280; margin-top: 4px; }
        
        .summary-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; justify-content: center; }
        .summary-card { flex: 1; min-width: 140px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
        .summary-card.highlight { background: #ecfdf5; border: 2px solid #10b981; }
        .summary-card .label { font-size: 10px; text-transform: uppercase; color: #6b7280; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.5px; }
        .summary-card.highlight .label { color: #047857; }
        .summary-card .value { font-size: 16px; font-weight: 800; color: #111827; }
        .summary-card.highlight .value { font-size: 19px; color: #047857; }
        
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
        th, td { border: 1px solid #d1d5db; padding: 7px 9px; text-align: left; }
        th { background-color: #f3f4f6; font-weight: 700; color: #1f2937; }
        tfoot tr td { background-color: #f9fafb; font-weight: 800; border-top: 2px solid #111827; }
        
        .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px dashed #e5e7eb; padding-top: 10px; }
        
        @media print {
            body { padding: 0; }
            .summary-card { border: 1px solid #ccc; }
            .summary-card.highlight { border: 2px solid #10b981; background-color: #ecfdf5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            td[style*="background-color"] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${pharmacy.nome}</h1>
        <div class="sub">${pharmacy.endereco} | NUIT: ${pharmacy.nuit}</div>
        <div class="title">Relatório de Valor do Stock (Preços de Venda)</div>
        <div class="meta">Data de Emissão: ${today} ${q ? '| Filtro de pesquisa: "' + escapeHTML(q) + '"' : ''}</div>
    </div>

    <div class="summary-grid">
        <div class="summary-card">
            <div class="label">Total SKUs</div>
            <div class="value">${totalSKUs}</div>
        </div>
        <div class="summary-card">
            <div class="label">Total Qtd. em Stock</div>
            <div class="value">${totalUnidades.toLocaleString()}</div>
        </div>
        <div class="summary-card highlight">
            <div class="label">Valor Total do Stock (Venda)</div>
            <div class="value">${totalVenda.toLocaleString()} MZN</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width: 35px; text-align:center;">#</th>
                <th>Produto</th>
                <th>Categoria</th>
                <th style="text-align:center; width: 80px;">Qtd</th>
                <th style="text-align:right; width: 130px;">Preço Venda Unit. (MZN)</th>
                <th style="text-align:right; width: 150px; background-color:#dcfce7; color:#047857;">Preço Venda Total (MZN)</th>
            </tr>
        </thead>
        <tbody>
            ${rows.join('')}
        </tbody>
        <tfoot>
            <tr>
                <td colspan="3" style="text-align:right;"><strong>TOTAL GERAL DO STOCK (VENDA):</strong></td>
                <td style="text-align:center; font-weight:800;">${totalUnidades.toLocaleString()}</td>
                <td></td>
                <td style="text-align:right; font-weight:800; font-size:13px; color:#047857; background-color:#dcfce7; border-top:2px solid #047857;">${totalVenda.toLocaleString()} MZN</td>
            </tr>
        </tfoot>
    </table>

    <div class="footer">
        Relatório gerado automaticamente por ${pharmacy.nome} &bull; Documento de Gestão de Stock
    </div>
</body>
</html>`;

    var win = window.open('', '_blank');
    if (win) {
        win.opener = null;
        win.document.write(htmlContent);
        win.document.close();
        win.onload = function () {
            win.print();
        };
    }
}


