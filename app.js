// ============================================================
// PINTO'S BAR — app.js (Supabase + Chart.js)
// ============================================================

const SUPABASE_URL = 'https://pbozvloeyppytskgeizu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBib3p2bG9leXBweXRza2dlaXp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTQ5MjEsImV4cCI6MjA5MDAzMDkyMX0.3lbBJ5FCbECnCm5eM_y_NqyezKzjLiY4VMfzj5ltvdQ';

let sb = null;
try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
    console.error('Supabase SDK not loaded:', e);
}

// ====================== MODO DEMO (ISOLAMENTO) ======================
const IS_DEMO = window.location.hostname.includes('demo') || 
                window.location.search.includes('demo') || 
                localStorage.getItem('pintos_demo_active') === 'true';

const PREFIX = IS_DEMO ? 'demo_' : '';

if (IS_DEMO) {
    console.log('--- AMBIENTE DE DEMONSTRAÇÃO ACTIVO ---');
    window.addEventListener('DOMContentLoaded', function() {
        var header = document.querySelector('.logo') || document.querySelector('.app > div') || document.body;
        var badge = document.createElement('div');
        badge.id = 'demo-badge';
        badge.style.cssText = 'background:#854F0B; color:#fff; font-size:10px; padding:2px 8px; border-radius:4px; margin-left:10px; display:inline-block; vertical-align:middle; font-weight:bold;';
        badge.textContent = 'MODO DEMO (TESTE)';
        if (header) header.appendChild(badge);
    });
}

// ====================== NOTIFICAÇÕES ======================
function showNotification(msg, type = 'error') {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<span>' + msg + '</span>';
    container.appendChild(toast);
    setTimeout(function () {
        toast.classList.add('toast-out');
        setTimeout(function () { toast.remove(); }, 300);
    }, 4000);
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
let periodoActivo = 'mensal';
let diarioDias = 7;
let chartVendas, chartLucro, chartRelVendas, chartRelLucro, chartTop5, chartDiario;
let userRole = 'gestor';
let activeMesa = null;
let activeClienteId = null;

// ---------- DATE ----------
const dateEl = document.getElementById('current-date');
if (dateEl) dateEl.textContent = new Date().toLocaleDateString('pt-MZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

// ====================== NAVIGATION ======================
function showSection(id) {
    document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
    document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('active'); });

    var target = document.getElementById('sec-' + id);
    if (target) target.classList.add('active');

    // Highlight the correct nav button
    var btns = document.querySelectorAll('.nav-btn');
    for (var i = 0; i < btns.length; i++) {
        var oc = btns[i].getAttribute('onclick') || '';
        if (oc.indexOf(id) !== -1) { btns[i].classList.add('active'); break; }
    }

    if (id === 'dashboard') renderDashboard();
    if (id === 'stock') renderStock();
    if (id === 'movimentos') renderMovimentos();
    if (id === 'relatorios') renderRelatorios();
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
    var hoje = new Date().toISOString().split('T')[0];
    var movs = movimentos.filter(function (m) { 
        return m.data === hoje && (m.tipo === 'saida' || m.tipo === 'quebra'); 
    });
    
    if (movs.length === 0) { 
        showNotification('Nenhum movimento de venda ou quebra para imprimir hoje.', 'info'); 
        return; 
    }
    
    var win = window.open('', '_blank');
    var html = '<html><head><title>Pinto\'s Bar - Movimentos do Dia</title><style>' +
               'body { font-family: sans-serif; padding: 20px; font-size: 14px; }' +
               'table { width: 100%; border-collapse: collapse; margin-top: 15px; }' +
               'th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }' +
               'th { background: #f8f9fa; }' +
               'h1 { font-size: 20px; text-align: center; margin-bottom: 5px; }' +
               'p { text-align: center; color: #666; font-size: 13px; }' +
               '</style></head><body>' +
               '<h1>Pinto\'s Bar</h1>' +
               '<p>Relátorio de Movimentos Diários - ' + hoje.split('-').reverse().join('/') + '</p>' +
               '<table><thead><tr><th>Hora</th><th>Produto</th><th>Tipo</th><th>Qtd</th><th>Total (MZN)</th></tr></thead><tbody>';
               
    movs.forEach(function (m) {
        var p = produtos.find(function (x) { return x.id === m.prodId; });
        html += '<tr>' +
                '<td>' + (m.created_at ? new Date(m.created_at).toLocaleTimeString() : '-') + '</td>' +
                '<td>' + (p ? p.nome : m.produto_nome || '-') + '</td>' +
                '<td>' + (m.tipo === 'saida' ? 'Venda' : 'Quebra') + '</td>' +
                '<td>' + m.qtd + '</td>' +
                '<td>' + m.total.toLocaleString() + '</td>' +
                '</tr>';
    });
    
    var totalVendas = movs.filter(m => m.tipo === 'saida').reduce((a, b) => a + b.total, 0);
    
    html += '</tbody></table>' +
            '<div style="margin-top:20px; text-align:right; border-top: 2px solid #333; padding-top: 10px;">' +
            '<strong>Total de Vendas do Dia: ' + totalVendas.toLocaleString() + ' MZN</strong>' +
            '</div>' +
            '<div style="margin-top:40px; font-size:10px; text-align:center;">Processado por Sistema Pinto\'s Bar</div>' +
            '</body></html>';
    
    win.document.write(html);
    win.document.close();
    win.print();
}

