const toNumber = (value) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateKey = (value) => {
  const date = toDate(value);
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function matchesPeriod(dateValue, periodoActivo = 'mensal', options = {}) {
  const value = dateValue ?? '';
  const targetKey = dateKey(value);
  if (!targetKey) return false;

  const refDate = toDate(options.refDate) || new Date();
  const refKey = dateKey(refDate);

  if (periodoActivo === 'diário') {
    const count = Math.max(1, Number(options.count || 7));
    const start = new Date(refDate);
    start.setDate(refDate.getDate() - (count - 1));
    return toDate(targetKey) >= start && toDate(targetKey) <= refDate;
  }

  if (periodoActivo === 'semanal') {
    const weeks = Math.max(1, Number(options.count || 4));
    const start = new Date(refDate);
    start.setDate(refDate.getDate() - (weeks * 7 - 1));
    return toDate(targetKey) >= start && toDate(targetKey) <= refDate;
  }

  if (periodoActivo === 'mensal') {
    const month = options.month || refDate.toISOString().slice(0, 7);
    return targetKey.startsWith(month);
  }

  if (periodoActivo === 'trimestral') {
    const currentQuarter = Math.floor(refDate.getMonth() / 3);
    const sameYear = new Date(targetKey).getFullYear() === refDate.getFullYear();
    const targetQuarter = Math.floor(new Date(targetKey).getMonth() / 3);
    return sameYear && targetQuarter === currentQuarter;
  }

  if (periodoActivo === 'anual') {
    return new Date(targetKey).getFullYear() === refDate.getFullYear();
  }

  if (periodoActivo === 'dia') {
    const chosen = options.dateKey || options.startDate || refKey;
    return targetKey === chosen;
  }

  if (periodoActivo === 'intervalo') {
    const startDate = options.startDate || options.dateKey || refKey;
    const endDate = options.endDate || refKey;
    return targetKey >= startDate && targetKey <= endDate;
  }

  return true;
}

export function calculatePeriodMetrics(movimentos = [], despesas = [], periodoActivo = 'mensal', options = {}) {
  const filteredMovimentos = (movimentos || []).filter((m) => matchesPeriod(m?.data, periodoActivo, options));
  const filteredDespesas = (despesas || []).filter((d) => matchesPeriod(d?.data, periodoActivo, options));

  const saidas = filteredMovimentos.filter((m) => m?.tipo === 'saida');
  const quebras = filteredMovimentos.filter((m) => m?.tipo === 'quebra');

  const revenue = saidas.reduce((acc, movement) => acc + toNumber(movement.total), 0);
  const costOfGoodsSold = saidas.reduce((acc, movement) => acc + toNumber(movement.fifo_cost), 0);
  const grossProfit = revenue - costOfGoodsSold;
  const unitsSold = saidas.reduce((acc, movement) => acc + toNumber(movement.qtd), 0);
  const breakageCost = quebras.reduce((acc, movement) => acc + toNumber(movement.fifo_cost), 0);
  const expenses = filteredDespesas.reduce((acc, despesa) => acc + toNumber(despesa.valor), 0);
  const netProfit = grossProfit - breakageCost - expenses;

  return {
    revenue,
    costOfGoodsSold,
    grossProfit,
    unitsSold,
    breakageCost,
    expenses,
    netProfit,
    salesCount: saidas.length,
    breakageCount: quebras.length,
    movementCount: filteredMovimentos.length,
  };
}

export function calculatePeriodSummary(movimentos = [], despesas = [], periodoActivo = 'mensal', options = {}) {
  return calculatePeriodMetrics(movimentos, despesas, periodoActivo, options);
}

export function buildPeriodSeries(movimentos = [], despesas = [], periodoActivo = 'mensal', options = {}) {
  const labels = [];
  const revenue = [];
  const profit = [];
  const units = [];
  const losses = [];

  if (periodoActivo === 'mensal') {
    const months = Number(options.count || 6);
    const start = toDate(options.refDate) || new Date();
    for (let index = months - 1; index >= 0; index -= 1) {
      const date = new Date(start.getFullYear(), start.getMonth() - index, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      labels.push(date.toLocaleDateString('pt-MZ', { month: 'short' }));

      const periodMetrics = calculatePeriodMetrics(movimentos, despesas, 'mensal', {
        ...options,
        month: monthKey,
        refDate: start.toISOString().slice(0, 10),
      });

      revenue.push(periodMetrics.revenue);
      profit.push(periodMetrics.netProfit);
      units.push(periodMetrics.unitsSold);
      losses.push(periodMetrics.breakageCost);
    }
  } else {
    const refDate = toDate(options.refDate) || new Date();
    labels.push(dateKey(refDate));
    const periodMetrics = calculatePeriodMetrics(movimentos, despesas, periodoActivo, { ...options, refDate: refDate.toISOString().slice(0, 10) });
    revenue.push(periodMetrics.revenue);
    profit.push(periodMetrics.netProfit);
    units.push(periodMetrics.unitsSold);
    losses.push(periodMetrics.breakageCost);
  }

  return { labels, revenue, profit, units, losses };
}
