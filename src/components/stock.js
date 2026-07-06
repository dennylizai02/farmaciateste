export function renderStock(context) {
  const { produtos, movimentos, userRole, currentSortField, currentSortOrder, showNotification, sb, PREFIX, fetchData, renderRelatorios, renderMovimentos, populateProdutoSelect, getStatus, escapeHTML } = context;
  const q = (document.getElementById('search-prod').value || '').toLowerCase();
  const filtered = produtos.filter(function (p) {
    return p.nome.toLowerCase().indexOf(q) !== -1 || (p.cat || '').toLowerCase().indexOf(q) !== -1;
  });

  filtered.sort(function (a, b) {
    let valA, valB;
    if (currentSortField === 'nome') { valA = a.nome.toLowerCase(); valB = b.nome.toLowerCase(); }
    else if (currentSortField === 'cat') { valA = (a.cat || '').toLowerCase(); valB = (b.cat || '').toLowerCase(); }
    else if (currentSortField === 'forn') { valA = (a.forn || '').toLowerCase(); valB = (b.forn || '').toLowerCase(); }
    else if (currentSortField === 'estado') {
      valA = (a.qtd === 0 ? 0 : (a.qtd <= a.min ? 1 : 2));
      valB = (b.qtd === 0 ? 0 : (b.qtd <= b.min ? 1 : 2));
    }
    else if (currentSortField === 'margem') {
      valA = a.venda > 0 ? (a.venda - a.custo) / a.venda : 0;
      valB = b.venda > 0 ? (b.venda - b.custo) / b.venda : 0;
    }

    if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const totalCustoStock = filtered.reduce((a, p) => a + (p.qtd * p.custo), 0);
  const totalVendaStock = filtered.reduce((a, p) => a + (p.qtd * p.venda), 0);
  const lucroPreviso = totalVendaStock - totalCustoStock;

  const metricsEl = document.getElementById('stock-metrics');
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
        <div class="metric-card"><div class="metric-label">Previsão de Receita</div><div class="metric-value" style="color:#378ADD;">${totalVendaStock.toLocaleString()} MZN</div></div>
      `;
    }
  }

  function getSortIcon(field) {
    if (currentSortField !== field) return '';
    return currentSortOrder === 'asc' ? ' ↑' : ' ↓';
  }

  const isGestor = userRole === 'gestor';
  const header = '<table><thead><tr>' +
    '<th onclick="handleSort(\'nome\')" style="cursor:pointer; user-select:none;">Produto' + getSortIcon('nome') + '</th>' +
    '<th onclick="handleSort(\'cat\')" style="cursor:pointer; user-select:none;">Categoria' + getSortIcon('cat') + '</th>' +
    '<th>Qtd</th>' +
    (isGestor ? '<th>Mín.</th><th>Custo (MT)</th>' : '') +
    '<th>Venda (MT)</th>' +
    (isGestor ? '<th onclick="handleSort(\'margem\')" style="cursor:pointer; user-select:none;">Margem' + getSortIcon('margem') + '</th>' : '') +
    '<th onclick="handleSort(\'forn\')" style="cursor:pointer; user-select:none;">Fornecedor' + getSortIcon('forn') + '</th>' +
    '<th onclick="handleSort(\'estado\')" style="cursor:pointer; user-select:none;">Estado' + getSortIcon('estado') + '</th>' +
    (isGestor ? '<th>Acções</th>' : '') + '</tr></thead><tbody>';

  const stockHtml = filtered.length ? header + filtered.map(function (p) {
    let row = '<tr><td>' + escapeHTML(p.nome) + '</td><td>' + escapeHTML(p.cat) + '</td>' +
      '<td><input type="number" value="' + p.qtd + '" min="0" style="width:60px;padding:3px 6px;" onchange="updateQtd(' + p.id + ',this.value)" ' + (isGestor ? '' : 'disabled') + '></td>';

    if (isGestor) {
      row += '<td><input type="number" value="' + p.min + '" min="0" style="width:60px;padding:3px 6px;" onchange="updateField(' + p.id + ',\'stock_minimo\',this.value)"></td>' +
        '<td><input type="number" value="' + p.custo + '" min="0" style="width:80px;padding:3px 6px;" onchange="updateField(' + p.id + ',\'preco_custo\',this.value)"></td>';
    }

    row += '<td><input type="number" value="' + p.venda + '" min="0" style="width:80px;padding:3px 6px;" onchange="updateField(' + p.id + ',\'preco_venda\',this.value)" ' + (isGestor ? '' : 'disabled') + '></td>';

    if (isGestor) {
      row += '<td style="color:#3B6D11;">' + (p.venda > 0 ? Math.round((p.venda - p.custo) / p.venda * 100) : 0) + '%</td>';
    }

    row += '<td>' + (isGestor
      ? '<input type="text" value="' + escapeHTML(p.forn || '') + '" style="width:120px;padding:3px 6px;font-size:12px;" onchange="updateFornecedor(' + p.id + ',this.value)">'
      : escapeHTML(p.forn || '—')) + '</td>';

    row += '<td>' + getStatus(p) + '</td>';

    if (isGestor) {
      row += '<td><button class="btn btn-danger" onclick="removeProduto(' + p.id + ')">Remover</button></td>';
    }

    row += '</tr>';
    return row;
  }).join('') + '</tbody></table>' : '<div class="empty">Nenhum produto encontrado</div>';

  const stockElement = document.getElementById('stock-table');
  if (stockElement) {
    stockElement.innerHTML = stockHtml;
  }

  renderQuarentena(context);
}

function renderQuarentena(context) {
  const { movimentos, produtos } = context;
  const qList = document.getElementById('quarentena-list');
  if (!qList) return;

  const qs = movimentos.filter(m => m.tipo === 'quebra' && m.nota === '[Quarentena]');
  if (qs.length === 0) {
    qList.innerHTML = '<tr><td colspan="4" class="empty">Nenhum produto em quarentena.</td></tr>';
    return;
  }

  qList.innerHTML = qs.map(function (m) {
    const p = produtos.find(x => x.id === m.prodId);
    const pNome = p ? p.nome : 'Produto Removido';
    const mDate = new Date(m.dataHora || m.data).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' });
    return '<tr>' +
      '<td>' + escapeHTML(mDate) + '</td>' +
      '<td>' + escapeHTML(pNome) + '</td>' +
      '<td>' + m.qtd + '</td>' +
      '<td><button class="btn btn-primary" style="padding:4px 8px; font-size:11px;" onclick="devolverQuarentena(' + m.id + ')">Devolver ao Stock</button></td>' +
      '</tr>';
  }).join('');
}

export function getStatus(p) {
  if (p.qtd === 0) return '<span class="badge badge-out">Esgotado</span>';
  if (p.qtd <= p.min) return '<span class="badge badge-low">Stock baixo</span>';
  return '<span class="badge badge-ok">OK</span>';
}
