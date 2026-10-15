function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildFaturacaoPrintHtml({ pharmacy, periodLabel, metricsHtml, cards, chartDataUrls = [] }) {
  const safePharmacy = pharmacy || {};
  const cardHtml = (cards || []).map((card, index) => {
    let html = card.innerHTML || '';
    if (html.includes('<canvas') && chartDataUrls[index]) {
      html = html.replace(/<canvas[^>]*><\/canvas>/, `<img src="${chartDataUrls[index]}" style="width:100%; height:auto;">`);
    }
    return `<div class="card">${html}</div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><title>Relatório de Faturação</title>
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
      <h2>${escapeHtml(safePharmacy.nome || 'Farmácia')}</h2>
      <div style="font-size:12px; color:#555;">${escapeHtml(safePharmacy.endereco || '')} | NUIT: ${escapeHtml(safePharmacy.nuit || '')}</div>
      <div class="subtitle">RELATÓRIO DE FATURAÇÃO E DASHBOARD</div>
      <div class="date">${escapeHtml(new Date().toLocaleDateString('pt-MZ', { year: 'numeric', month: 'long', day: 'numeric' }))} | Período: ${escapeHtml(periodLabel || '')}</div>
    </div>
    <div class="card">
      <div class="card-title">Métricas Gerais</div>
      <div class="metrics">${metricsHtml || ''}</div>
    </div>
    ${cardHtml}
    <div class="footer">Processado por Computador (${escapeHtml(safePharmacy.nome || 'Farmácia')})</div>
    </body></html>`;
}

export function getFaturacaoPrintSources(doc = document) {
  if (!doc || typeof doc.getElementById !== 'function') {
    return { metricsHtml: '', chartDataUrls: [], cards: [] };
  }

  const relRoot = doc.getElementById('sec-relatorios');
  const panelRoot = doc.getElementById('sec-painel');
  const sourceRoot = relRoot || panelRoot;

  const metricsEl = doc.getElementById('rel-metrics') || doc.getElementById('painel-summary');
  const metricsHtml = metricsEl ? metricsEl.innerHTML : '';

  const canvasEls = sourceRoot
    ? Array.from(sourceRoot.querySelectorAll('canvas'))
    : [];

  const cards = sourceRoot
    ? Array.from(sourceRoot.querySelectorAll('.card')).filter((card) => !card.querySelector('.btn'))
    : [];

  return {
    metricsHtml,
    chartDataUrls: canvasEls.map((canvas) => canvas.toDataURL('image/png')),
    cards,
  };
}
