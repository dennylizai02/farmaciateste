import { describe, it, expect } from 'vitest';
import { getFaturacaoPrintSources } from '../src/printUtils.js';

describe('printUtils', () => {
  it('usa o painel como fallback quando o bloco antigo de relatórios não existe', () => {
    const canvas = { toDataURL: () => 'data:image/png;base64,abc' };
    const metricCard = { innerHTML: '<div class="metric-card"><span>Receita</span></div>' };
    const panelCard = { innerHTML: '<canvas></canvas>', querySelector: (selector) => (selector === '.btn' ? null : null) };

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
});