function setPeriodo(p, btn) {
    periodoActivo = p;
    document.querySelectorAll('.period-btn').forEach(function (b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    renderRelatorios();
}

// ====================== DATA ======================
async function fetchData() {
    if (!sb) { console.warn('Supabase not available'); return; }

    var pRes, mRes, dRes, docRes;
    try {
        var results = await Promise.all([
            sb.from(PREFIX + 'produtos').select('*').order('nome'),
            sb.from(PREFIX + 'movimentos').select('*, produtos(nome)').order('data', { ascending: false }).limit(300),
            sb.from(PREFIX + 'despesas').select('*').order('data', { ascending: false }).limit(100),
            sb.from(PREFIX + 'documentos').select('*').order('data', { ascending: false }).limit(100),
            sb.from(PREFIX + 'saldo_caixa').select('*').order('data', { ascending: false }),
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

    if (pRes.data) {
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
            return {
                id: m.id,
                tipo: m.tipo,
                prodId: m.produto_id,
                qtd: m.quantidade,
                preco: m.preco_unitario,
                total: m.total,
                data: m.data.split('T')[0],
                dataHora: new Date(m.data).toLocaleString('pt-MZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
                nota: m.nota,
                metodo: m.metodo_pagamento,
                nome_v: m.produtos ? m.produtos.nome : '—',
                custo_aplicado: cApp
            };
        });
    }
    if (dRes.data) {
        despesas = dRes.data.map(function (d) {
            return { id: d.id, categoria: d.categoria, descricao: d.descricao, valor: d.valor, metodo: d.metodo_pagamento, data: d.data.split('T')[0] };
        });
    }
    if (docRes.data) {
        documentos = docRes.data.map(function (d) {
            return { id: d.id, tipo: d.tipo, cliente: d.cliente, data: d.data.split('T')[0], total: d.total, detalhes: d.detalhes || [] };
        });
    }
    rebuildFifo();
}

// ====================== HELPERS ======================
function getStatus(p) {
    if (p.qtd === 0) return '<span class="badge badge-out">Esgotado</span>';
    if (p.qtd <= p.min) return '<span class="badge badge-low">Stock baixo</span>';
    return '<span class="badge badge-ok">OK</span>';
}

// ====================== DASHBOARD ======================
function renderDashboard() {
    var totalSkus = produtos.length;
    var totalUnid = produtos.reduce(function (a, p) { return a + p.qtd; }, 0);
    var vendas = movimentos.filter(function (m) { return m.tipo === 'saida'; });
    var totalVendas = vendas.reduce(function (a, m) { return a + m.total; }, 0);
    var totalCusto = vendas.reduce(function (a, m) { var p = produtos.find(function (x) { return x.id === m.prodId; }); return a + (p ? m.qtd * p.custo : 0); }, 0);
    var lucro = totalVendas - totalCusto;
    var alertas = produtos.filter(function (p) { return p.qtd <= p.min; }).length;

    var hoje = new Date().toISOString().split('T')[0];
    var vendasHoje = movimentos.filter(function (m) { return m.tipo === 'saida' && m.data === hoje; });
    var totalVendasHoje = vendasHoje.reduce(function (a, m) { return a + m.total; }, 0);

    var html = '<div class="metric-card"><div class="metric-label">Produtos em stock</div><div class="metric-value">' + totalSkus + '</div><div class="metric-sub">' + totalUnid + ' unidades totais</div></div>';
    
    if (userRole === 'vendedor') {
        html += '<div class="metric-card"><div class="metric-label">Vendas de Hoje</div><div class="metric-value" style="color:#378ADD;">' + totalVendasHoje.toLocaleString() + ' MZN</div><div class="metric-sub">' + vendasHoje.length + ' vendas hoje</div></div>';
    } else {
        html += '<div class="metric-card"><div class="metric-label">Receita total</div><div class="metric-value">' + totalVendas.toLocaleString() + ' MZN</div><div class="metric-sub">Vendas registadas</div></div>';
        html += '<div class="metric-card"><div class="metric-label">Lucro Bruto (Margem)</div><div class="metric-value" style="color:#3B6D11;">' + lucro.toLocaleString() + ' MZN</div><div class="metric-sub">Margem ' + (totalVendas > 0 ? Math.round(lucro / totalVendas * 100) : 0) + '%</div></div>';
    }
    
    html += '<div class="metric-card"><div class="metric-label">Alertas activos</div><div class="metric-value" style="color:' + (alertas > 0 ? '#A32D2D' : '#3B6D11') + ';">' + alertas + '</div><div class="metric-sub">Produtos com stock baixo</div></div>';

    document.getElementById('dash-metrics').innerHTML = html;

    var meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    var labels = [];
    var vendasMes = [];
    var lucroMes = [];
    var custoMes = [];

    var agora = new Date();
    for (var i = 5; i >= 0; i--) {
        var d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
        var mKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        labels.push(meses[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2));

        var mSales = movimentos.filter(m => m.tipo === 'saida' && m.data.startsWith(mKey));
        var vTotal = mSales.reduce((a, m) => a + m.total, 0);
        var qTotal = mSales.reduce((a, m) => a + m.qtd, 0);
        var cTotal = mSales.reduce((a, m) => a + (m.fifo_cost || 0), 0);

        vendasMes.push(qTotal);
        lucroMes.push(vTotal - cTotal);
        custoMes.push(cTotal);
    }

    if (typeof Chart !== 'undefined') {
        if (chartVendas) chartVendas.destroy();
        chartVendas = new Chart(document.getElementById('chartVendas'), { type: 'bar', data: { labels: labels, datasets: [{ label: 'Unidades vendidas', data: vendasMes, backgroundColor: '#B5D4F4', borderColor: '#378ADD', borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
        if (chartLucro) chartLucro.destroy();
        chartLucro = new Chart(document.getElementById('chartLucro'), { type: 'bar', data: { labels: labels, datasets: [{ label: 'Lucro', data: lucroMes, backgroundColor: '#C0DD97', borderColor: '#639922', borderWidth: 1 }, { label: 'Custo', data: custoMes, backgroundColor: '#F5C4B3', borderColor: '#D85A30', borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, labels: { font: { size: 11 }, boxWidth: 10 } } } } });
    }

    var lowProds = produtos.filter(function (p) { return p.qtd <= p.min * 2; }).sort(function (a, b) { return a.qtd - b.qtd; }).slice(0, 5);
    document.getElementById('dash-low-table').innerHTML = lowProds.length ?
        '<table><thead><tr><th>Produto</th><th>Categoria</th><th>Stock actual</th><th>Mínimo</th><th>Estado</th></tr></thead><tbody>' +
        lowProds.map(function (p) { return '<tr><td>' + p.nome + '</td><td>' + p.cat + '</td><td>' + p.qtd + '</td><td>' + p.min + '</td><td>' + getStatus(p) + '</td></tr>'; }).join('') +
        '</tbody></table>' : '<div class="empty">Todos os produtos com stock adequado</div>';

    var ac = document.getElementById('alert-count');
    if (ac) ac.textContent = alertas > 0 ? alertas : '';
}

function renderStock() {
    var q = (document.getElementById('search-prod').value || '').toLowerCase();
    var filtered = produtos.filter(function (p) { return p.nome.toLowerCase().indexOf(q) !== -1 || (p.cat || '').toLowerCase().indexOf(q) !== -1; });
    
    var totalCustoStock = filtered.reduce((a, p) => a + (p.qtd * p.custo), 0);
    var totalVendaStock = filtered.reduce((a, p) => a + (p.qtd * p.venda), 0);
    var lucroPreviso = totalVendaStock - totalCustoStock;

    var metricsEl = document.getElementById('stock-metrics');
    if (metricsEl) {
        if (userRole === 'vendedor') {
            metricsEl.innerHTML = `
                <div class="metric-card"><div class="metric-label">Total SKUs</div><div class="metric-value">${filtered.length}</div></div>
                <div class="metric-card"><div class="metric-label">Stock Baixo</div><div class="metric-value">${filtered.filter(p => p.qtd <= p.min).length}</div></div>
            `;
        } else {
            metricsEl.innerHTML = `
                <div class="metric-card"><div class="metric-label">Valor Stock (Custo)</div><div class="metric-value">${totalCustoStock.toLocaleString()} MZN</div></div>
                <div class="metric-card"><div class="metric-label">Valor Stock (Venda)</div><div class="metric-value">${totalVendaStock.toLocaleString()} MZN</div></div>
                <div class="metric-card"><div class="metric-label">Previsão Lucro</div><div class="metric-value" style="color:#3B6D11;">${lucroPreviso.toLocaleString()} MZN</div></div>
                <div class="metric-card"><div class="metric-label">Total SKUs</div><div class="metric-value">${filtered.length}</div></div>
            `;
        }
    }

    var isGestor = userRole === 'gestor';
    var header = '<table><thead><tr><th>Produto</th><th>Categoria</th><th>Qtd</th>' + 
                 (isGestor ? '<th>Mín.</th><th>Custo (MT)</th>' : '') + 
                 '<th>Venda (MT)</th>' + 
                 (isGestor ? '<th>Margem</th><th>Fornecedor</th>' : '') + 
                 '<th>Estado</th>' + 
                 (isGestor ? '<th>Acções</th>' : '') + '</tr></thead><tbody>';

    document.getElementById('stock-table').innerHTML = filtered.length ?
        header +
        filtered.map(function (p) {
            var row = '<tr><td>' + p.nome + '</td><td>' + p.cat + '</td>' +
                '<td><input type="number" value="' + p.qtd + '" min="0" style="width:60px;padding:3px 6px;" onchange="updateQtd(' + p.id + ',this.value)"></td>';
            
            if (isGestor) {
                row += '<td><input type="number" value="' + p.min + '" min="0" style="width:60px;padding:3px 6px;" onchange="updateField(' + p.id + ',\'stock_minimo\',this.value)"></td>' +
                       '<td><input type="number" value="' + p.custo + '" min="0" style="width:80px;padding:3px 6px;" onchange="updateField(' + p.id + ',\'preco_custo\',this.value)"></td>';
            }
            
            row += '<td><input type="number" value="' + p.venda + '" min="0" style="width:80px;padding:3px 6px;" onchange="updateField(' + p.id + ',\'preco_venda\',this.value)"></td>';
            
            if (isGestor) {
                row += '<td style="color:#3B6D11;">' + (p.venda > 0 ? Math.round((p.venda - p.custo) / p.venda * 100) : 0) + '%</td>' +
                       '<td><input type="text" value="' + (p.forn || '') + '" style="width:120px;padding:3px 6px;font-size:12px;" onchange="updateFornecedor(' + p.id + ',this.value)"></td>';
            }
            
            row += '<td>' + getStatus(p) + '</td>';
            
            if (isGestor) {
                row += '<td><button class="btn btn-danger" onclick="removeProduto(' + p.id + ')">Remover</button></td>';
            }
            
            row += '</tr>';
            return row;
        }).join('') + '</tbody></table>' : '<div class="empty">Nenhum produto encontrado</div>';
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
        if (!confirm('Deseja aumentar o stock de "' + p.nome + '" em ' + diff + ' unidades? Será gerada uma Entrada.')) { renderStock(); return; }
        tipo = 'entrada';
    } else {
        var resp = prompt('Diminuição de ' + diff + ' unidades em "' + p.nome + '". Foi Saída (venda) ou Quebra? Digite "S" para Saída ou "Q" para Quebra:');
        if (!resp) { renderStock(); return; }
        if (resp.toUpperCase() === 'S') tipo = 'saida';
        else if (resp.toUpperCase() === 'Q') tipo = 'quebra';
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
    renderStock(); renderDashboard(); renderMovimentos();
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
    var novoProd = {
        nome: nome,
        categoria: document.getElementById('p-cat').value,
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
        renderStock(); populateProdutoSelect();
    } else { showNotification('Erro ao salvar no banco: ' + (res.error ? res.error.message : '')); }
}

async function removeProduto(id) {
    if (!confirm('Remover este produto?')) return;
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
    var sel = document.getElementById('m-produto');
    if (sel) sel.innerHTML = produtos.map(function (p) { return '<option value="' + p.id + '">' + p.nome + '</option>'; }).join('');
    updateMovPrice();
}

function setTipo(t) {
    tipoActivo = t;
    ['entrada', 'saida', 'quebra'].forEach(function (x) {
        var btn = document.getElementById('tipo-' + x);
        if (btn) btn.className = 'tipo-btn' + (t === x ? ' active-' + x : '');
    });
    var container = document.getElementById('m-metodo-container');
    if (container) container.style.display = (t === 'quebra') ? 'none' : 'flex';
    
    var cgroup = document.getElementById('group-custo');
    if (cgroup) {
        // Vendedor NUNCA vê Custo Aplicado, independente do tipo de movimento
        if (userRole === 'vendedor') {
            cgroup.style.display = 'none';
        } else {
            cgroup.style.display = (t === 'entrada') ? 'block' : 'none';
        }
    }
    updateMovPrice();
}

function updateMovPrice() {
    var el = document.getElementById('m-produto');
    var cEl = document.getElementById('m-custo');
    if (!el || !el.value) return;
    var p = produtos.find(function (x) { return x.id === parseInt(el.value); });
    if (!p) return;
    document.getElementById('m-preco').value = tipoActivo === 'entrada' ? p.custo : tipoActivo === 'saida' ? p.venda : p.custo;
    if (cEl) cEl.value = ''; // placeholder takes over
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
    var custoMan = parseFloat(document.getElementById('m-custo').value);
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
        if (!isNaN(custoMan)) {
            nota = '[C:' + custoMan + '] ' + nota; 
        }
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
        movimentos.unshift({ id: mm.id, tipo: mm.tipo, prodId: mm.produto_id, qtd: mm.quantidade, preco: mm.preco_unitario, total: mm.total, data: mm.data.split('T')[0], nota: mm.nota.replace(/\[C:[\d.]+\]\s*/, ''), metodo: mm.metodo_pagamento, nome_v: p.nome, custo_aplicado: isNaN(custoMan) ? null : custoMan });
        document.getElementById('m-qtd').value = 1; document.getElementById('m-nota').value = ''; document.getElementById('m-custo').value = '';
        rebuildFifo(); // Recalcula o motor de lucros
        renderMovimentos(); renderAlertas(); renderStock(); renderCaixa(); renderNecessidades();
        var ac = document.getElementById('alert-count');
        if (ac) ac.textContent = produtos.filter(function (x) { return x.qtd <= x.min; }).length || '';
    } else {
        showNotification('Erro ao gravar movimento.');
        if (tipoActivo === 'entrada') p.qtd -= qtd; else p.qtd += qtd;
    }
}

// ====================== MOTOR FIFO (CUSTO DINÂMICO) ======================
function rebuildFifo() {
    var sorted = [...movimentos].sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
    var lotes = {};
    for (var m of sorted) {
        if (m.tipo === 'entrada') {
            if (!lotes[m.prodId]) lotes[m.prodId] = [];
            lotes[m.prodId].push({ qtd: m.qtd, preco: m.preco });
        } else {
            var toConsume = m.qtd;
            var cost = 0;
            if (lotes[m.prodId]) {
                while (toConsume > 0 && lotes[m.prodId].length > 0) {
                    var lot = lotes[m.prodId][0];
                    var take = Math.min(toConsume, lot.qtd);
                    cost += take * lot.preco;
                    toConsume -= take;
                    lot.qtd -= take;
                    if (lot.qtd <= 0) lotes[m.prodId].shift();
                }
            }
            if (toConsume > 0) {
                var p = produtos.find(x => x.id === m.prodId);
                cost += toConsume * (p ? p.custo : 0);
            }
            // Guarda na memória do movimento
            if (m.custo_aplicado != null && !isNaN(m.custo_aplicado)) {
                m.fifo_cost = m.custo_aplicado * m.qtd; // Override do Utilizador
            } else {
                m.fifo_cost = cost; // Motor FiFo
            }
        }
    }
}

function renderMovimentos() {
    populateProdutoSelect();
    var tipoLabel = { entrada: 'Entrada', saida: 'Venda', quebra: 'Quebra' };
    document.getElementById('mov-table').innerHTML = movimentos.length ?
        '<table><thead><tr><th>Data/Hora</th><th>Tipo</th><th>Produto</th><th>Qtd</th><th>Preço unit.</th><th>Total</th><th>Pagamento</th><th>Notas</th><th>Acções</th></tr></thead><tbody>' +
        movimentos.slice(0, 30).map(function (m) {
            var cor = m.tipo === 'entrada' ? 'badge-ok' : m.tipo === 'saida' ? 'badge' : 'badge-low';
            var style = m.tipo === 'saida' ? ' style="background:#E6F1FB;color:#185FA5;"' : '';
            return '<tr><td style="color:var(--color-text-secondary);font-size:12px;">' + (m.dataHora || m.data) + '</td>' +
                '<td><span class="badge ' + cor + '"' + style + '>' + tipoLabel[m.tipo] + '</span></td>' +
                '<td>' + (m.nome_v || '—') + '</td><td>' + m.qtd + '</td><td>' + m.preco + ' MZN</td>' +
                '<td style="font-weight:500;">' + m.total.toLocaleString() + ' MZN</td>' +
                '<td><span class="badge">' + (m.metodo || '—') + '</span></td>' +
                '<td style="font-size:12px;color:var(--color-text-secondary);">' + (m.nota || '—') + '</td>' +
                '<td><button class="btn btn-danger" onclick="deleteMovimento(' + m.id + ')">Anular</button></td></tr>';
        }).join('') + '</tbody></table>' : '<div class="empty">Nenhum movimento registado</div>';
}

async function deleteMovimento(id) {
    if (!confirm('Tem certeza que deseja anular este movimento? O stock será revertido.')) return;
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
        showNotification('Movimento anulado com sucesso!', 'success');
        await fetchData(); 
        renderMovimentos(); renderStock(); renderDashboard(); renderCaixa(); renderAlertas(); renderNecessidades(); renderDocsHistory();
    } catch (err) {
        console.error('Erro ao anular movimento:', err);
        showNotification('Erro ao anular movimento.');
    }
}

// ====================== DESPESAS ======================
function toggleCustomCat() {
    var sel = document.getElementById('d-categoria');
    var cust = document.getElementById('d-categoria-custom');
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
            return '<tr><td style="font-size:12px;color:var(--color-text-secondary);">' + d.data + '</td>' +
                '<td><span class="badge badge-low">' + d.categoria + '</span></td>' +
                '<td>' + d.descricao + '</td>' +
                '<td style="font-weight:500;color:#A32D2D;">' + d.valor.toLocaleString() + ' MZN</td>' +
                '<td><span class="badge">' + d.metodo + '</span></td>' +
                '<td><div style="display:flex;gap:4px;"><button class="btn" style="font-size:11px;padding:3px 8px;" onclick="editDespesa(' + d.id + ')">Editar</button>' +
                '<button class="btn btn-danger" onclick="deleteDespesa(' + d.id + ')">Apagar</button></div></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">Nenhuma despesa registada</div>';
}

async function deleteDespesa(id) {
    if (!confirm('Tem certeza que deseja apagar esta despesa?')) return;
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
    if (sb) await sb.from(PREFIX + 'despesas').delete().eq('id', id);
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
        return '<tr><td>' + p.nome + '</td>' +
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

    document.getElementById('alertas-list').innerHTML = todos.length ?
        todos.map(function (p) {
            return '<div class="alert-item">' +
                '<div><div style="font-size:14px;font-weight:500;">' + p.nome + '</div><div style="font-size:12px;color:var(--color-text-secondary);">' + p.cat + ' — mínimo: ' + p.min + ' unidades</div></div>' +
                '<div style="text-align:right;"><div style="font-size:18px;font-weight:500;color:' + (p.qtd === 0 ? '#A32D2D' : '#854F0B') + ';">' + p.qtd + ' un.</div>' + getStatus(p) + '</div></div>';
        }).join('') : '<div class="empty">Nenhum alerta activo — stock em boa situação!</div>';

    var quebras = movimentos.filter(function (m) { return m.tipo === 'quebra'; });
    document.getElementById('quebras-list').innerHTML = quebras.length ?
        '<table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Custo estimado</th><th>Notas</th></tr></thead><tbody>' +
        quebras.map(function (m) {
            return '<tr><td style="font-size:12px;color:var(--color-text-secondary);">' + m.data + '</td><td>' + (m.nome_v || '—') + '</td><td>' + m.qtd + '</td><td style="color:#A32D2D;">' + m.total.toLocaleString() + ' MZN</td><td style="font-size:12px;color:var(--color-text-secondary);">' + (m.nota || '—') + '</td></tr>';
        }).join('') + '</tbody></table>' : '<div class="empty">Nenhuma quebra registada</div>';
}

// ====================== RELATÓRIOS ======================
function renderRelatorios() {
    var meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    var labels, vendasData, lucroData;
    var vendTotal = movimentos.filter(function (m) { return m.tipo === 'saida'; }).reduce(function (a, m) { return a + m.total; }, 0);

    if (periodoActivo === 'mensal') {
        var agora = new Date();
        labels = []; vendasData = []; lucroData = [];
        for (var i = 5; i >= 0; i--) {
            var d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
            var mKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            labels.push(meses[d.getMonth()]);
            var mSales = movimentos.filter(m => m.tipo === 'saida' && m.data.startsWith(mKey));
            var rec = mSales.reduce((a, m) => a + m.total, 0);
            var luc = rec - mSales.reduce((a, m) => a + (m.fifo_cost || 0), 0);
            vendasData.push(rec); lucroData.push(luc);
        }
    } else if (periodoActivo === 'trimestral') {
        labels = ['T1', 'T2', 'T3', 'T4'];
        vendasData = [0, 0, 0, 0]; lucroData = [0, 0, 0, 0];
        var anoActual = new Date().getFullYear();
        movimentos.filter(m => m.tipo === 'saida' && m.data.startsWith(String(anoActual))).forEach(m => {
            var trim = Math.floor(new Date(m.data).getMonth() / 3);
            vendasData[trim] += m.total;
            lucroData[trim] += (m.total - (m.fifo_cost || 0));
        });
    } else {
        labels = [new Date().getFullYear() - 2, new Date().getFullYear() - 1, new Date().getFullYear()];
        vendasData = [0, 0, 0]; lucroData = [0, 0, 0];
        movimentos.filter(m => m.tipo === 'saida').forEach(m => {
            var ano = new Date(m.data).getFullYear();
            var idx = labels.indexOf(ano);
            if (idx !== -1) {
                vendasData[idx] += m.total;
                lucroData[idx] += (m.total - (m.fifo_cost || 0));
            }
        });
    }

    var totalV = vendasData[vendasData.length - 1];
    var totalL = lucroData[lucroData.length - 1];
    var totalQ = movimentos.filter(function (m) { return m.tipo === 'quebra'; }).reduce(function (a, m) { return a + m.total; }, 0);
    var totalMov = movimentos.filter(function (m) { return m.tipo === 'saida'; }).reduce(function (a, m) { return a + m.qtd; }, 0);

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
        var top5 = produtos.map(function (p) {
            return { nome: p.nome.split(' ').slice(0, 2).join(' '), vendas: movimentos.filter(function (m) { return m.tipo === 'saida' && m.prodId === p.id; }).reduce(function (a, m) { return a + m.qtd; }, 0) };
        }).sort(function (a, b) { return b.vendas - a.vendas; }).slice(0, 5);
        if (chartTop5) chartTop5.destroy();
        chartTop5 = new Chart(document.getElementById('chartTop5'), { type: 'bar', data: { labels: top5.map(function (p) { return p.nome; }), datasets: [{ data: top5.map(function (p) { return p.vendas; }), backgroundColor: ['#B5D4F4', '#C0DD97', '#F5C4B3', '#CECBF6', '#9FE1CB'], borderRadius: 4 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });

        // GRAFICO DIARIO — configurável 7 ou 30 dias
        var diasLabels = [];
        var diasVendas = [];
        var diasLucros = [];
        for (var d = diarioDias - 1; d >= 0; d--) {
            var dt = new Date(); dt.setDate(dt.getDate() - d);
            var key = dt.toISOString().split('T')[0];
            var label = dt.getDate() + '/' + (dt.getMonth() + 1);
            diasLabels.push(label);
            var vendasDia = movimentos.filter(function (m) { return m.tipo === 'saida' && m.data === key; });
            var receitaDia = vendasDia.reduce(function (a, m) { return a + m.total; }, 0);
            var custoDia = vendasDia.reduce(function (a, m) { return a + (m.fifo_cost || 0); }, 0);
            diasVendas.push(receitaDia);
            diasLucros.push(receitaDia - custoDia);
        }
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
    }
}

function setDiarioDias(n, btn) {
    diarioDias = n;
    document.getElementById('diario-7').classList.remove('active');
    document.getElementById('diario-30').classList.remove('active');
    if (btn) btn.classList.add('active');
    renderRelatorios();
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
    var quebras = movMes.filter(function (m) { return m.tipo === 'quebra'; });

    var totalVendas = vendas.reduce(function (a, m) { return a + m.total; }, 0);
    var totalCompras = compras.reduce(function (a, m) { return a + m.total; }, 0);
    var totalQuebras = quebras.reduce(function (a, m) { return a + m.total; }, 0);
    var totalDespesas = despMes.reduce(function (a, d) { return a + d.valor; }, 0);

    var custoVendas = vendas.reduce(function (a, m) { return a + (m.fifo_cost || 0); }, 0);
    var lucroBruto = totalVendas - custoVendas;
    var lucroLiquido = lucroBruto - totalDespesas;

    // Métricas
    document.getElementById('rm-metrics').innerHTML =
        '<div class="metric-card"><div class="metric-label">Receita (Vendas)</div><div class="metric-value">' + totalVendas.toLocaleString() + '</div><div class="metric-sub">MZN | ' + vendas.length + ' transacções</div></div>' +
        '<div class="metric-card"><div class="metric-label">Custo de Stock Comprado</div><div class="metric-value" style="color:#854F0B;">' + totalCompras.toLocaleString() + '</div><div class="metric-sub">MZN | ' + compras.length + ' entradas</div></div>' +
        '<div class="metric-card"><div class="metric-label">Lucro Bruto</div><div class="metric-value" style="color:#3B6D11;">' + lucroBruto.toLocaleString() + '</div><div class="metric-sub">MZN | Margem ' + (totalVendas > 0 ? Math.round(lucroBruto / totalVendas * 100) : 0) + '%</div></div>' +
        '<div class="metric-card"><div class="metric-label">Total Quebras</div><div class="metric-value" style="color:#854F0B;">' + totalQuebras.toLocaleString() + '</div><div class="metric-sub">MZN | ' + quebras.length + ' quebras</div></div>' +
        '<div class="metric-card"><div class="metric-label">Total Despesas</div><div class="metric-value" style="color:#A32D2D;">' + totalDespesas.toLocaleString() + '</div><div class="metric-sub">MZN | ' + despMes.length + ' lançamentos</div></div>' +
        '<div class="metric-card"><div class="metric-label">Lucro Líquido</div><div class="metric-value" style="color:' + (lucroLiquido >= 0 ? '#3B6D11' : '#A32D2D') + ';">' + lucroLiquido.toLocaleString() + '</div><div class="metric-sub">MZN (Bruto − Despesas)</div></div>';

    // Tabela Vendas
    document.getElementById('rm-vendas').innerHTML = vendas.length ?
        '<table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Preço</th><th>Total</th><th>Pagamento</th></tr></thead><tbody>' +
        vendas.map(function (m) {
            return '<tr><td style="font-size:12px;">' + m.data + '</td><td>' + (m.nome_v || '—') + '</td><td>' + m.qtd + '</td><td>' + m.preco + '</td><td style="font-weight:500;">' + m.total.toLocaleString() + ' MZN</td><td><span class="badge">' + (m.metodo || '—') + '</span></td></tr>';
        }).join('') +
        '<tr style="font-weight:bold;background:var(--color-background-secondary);"><td colspan="4">TOTAL VENDAS</td><td>' + totalVendas.toLocaleString() + ' MZN</td><td></td></tr>' +
        '</tbody></table>' : '<div class="empty">Nenhuma venda neste mês</div>';

    // Tabela Compras
    document.getElementById('rm-compras').innerHTML = compras.length ?
        '<table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Preço</th><th>Total</th><th>Pagamento</th></tr></thead><tbody>' +
        compras.map(function (m) {
            return '<tr><td style="font-size:12px;">' + m.data + '</td><td>' + (m.nome_v || '—') + '</td><td>' + m.qtd + '</td><td>' + m.preco + '</td><td style="font-weight:500;">' + m.total.toLocaleString() + ' MZN</td><td><span class="badge">' + (m.metodo || '—') + '</span></td></tr>';
        }).join('') +
        '<tr style="font-weight:bold;background:var(--color-background-secondary);"><td colspan="4">TOTAL COMPRAS</td><td>' + totalCompras.toLocaleString() + ' MZN</td><td></td></tr>' +
        '</tbody></table>' : '<div class="empty">Nenhuma compra neste mês</div>';

    // Tabela Quebras
    var realQuebrasCost = quebras.reduce(function (a, m) { return a + (m.fifo_cost || 0); }, 0);
    document.getElementById('rm-quebras').innerHTML = quebras.length ?
        '<table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Custo (FIFO)</th><th>Notas</th></tr></thead><tbody>' +
        quebras.map(function (m) {
            return '<tr><td style="font-size:12px;">' + m.data + '</td><td>' + (m.nome_v || '—') + '</td><td>' + m.qtd + '</td><td style="color:#A32D2D;">' + (m.fifo_cost || 0).toLocaleString() + ' MZN</td><td style="font-size:12px;">' + (m.nota || '—') + '</td></tr>';
        }).join('') +
        '<tr style="font-weight:bold;background:var(--color-background-secondary);"><td colspan="3">CUSTO TOTAL QUEBRAS</td><td>' + realQuebrasCost.toLocaleString() + ' MZN</td><td></td></tr>' +
        '</tbody></table>' : '<div class="empty">Nenhuma quebra neste mês</div>';

    // Tabela Despesas
    document.getElementById('rm-despesas').innerHTML = despMes.length ?
        '<table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Pagamento</th></tr></thead><tbody>' +
        despMes.map(function (d) {
            return '<tr><td style="font-size:12px;">' + d.data + '</td><td><span class="badge badge-low">' + d.categoria + '</span></td><td>' + d.descricao + '</td><td style="font-weight:500;color:#A32D2D;">' + d.valor.toLocaleString() + ' MZN</td><td><span class="badge">' + d.metodo + '</span></td></tr>';
        }).join('') +
        '<tr style="font-weight:bold;background:var(--color-background-secondary);"><td colspan="3">TOTAL DESPESAS</td><td>' + totalDespesas.toLocaleString() + ' MZN</td><td></td></tr>' +
        '</tbody></table>' : '<div class="empty">Nenhuma despesa neste mês</div>';
}

function printMensal() {
    prepareMensalPrintArea();
    setTimeout(function () { window.print(); }, 500);
}

function downloadRelMensalPDF() {
    prepareMensalPrintArea();
    var mesSel = document.getElementById('rm-mes').value;
    var filename = 'Relatorio_Mensal_' + mesSel + '.pdf';
    var printArea = document.getElementById('print-area');
    // For mensal reports with charts, landscape is better to prevent clipping
    generatePDF(printArea, filename, 'landscape');
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
    var lucroLiquido = lucroBruto - totalDespesas;

    // Prev month computation
    var dObj = new Date(mesSel + '-01T00:00:00');
    dObj.setMonth(dObj.getMonth() - 1);
    var mesAnt = dObj.getFullYear() + '-' + String(dObj.getMonth() + 1).padStart(2, '0');
    var vAnt = movimentos.filter(m => m.data.substring(0, 7) === mesAnt && m.tipo === 'saida');
    var recAnt = vAnt.reduce((a, m) => a + m.total, 0);
    var custAnt = vAnt.reduce((a, m) => a + (m.fifo_cost || 0), 0);
    var despAnt = despesas.filter(d => d.data.substring(0, 7) === mesAnt).reduce((a, d) => a + d.valor, 0);
    var lucroAnt = (recAnt - custAnt) - despAnt;

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
        <div id="pdf-content" style="font-family:sans-serif; color:#000; padding:20px; max-width:800px; margin:0 auto; background:#fff;">
            <div style="text-align:center; margin-bottom:20px;">
                <h2 style="margin:0; font-size:24px;">PINTO'S BAR</h2>
                <div style="font-size:14px; color:#555;">Relatório de Fecho e Performance Mensal</div>
                <div style="font-weight:bold; margin-top:5px; font-size:18px;">Mês: ${mesSel.split('-').reverse().join('/')}</div>
            </div>
            
            <div style="display:flex; justify-content:space-between; margin-bottom:20px; border-bottom:2px solid #000; padding-bottom:10px;">
                <div style="font-size:16px;"><b>Receita Total:</b> ${receita.toLocaleString()} MZN</div>
                <div style="font-size:16px;"><b>Despesas Totais:</b> ${totalDespesas.toLocaleString()} MZN</div>
                <div style="font-size:16px;"><b>Líquido Real:</b> <span style="color:${lucroLiquido >= 0 ? '#3B6D11' : '#A32D2D'};">${lucroLiquido.toLocaleString()} MZN</span></div>
            </div>

            <div style="margin-bottom:20px;">
                <h3 style="margin-bottom:10px; border-bottom:1px solid #ddd; padding-bottom:5px;">📊 Insights Clínicos do Mês</h3>
                <ul style="line-height:1.6; font-size:15px;">
                    <li><b>Comparação Mensal:</b> O lucro Líquido ${percL >= 0 ? 'cresceu' : 'desceu'} <span style="font-weight:bold;color:${percL >= 0 ? 'green' : 'red'}">${percL > 0 ? '+' + percL : percL}%</span> em comparação ao mês passado (${lucroAnt.toLocaleString()} MZN).</li>
                    <li><b>Produto mais vendido:</b> O seu best-seller do mês foi "${topProd}".</li>
                    <li><b>O Melhor Dia do Mês:</b> O dia com mais margens de lucro foi: ${melhorDia ? melhorDia.split('-').reverse().join('/') : 'N/A'} gerando ${maxL.toLocaleString()} MZN de lucro bruto.</li>
                    <li><b>Margem Bruta Média MZN:</b> Ao longo de todo o mês, cada garrafa vendida lucrou na média ${receita > 0 ? Math.round(lucroBruto / receita * 100) : 0}% sob o preço do Custo Real Dinâmico.</li>
                    <li><b>Buraco de Quebras MZN:</b> Em mercadorias danificadas as perdas reflectem exactamente ${totalQuebras.toLocaleString()} MZN (do preço de compra perdido).</li>
                </ul>
            </div>

            <div style="margin-bottom:20px;">
                <h3 style="margin-bottom:10px; border-bottom:1px solid #ddd; padding-bottom:5px;">📈 Evolução do Lucro Bruto Diário</h3>
                <div style="height:300px; width:100%;">
                    <canvas id="printChartMensal"></canvas>
                </div>
            </div>
            <div style="text-align:center; font-size:11px; margin-top:40px; color:#777;">Processado por Computador (Sistema de Gestão Quinina)</div>
        </div>
    `;

    var ctx = document.getElementById('printChartMensal');
    if (window.pChartMensal) window.pChartMensal.destroy();
    window.pChartMensal = new Chart(ctx, {
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
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false } }
        }
    });
}

// ====================== DOCUMENTOS ======================
function populateDocProdutoSelect() {
    var sel = document.getElementById('doc-produto');
    if (sel) sel.innerHTML = produtos.map(function (p) { return '<option value="' + p.id + '">' + p.nome + ' (' + p.venda + ' MZN)</option>'; }).join('');
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
        return '<tr><td>' + item.nome + '</td><td>' + item.qtd + '</td><td>' + item.preco + '</td><td>' + item.total.toLocaleString() + '</td>' +
            '<td><button class="btn btn-danger" onclick="removeDocItem(' + i + ')">X</button></td></tr>';
    }).join('');
    var subtotal = docItems.reduce(function (acc, it) { return acc + it.total; }, 0);
    var desconto = calcDesconto(subtotal);
    var t = subtotal - desconto;
    document.getElementById('doc-subtotal').textContent = subtotal.toLocaleString();
    document.getElementById('doc-desconto-calc').textContent = desconto.toLocaleString();
    document.getElementById('doc-total').textContent = Math.max(t, 0).toLocaleString();
}

async function saveAndPrintDoc() {
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

        printDoc(doc);
        docItems = [];
        document.getElementById('doc-cliente').value = '';
        document.getElementById('doc-desconto').value = '0';
        renderDocList(); renderDocsHistory();
    } else { showNotification('Erro ao gravar documento: ' + (dRes.error ? dRes.error.message : '')); }
}

async function syncInvoiceToStock(doc) {
    if (doc.tipo !== 'factura') return;
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
                    metodo_pagamento: 'CASH' // Assume CASH default para facturas simplificadas
                });
                await sb.from(PREFIX + 'produtos').update({ quantidade: p.qtd }).eq('id', p.id);
            }
        }
        if (newMovs.length > 0) {
            await sb.from(PREFIX + 'movimentos').insert(newMovs);
        }
        await fetchData(); // Recarregar dados para garantir lucros/dashboard correctos
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
    var rows = details.items.map(function (item) {
        return '<tr style="border-bottom:1px dashed #ccc;"><td style="padding:4px 0;">' + item.nome + '</td>' +
            '<td style="padding:4px 0;text-align:right;">' + item.qtd + '</td>' +
            '<td style="padding:4px 0;text-align:right;">' + item.preco + '</td>' +
            '<td style="padding:4px 0;text-align:right;">' + item.total.toFixed(2) + '</td></tr>';
    });
    printArea.innerHTML =
        '<div style="font-family:monospace; color:#000; width:100%; max-width:800px; margin:0 auto; padding:20px;">' +
        '<div style="text-align:center; font-size:24px; font-weight:bold; margin-bottom:10px;">QUININA BOTTLE STORE</div>' +
        '<div style="text-align:center; font-size:14px; margin-bottom:20px;">Nuit: -------- | Contacto: --------</div>' +
        '<div style="display:flex; justify-content:space-between; margin-bottom:20px; font-size:14px;">' +
        '<div><b>' + docName + ' N.º:</b> ' + doc.id + '<br><b>Data:</b> ' + doc.data + '</div>' +
        '<div style="text-align:right;"><b>Cliente:</b> ' + doc.cliente + '</div></div>' +
        '<table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:20px;">' +
        '<thead style="border-bottom:2px solid #000; border-top:2px solid #000;">' +
        '<tr><th style="padding:8px 0; text-align:left;">Descrição</th><th style="padding:8px 0; text-align:right;">Qtd</th><th style="padding:8px 0; text-align:right;">Preço</th><th style="padding:8px 0; text-align:right;">Total(MZN)</th></tr></thead>' +
        '<tbody>' + rows.join('') + '</tbody></table>' +
        '<div style="text-align:right; font-size:14px;">' +
        '<div>Subtotal: ' + (doc.total + (details.desconto || 0)).toFixed(2) + ' MZN</div>' +
        (details.desconto > 0 ? '<div>Desconto: -' + details.desconto.toFixed(2) + ' MZN</div>' : '') +
        '<div style="font-size:18px; font-weight:bold; margin-top:10px;">TOTAL: ' + doc.total.toFixed(2) + ' MZN</div></div>' +
        '<div style="text-align:center; font-size:12px; margin-top:50px; border-top:1px dashed #ccc; padding-top:10px;">Agradecemos a sua preferência. Volte sempre.<br> Processado por Computador.</div></div>';
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
    // Increased to 1500ms as requested for large purchase lists
    setTimeout(function() {
        html2pdf().set(opt).from(element).save().then(function () {
            element.style.cssText = origStyle;
        }).catch(function (err) {
            console.error('PDF error:', err);
            element.style.cssText = origStyle;
        });
    }, 1500);
}

function printDoc(doc) {
    prepareDocPrintArea(doc);
    window.print();
}

function renderDocsHistory() {
    var cont = document.getElementById('doc-history');
    if (!cont) return;
    cont.innerHTML = documentos.length ?
        '<div class="table-responsive"><table><thead><tr><th>N.º</th><th>Data</th><th>Tipo</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Acções</th></tr></thead><tbody>' +
        documentos.map(function (d) {
            var isEliminado = d.detalhes && d.detalhes.status === 'eliminado';
            var rowClass = isEliminado ? 'class="cancelled-doc"' : '';
            return '<tr ' + rowClass + '><td>#' + d.id + '</td><td style="font-size:12px;color:var(--color-text-secondary);">' + d.data + '</td>' +
                '<td><span class="badge ' + (d.tipo === 'factura' ? 'badge-ok' : 'badge-low') + '">' + d.tipo.toUpperCase() + '</span></td>' +
                '<td>' + d.cliente + '</td>' +
                '<td style="font-weight:bold;">' + d.total.toLocaleString() + ' MZN</td>' +
                '<td>' + (isEliminado ? '<span class="cancelled-label">Eliminado</span>' : 'Ativo') + '</td>' +
                '<td><div style="display:flex;gap:5px;">' +
                '<button class="btn" style="font-size:11px;padding:3px 8px;background:#378ADD;color:#fff;border:none;" onclick="downloadPDFFromHistory(' + d.id + ')">PDF</button>' +
                (!isEliminado ? '<button class="btn btn-danger" style="font-size:11px;padding:3px 8px;" onclick="deleteDocumento(' + d.id + ')">Eliminar</button>' : '') +
                '</div></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">Nenhum documento emitido.</div>';
}

async function deleteDocumento(id) {
    if (!confirm('Deseja eliminar esta factura? O stock será restaurado.')) return;
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
        renderDocsHistory(); renderStock(); renderDashboard(); renderMovimentos();
    } catch (err) {
        showNotification('Erro ao eliminar.');
    }
}

function printDocFromHistory(id) {
    var doc = documentos.find(function (d) { return d.id === id; });
    if (doc) printDoc(doc);
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
    if (!sb) return;

    // Caso de Bypass para Modo Demo
    if (localStorage.getItem('pintos_demo_active') === 'true') {
        userRole = 'gestor'; // Permitir ver tudo no modo demo
        document.getElementById('login-screen').style.display = 'none';
        document.querySelector('.app').style.display = 'block';
        document.getElementById('user-label').textContent = 'demo@pintos.bar (MODO TESTE)';
        applyRoleRestrictions();
        initApp();
        return;
    }

    const { data } = await sb.auth.getSession();
    if (data.session) {
        const email = data.session.user.email;
        const { data: roleData } = await sb.from('user_roles').select('role').eq('user_email', email).maybeSingle();
        userRole = roleData ? roleData.role : 'vendedor';
        
        document.getElementById('login-screen').style.display = 'none';
        document.querySelector('.app').style.display = 'block';
        document.getElementById('user-label').textContent = email + ' (' + userRole + ')';
        
        applyRoleRestrictions();
        initApp();
    }
}

async function loginUser() {
    const email = document.getElementById('l-email').value.trim();
    const pass = document.getElementById('l-pass').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = 'A entrar...';

    // BYPASS para conta DEMO
    if (email === 'demo@pintos.bar' && pass === 'demo123') {
        localStorage.setItem('pintos_demo_active', 'true');
        showNotification('Entrando em Modo Demonstração...', 'info');
        setTimeout(() => window.location.reload(), 1000);
        return;
    }

    if (!sb) return;

    const { data, error } = await sb.auth.signInWithPassword({ email: email, password: pass });
    if (error) {
        errorEl.textContent = 'Erro: ' + error.message;
        return;
    }
    
    localStorage.removeItem('pintos_demo_active'); // Importante: limpar modo demo em login real
    showNotification('Login efetuado com sucesso!', 'success');
    
    setTimeout(() => {
        // Se a URL contiver parâmetros de demo, limpa-os e recarrega
        if (window.location.search.includes('demo')) {
            window.location.href = window.location.pathname;
        } else {
            window.location.reload();
        }
    }, 1000);
}

async function logoutUser() {
    if (sb) await sb.auth.signOut();
    localStorage.removeItem('pintos_demo_active');
    window.location.reload();
}

async function applyRoleRestrictions() {
    const isGestor = userRole === 'gestor';
    const btns = document.querySelectorAll('.nav-btn');
    
    btns.forEach(btn => {
        const action = btn.getAttribute('onclick') || '';
        if (action.includes('dashboard') || action.includes('relatorios') || 
            action.includes('alertas') || action.includes('necessidades') || 
            action.includes('caixa') || action.includes('despesas') || 
            action.includes('planocompras') || action.includes('relmensal') || 
            action.includes('saldo')) {
            btn.style.display = isGestor ? 'inline-block' : 'none';
        }
    });

    // Restrições na aba Movimentos
    const btnEntrada = document.getElementById('tipo-entrada');
    const inputPreco = document.getElementById('m-preco');
    const groupData = document.getElementById('m-data').closest('.form-group');
    const groupNota = document.getElementById('m-nota').closest('.form-group');
    const groupCusto = document.getElementById('group-custo');

    if (userRole === 'vendedor') {
        if (btnEntrada) btnEntrada.style.display = 'none';
        if (inputPreco) inputPreco.readOnly = true;
        if (groupData) groupData.style.display = 'none';
        if (groupNota) groupNota.style.display = 'none';
        if (groupCusto) groupCusto.style.display = 'none';
        // Forçar para aba Saída se estiver no modo vendedor
        if (tipoActivo === 'entrada') setTipo('saida');
    } else {
        if (btnEntrada) btnEntrada.style.display = 'inline-block';
        if (inputPreco) inputPreco.readOnly = false;
        if (groupData) groupData.style.display = 'flex';
        if (groupNota) groupNota.style.display = 'flex';
        // No modo gestor, o group-custo é gerido pelo setTipo, mas garantimos que está visível se for entrada
        if (tipoActivo === 'entrada' && groupCusto) groupCusto.style.display = 'flex';
    }

    if (!isGestor) {
        showSection('mesas');
    } else {
        showSection('dashboard');
    }
}

async function initApp() {
    try {
        setDefaultDates();
        await fetchData();
        renderDashboard();
        renderMovimentos();
        renderDespesas();
        renderCaixa();
        renderNecessidades();
        renderDocsHistory();
        var ac = document.getElementById('alert-count');
        if (ac) ac.textContent = produtos.filter(function (p) { return p.qtd <= p.min; }).length || '';
    } catch (e) {
        console.error('INIT APP ERROR:', e);
    }
}

// Check session on load
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
        <div class="metric-card"><div class="metric-label">Banco / Transf.</div><div class="metric-value">${(totals.BANCO + totals.TRANSFERENCIA).toLocaleString()} MZN</div></div>
    `;

    listEl.innerHTML = saldoMovimentos.length ?
        '<div class="table-responsive"><table><thead><tr><th>Data</th><th>Tipo</th><th>Método</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>' +
        saldoMovimentos.map(m => `
            <tr>
                <td>${new Date(m.data).toLocaleDateString()}</td>
                <td><span class="badge ${m.tipo === 'investimento' ? 'badge-ok' : 'badge-low'}">${m.tipo.toUpperCase()}</span></td>
                <td>${m.metodo}</td>
                <td>${m.descricao || '—'}</td>
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
            <h3 style="margin-bottom:10px;">Mesa ${i}</h3>
            <div class="mesa-badge" style="background:${client ? '#FCEBEB' : '#EAF3DE'}; color:${client ? '#A32D2D' : '#3B6D11'};">${client ? 'Ocupada' : 'Livre'}</div>
            ${client ? `<div style="font-size:12px; margin-top:10px; font-weight:bold;">${client.nome_cliente}</div>` : ''}
            ${totalVal > 0 ? `<div style="font-size:14px; margin-top:5px; color:#185FA5;">Total: ${totalVal.toLocaleString()} MT</div>` : ''}
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
    title.textContent = 'Mesa ' + n;
    
    renderMesaContent();
}

function renderMesaContent() {
    const clientListEl = document.getElementById('active-clients');
    const clients = mesaClientes.filter(c => c.mesa_numero === activeMesa && c.status === 'ativo');
    
    if (clients.length === 0) {
        clientListEl.innerHTML = '<div class="empty">Nenhum cliente activo nesta mesa.</div>';
        return;
    }

    clientListEl.innerHTML = clients.map(c => `
        <div class="card" style="border:1px solid #ddd; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                <div>
                    <strong style="font-size:16px;">${c.nome_cliente}</strong>
                    ${c.nota_aparencia ? `<div style="font-size:12px; color:#666;">Obs: ${c.nota_aparencia}</div>` : ''}
                </div>
                <button class="btn btn-primary" onclick="openPayment(${c.id})">Finalizar e Pagar</button>
            </div>
            
            <div style="background:#f9f9f9; padding:10px; border-radius:5px;">
                <div style="display:flex; gap:10px; margin-bottom:10px;">
                    <select id="p-prod-${c.id}" style="flex:1;">${produtos.map(p => `<option value="${p.id}">${p.nome} (${p.venda} MT)</option>`).join('')}</select>
                    <input id="p-qtd-${c.id}" type="number" value="1" style="width:60px;">
                    <button class="btn" onclick="addPedidoMesa(${c.id})">+ Pedido</button>
                </div>
                <table style="width:100%; font-size:12px;">
                    <thead><tr style="text-align:left;"><th>Item</th><th>Qtd</th><th>Preço</th><th>Total</th><th style="width:20px;"></th></tr></thead>
                    <tbody>
                        ${(c.mesas_pedidos || []).map(p => `
                            <tr>
                                <td>${p.produto_nome}</td>
                                <td>${p.quantidade}</td>
                                <td>${p.preco_unitario}</td>
                                <td>${p.total} MT</td>
                                <td><button style="border:none; background:none; color:#E24B4A; cursor:pointer; font-weight:bold;" onclick="removePedidoMesa(${p.id}, ${c.id})">🗑</button></td>
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
    if (!nome) { showNotification('Dê um nome ou característica ao cliente'); return; }

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

async function removePedidoMesa(pedidoId, clientId) {
    if (!confirm('Eliminar este pedido e devolver o stock?')) return;
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
    const payloadDoc = {
        tipo: 'factura',
        cliente: currentPayClient.nome_cliente + ' (Mesa ' + currentPayClient.mesa_numero + ')',
        total: currentPayTotal,
        metodo_pagamento: payments.map(p => p.metodo).join(' / '),
        detalhes: { 
            items: currentPayClient.mesas_pedidos.map(p => ({ nome: p.produto_nome, id: p.produto_id, qtd: p.quantidade, preco: p.preco_unitario, total: p.total })),
            pagamentos: payments
        }
    };

    const { data: docRes, error: docErr } = await sb.from(PREFIX + 'documentos').insert([payloadDoc]).select();
    
    // Debug fail: se falhar o select (RLS), o documento ainda assim foi inserido.
    // Tentamos recuperar o ID mais recente se docRes for vazio mas sem erro.
    let invoice = docRes && docRes.length > 0 ? docRes[0] : null;
    if (!docErr && !invoice) {
        const { data: latest } = await sb.from(PREFIX + 'documentos').select('*').eq('cliente', payloadDoc.cliente).order('created_at', { ascending: false }).limit(1);
        if (latest) invoice = latest[0];
    }

    if (docErr || !invoice) { 
        console.error('Erro Fatura:', docErr);
        showNotification('Erro ao gerar factura. Tente novamente.', 'error'); 
        return; 
    }

    // 2. Registar em Saldo Caixa (Fluxo Financeiro)
    for (const p of payments) {
        if (p.valor > 0) {
            await sb.from(PREFIX + 'saldo_caixa').insert([{
                tipo: 'investimento', // Venda conta como entrada de capital operacional
                metodo: p.metodo,
                valor: p.valor,
                descricao: 'Venda Mesa ' + currentPayClient.mesa_numero + ' (' + currentPayClient.nome_cliente + ')'
            }]);
        }
    }

    // 3. Fechar cliente e sincronizar stock
    await sb.from(PREFIX + 'mesas_clientes').update({ status: 'pago' }).eq('id', currentPayClient.id);
    currentPayClient.status = 'pago';
    
    await syncInvoiceToStock(docRes[0]);
    
    showNotification('Pagamento e Factura concluídos!', 'success');
    closePayment();
    voltarMesas();
    fetchData().then(renderMesas);
}



// ====================== PLANO DE COMPRAS ======================
function renderPlanoCompras() {
    populatePlanoProdutoSelect();
    var tbody = document.getElementById('plano-items');
    if (!tbody) return;
    tbody.innerHTML = planoItems.map(function (item, i) {
        return '<tr><td>' + item.nome + '</td>' +
            '<td><input type="number" value="' + item.qtd + '" min="1" style="width:60px;padding:3px 6px;" onchange="updatePlanoQtd(' + i + ',this.value)"></td>' +
            '<td>' + item.custo.toLocaleString() + '</td>' +
            '<td style="font-weight:500;">' + (item.qtd * item.custo).toLocaleString() + '</td>' +
            '<td>' + (item.forn || '-') + '</td>' +
            '<td><button class="btn btn-danger" onclick="removePlanoItem(' + i + ')">X</button></td></tr>';
    }).join('');
    var totalPlano = planoItems.reduce(function (a, it) { return a + (it.qtd * it.custo); }, 0);
    document.getElementById('plano-total').textContent = totalPlano.toLocaleString();
    document.getElementById('plano-count').textContent = planoItems.length;
}

function populatePlanoProdutoSelect() {
    var sel = document.getElementById('plano-produto');
    if (sel) sel.innerHTML = produtos.map(function (p) { return '<option value="' + p.id + '">' + p.nome + ' (' + p.custo + ' MZN)</option>'; }).join('');
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

function clearPlano() {
    console.log('clearPlano triggered, items:', planoItems.length);
    if (planoItems.length === 0) {
        showNotification('O plano já está vazio.', 'info');
        return;
    }
    if (confirm('Deseja limpar todos os itens do plano de compras?')) {
        planoItems = [];
        renderPlanoCompras();
        showNotification('Plano limpo com sucesso!', 'success');
    }
}

function downloadPlanoPDF() {
    if (planoItems.length === 0) { showNotification('Adicione produtos ao plano primeiro.'); return; }
    var totalPlano = planoItems.reduce(function (a, it) { return a + (it.qtd * it.custo); }, 0);
    var today = new Date().toLocaleDateString('pt-MZ', { year: 'numeric', month: 'long', day: 'numeric' });
    var rows = planoItems.map(function (item, i) {
        return '<tr style="border-bottom:1px solid #eee;">' +
            '<td style="padding:6px 8px;">' + (i + 1) + '</td>' +
            '<td style="padding:6px 8px;">' + item.nome + '</td>' +
            '<td style="padding:6px 8px;text-align:center;">' + item.qtd + '</td>' +
            '<td style="padding:6px 8px;text-align:right;">' + item.custo.toLocaleString() + '</td>' +
            '<td style="padding:6px 8px;text-align:right;font-weight:bold;">' + (item.qtd * item.custo).toLocaleString() + '</td>' +
            '<td style="padding:6px 8px;">' + item.forn + '</td>' +
            '<td style="padding:6px 8px;">☐</td></tr>';
    });

    var printArea = document.getElementById('print-area');
    printArea.innerHTML =
        '<div style="font-family:sans-serif; color:#000; padding:20px; max-width:800px; margin:0 auto; background:#fff;">' +
        '<div style="text-align:center; margin-bottom:20px;">' +
        '<h2 style="margin:0; font-size:22px;">QUININA BOTTLE STORE</h2>' +
        '<div style="font-size:16px; font-weight:bold; margin-top:5px;">PLANO DE COMPRAS</div>' +
        '<div style="font-size:13px; color:#555; margin-top:3px;">' + today + '</div></div>' +
        '<table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:20px;">' +
        '<thead style="background:#f0f0f0;">' +
        '<tr><th style="padding:8px;text-align:left;">#</th><th style="padding:8px;text-align:left;">Produto</th>' +
        '<th style="padding:8px;text-align:center;">Qtd</th><th style="padding:8px;text-align:right;">Custo Unit.</th>' +
        '<th style="padding:8px;text-align:right;">Custo Total</th><th style="padding:8px;text-align:left;">Fornecedor</th>' +
        '<th style="padding:8px;text-align:center;">✓</th></tr></thead>' +
        '<tbody>' + rows.join('') + '</tbody></table>' +
        '<div style="text-align:right; font-size:16px; font-weight:bold; border-top:2px solid #000; padding-top:10px;">' +
        'TOTAL ESTIMADO: ' + totalPlano.toLocaleString() + ' MZN</div>' +
        '<div style="margin-top:40px; font-size:12px; color:#777;">' +
        '<div style="display:flex; justify-content:space-between;"><div>_________________________<br>Assinatura do Comprador</div>' +
        '<div>_________________________<br>Aprovado por</div></div></div>' +
        '<div style="text-align:center; font-size:11px; margin-top:30px; color:#999;">Processado por Computador (Sistema de Gestão Quinina)</div></div>';

    generatePDF(printArea, 'Plano_Compras_' + new Date().toISOString().split('T')[0] + '.pdf');
}
async function confirmarCompra() {
    if (planoItems.length === 0) { showNotification('O plano de compras está vazio.', 'info'); return; }
    if (!confirm('Deseja confirmar o recebimento e actualizar o stock? ' + planoItems.length + ' produtos serão adicionados.')) return;

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
        renderPlanoCompras(); renderStock(); renderDashboard();
    } catch (err) {
        console.error('Erro na confirmação:', err);
        showNotification('Erro ao confirmar compra.', 'error');
    }
}
