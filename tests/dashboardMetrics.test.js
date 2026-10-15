import { describe, it, expect } from 'vitest';
import { buildPeriodSeries, calculatePeriodMetrics, calculatePeriodSummary, matchesPeriod } from '../src/dashboardMetrics.js';

function buildMovimento({ tipo, data, qtd = 1, total = 0, fifo_cost = 0 }) {
  return { tipo, data, qtd, total, fifo_cost };
}

describe('dashboardMetrics', () => {
  it('calcula receita, custo, lucro bruto, lucro líquido e unidades vendidas de forma consistente', () => {
    const movimentos = [
      { tipo: 'saida', data: '2026-10-01', qtd: 2, total: 1000, fifo_cost: 600 },
      { tipo: 'saida', data: '2026-10-02', qtd: 3, total: 1500, fifo_cost: 900 },
      { tipo: 'quebra', data: '2026-10-02', qtd: 1, total: 200, fifo_cost: 180 },
      { tipo: 'entrada', data: '2026-10-02', qtd: 5, total: 1200, fifo_cost: 500 }
    ];
    const despesas = [{ data: '2026-10-02', valor: 200 }];

    const result = calculatePeriodMetrics(movimentos, despesas, 'mensal', {
      refDate: '2026-10-15',
      month: '2026-10'
    });

    expect(result.revenue).toBe(2500);
    expect(result.unitsSold).toBe(5);
    expect(result.grossProfit).toBe(1000);
    expect(result.breakageCost).toBe(180);
    expect(result.expenses).toBe(200);
    expect(result.netProfit).toBe(620);
  });

  it('respeita o período mensal e ignora dados fora do intervalo', () => {
    const movimentos = [
      { tipo: 'saida', data: '2026-09-30', qtd: 4, total: 2000, fifo_cost: 1200 },
      { tipo: 'saida', data: '2026-10-05', qtd: 1, total: 500, fifo_cost: 300 },
      { tipo: 'saida', data: '2026-10-15', qtd: 2, total: 800, fifo_cost: 450 }
    ];
    const despesas = [{ data: '2026-10-15', valor: 100 }];

    const result = calculatePeriodMetrics(movimentos, despesas, 'mensal', {
      refDate: '2026-10-15',
      month: '2026-10'
    });

    expect(result.revenue).toBe(1300);
    expect(result.grossProfit).toBe(550);
    expect(result.netProfit).toBe(450);
    expect(result.unitsSold).toBe(3);
  });

  it('agrega o resumo do período sem duplicar valores', () => {
    const movimentos = [
      { tipo: 'saida', data: '2026-10-01', qtd: 2, total: 1000, fifo_cost: 700 },
      { tipo: 'saida', data: '2026-10-03', qtd: 3, total: 1800, fifo_cost: 1000 },
      { tipo: 'quebra', data: '2026-10-03', qtd: 2, total: 400, fifo_cost: 350 }
    ];
    const despesas = [{ data: '2026-10-03', valor: 250 }];

    const summary = calculatePeriodSummary(movimentos, despesas, 'mensal', {
      refDate: '2026-10-15',
      month: '2026-10'
    });

    expect(summary.revenue).toBe(2800);
    expect(summary.grossProfit).toBe(1100);
    expect(summary.netProfit).toBe(500);
    expect(summary.breakageCost).toBe(350);
    expect(summary.expenses).toBe(250);
    expect(summary.unitsSold).toBe(5);
  });

  it('filtra corretamente um dia específico, ignorando registros de outras datas', () => {
    const movimentos = [
      { tipo: 'saida', data: '2026-10-10', qtd: 2, total: 500, fifo_cost: 250 },
      { tipo: 'saida', data: '2026-10-11', qtd: 4, total: 900, fifo_cost: 500 }
    ];

    expect(matchesPeriod('2026-10-10', 'dia', { refDate: '2026-10-10', dateKey: '2026-10-10' })).toBe(true);
    expect(matchesPeriod('2026-10-11', 'dia', { refDate: '2026-10-10', dateKey: '2026-10-10' })).toBe(false);
    expect(calculatePeriodMetrics(movimentos, [], 'dia', { refDate: '2026-10-10', dateKey: '2026-10-10' }).revenue).toBe(500);
  });

  it('constrói o intervalo de datas corretamente para o período de filtro do dashboard', () => {
    const movimentos = [
      { tipo: 'saida', data: '2026-09-20', qtd: 1, total: 100, fifo_cost: 60 },
      { tipo: 'saida', data: '2026-09-25', qtd: 2, total: 200, fifo_cost: 120 },
      { tipo: 'saida', data: '2026-09-30', qtd: 1, total: 150, fifo_cost: 80 }
    ];

    const result = calculatePeriodMetrics(movimentos, [], 'intervalo', {
      refDate: '2026-09-30',
      startDate: '2026-09-25',
      endDate: '2026-09-30'
    });

    expect(result.revenue).toBe(350);
    expect(result.unitsSold).toBe(3);
    expect(result.grossProfit).toBe(150);
  });

  it('dá como resultado zero sem dados no período, sem quebrar a fórmula', () => {
    const result = calculatePeriodMetrics([], [], 'mensal', {
      refDate: '2026-11-15',
      month: '2026-11'
    });

    expect(result.revenue).toBe(0);
    expect(result.grossProfit).toBe(0);
    expect(result.netProfit).toBe(0);
    expect(result.unitsSold).toBe(0);
  });

  it('calcula a série mensal do dashboard sem duplicar entradas em meses fora do range', () => {
    const movimentos = [
      { tipo: 'saida', data: '2026-09-04', qtd: 1, total: 400, fifo_cost: 250 },
      { tipo: 'saida', data: '2026-10-03', qtd: 2, total: 900, fifo_cost: 500 },
      { tipo: 'saida', data: '2026-11-06', qtd: 3, total: 1200, fifo_cost: 700 },
      { tipo: 'quebra', data: '2026-11-07', qtd: 1, total: 100, fifo_cost: 80 }
    ];

    const series = buildPeriodSeries(movimentos, [], 'mensal', { refDate: '2026-11-15', count: 3 });

    expect(series.labels).toHaveLength(3);
    expect(series.revenue).toEqual([400, 900, 1200]);
    expect(series.profit[2]).toBe(1200 - 700 - 80);
  });

  it('respeita o período semanal e calcula corretamente o intervalo de datas', () => {
    const movimentos = [
      buildMovimento({ tipo: 'saida', data: '2026-10-01', qtd: 2, total: 300, fifo_cost: 180 }),
      buildMovimento({ tipo: 'saida', data: '2026-10-07', qtd: 1, total: 150, fifo_cost: 90 }),
      buildMovimento({ tipo: 'saida', data: '2026-10-20', qtd: 1, total: 200, fifo_cost: 120 })
    ];

    const result = calculatePeriodMetrics(movimentos, [], 'semanal', { refDate: '2026-10-20', count: 3 });
    expect(result.revenue).toBe(650);
    expect(result.unitsSold).toBe(4);
    expect(result.grossProfit).toBe(260);
  });

  it('calcula lucro líquido e perdas para o intervalo anual sem sobrepor valores', () => {
    const movimentos = [
      buildMovimento({ tipo: 'saida', data: '2026-01-05', qtd: 2, total: 500, fifo_cost: 250 }),
      buildMovimento({ tipo: 'saida', data: '2026-12-11', qtd: 3, total: 800, fifo_cost: 450 }),
      buildMovimento({ tipo: 'quebra', data: '2026-12-11', qtd: 1, total: 100, fifo_cost: 60 })
    ];
    const despesas = [{ data: '2026-12-11', valor: 120 }];

    const result = calculatePeriodMetrics(movimentos, despesas, 'anual', { refDate: '2026-12-15' });
    expect(result.revenue).toBe(1300);
    expect(result.breakageCost).toBe(60);
    expect(result.expenses).toBe(120);
    expect(result.netProfit).toBe(1300 - 700 - 60 - 120);
  });
});
