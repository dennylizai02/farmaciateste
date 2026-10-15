import { describe, it, expect } from 'vitest';
import { buildFaturacaoPrintHtml, getFaturacaoPrintSources } from '../src/printUtils.js';

describe('printUtils', () => {
  it('usa o painel como fallback quando o bloco antigo de relatórios não existe', () => {
    const canvas = { toDataURL: () => 'data:image/png;base64,abc' };
    const metricCard = { innerHTML: '<div class="metric-card"><span>Receita</span></div>' };
    const panelCard = { innerHTML: '<canvas></canvas>', querySelector: () => null };

    const fakeDocument = {
      getElementById: (id) => {
        if (id === 'sec-painel') {
          return {
            querySelectorAll: (selector) => {
              if (selector === 'canvas') return [canvas];
              if (selector === '.card') return [panelCard];
              return [];
            },
          };
        }
        if (id === 'painel-summary') return metricCard;
        return null;
      },
    };

    const result = getFaturacaoPrintSources(fakeDocument);

    expect(result.metricsHtml).toContain('Receita');
    expect(result.chartDataUrls).toHaveLength(1);
    expect(result.cards).toHaveLength(1);
  });

  it('constrói o HTML de impressão com dados do painel e com o logo e cabeçalho da farmácia', () => {
    const html = buildFaturacaoPrintHtml({
      pharmacy: { nome: 'Farmacia Nova de Campoane', endereco: 'Boane', nuit: '101738299' },
      periodLabel: 'mensal',
      metricsHtml: '<div class="metric-card"><span>Receita</span></div>',
      cards: [{ innerHTML: '<canvas></canvas><div class="card-title">Dashboard</div>' }],
      chartDataUrls: ['data:image/png;base64,chart']
    });

    expect(html).toContain('Farmacia Nova de Campoane');
    expect(html).toContain('RELATÓRIO DE FATURAÇÃO E DASHBOARD');
    expect(html).toContain('Receita');
    expect(html).toContain('data:image/png;base64,chart');
  });
});
