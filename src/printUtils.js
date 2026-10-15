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
