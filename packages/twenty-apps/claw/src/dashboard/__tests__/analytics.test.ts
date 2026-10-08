import { describe, expect, it } from 'vitest';

import { dashboardOrder } from 'src/dashboard/__tests__/dashboard-order';
import {
  addMonths,
  buildFunnel,
  buildKinds,
  buildMeasurers,
  buildMetrics,
  buildMonthBars,
  buildRefusals,
  buildStageDays,
  changeOf,
  periodRanges,
} from 'src/dashboard/analytics';

const TODAY = '2026-10-08';

describe('addMonths', () => {
  it('keeps the day, or takes the last day of a shorter month', () => {
    expect(addMonths('2026-10-08', -1)).toBe('2026-09-08');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-15', -2)).toBe('2025-11-15');
  });
});

describe('periodRanges', () => {
  it('compares this month so far with last month up to the same day', () => {
    const ranges = periodRanges('month', 0, TODAY);

    expect(ranges.current).toEqual({ start: '2026-10-01', end: '2026-10-09' });
    expect(ranges.previous).toEqual({ start: '2026-09-01', end: '2026-09-09' });
    expect(ranges.label).toBe('Октябрь 2026');
    expect(ranges.compareLabel).toBe('к 8 сентября');
  });

  it('compares a finished month with the whole month before it', () => {
    const ranges = periodRanges('month', -1, TODAY);

    expect(ranges.current).toEqual({ start: '2026-09-01', end: '2026-10-01' });
    expect(ranges.previous).toEqual({ start: '2026-08-01', end: '2026-09-01' });
    expect(ranges.compareLabel).toBe('к августу');
  });

  it('counts three months and a year as whole months up to this one', () => {
    expect(periodRanges('quarter', 0, TODAY).whole).toEqual({
      start: '2026-08-01',
      end: '2026-11-01',
    });
    expect(periodRanges('year', 0, TODAY)).toMatchObject({
      whole: { start: '2025-11-01', end: '2026-11-01' },
      label: 'ноя 2025 – окт 2026',
    });
  });
});

describe('changeOf', () => {
  it('gives sums in % and shares in points', () => {
    expect(changeOf('sold', 118, 100)).toEqual({
      direction: 'up',
      text: '▲ 18%',
    });
    expect(changeOf('average', 96, 100)).toEqual({
      direction: 'down',
      text: '▼ 4%',
    });
    expect(changeOf('conversion', 51, 46)).toEqual({
      direction: 'up',
      text: '▲ 5 п.',
    });
    expect(changeOf('sold', 100, 0)).toBeNull();
    expect(changeOf('sold', null, 100)).toBeNull();
  });
});

describe('buildMetrics', () => {
  const orders = [
    // Agreed this month, measured in September
    dashboardOrder({
      id: 'sold',
      status: 'PRODUCTION',
      total: 4_000_000,
      measuredOn: '2026-09-28',
      productionStart: '2026-10-02',
    }),
    // Built this month, on time
    dashboardOrder({
      id: 'ready',
      status: 'INSTALLED',
      total: 2_000_000,
      margin: 600_000,
      area: 3.5,
      measuredOn: '2026-10-01',
      productionStart: '2026-09-20',
      deadline: '2026-10-06',
      readyAt: '2026-10-05',
    }),
    dashboardOrder({
      id: 'refused',
      status: 'CANCELLED',
      measuredOn: '2026-10-03',
    }),
    dashboardOrder({
      id: 'thinking',
      status: 'MEASURED',
      measuredOn: '2026-10-04',
    }),
  ];
  const metrics = buildMetrics(
    { orders, payments: [{ paidOn: '2026-10-03', amount: 1_500_000 }] },
    periodRanges('month', 0, TODAY),
    TODAY,
  );

  it('counts a sale on the day the client agreed', () => {
    expect([metrics.sold.value, metrics.average.value]).toEqual([
      4_000_000, 4_000_000,
    ]);
  });

  it('counts revenue, area and margin by the ready date', () => {
    expect([
      metrics.revenue.value,
      metrics.area.value,
      metrics.margin.value,
    ]).toEqual([2_000_000, 3.5, 600_000]);
    expect(metrics.onTime.value).toBe(100);
  });

  it('takes conversion over the decided clients measured in the period', () => {
    expect(metrics.conversion.value).toBe(50);
  });

  it('keeps six months of each figure for its line', () => {
    expect(metrics.received.series).toEqual([0, 0, 0, 0, 0, 1_500_000]);
  });
});

describe('buildMonthBars', () => {
  it('marks the month still going', () => {
    const bars = buildMonthBars(
      { orders: [], payments: [{ paidOn: '2026-09-10', amount: 1_000_000 }] },
      periodRanges('month', 0, TODAY),
      TODAY,
      2,
    );

    expect(bars).toEqual([
      { label: 'сен', sold: 0, received: 1_000_000, isOngoing: false },
      { label: 'окт', sold: 0, received: 0, isOngoing: true },
    ]);
  });
});

describe('funnel, measurers and refusals', () => {
  const range = { start: '2026-10-01', end: '2026-10-09' };
  const orders = [
    dashboardOrder({ id: '1', status: 'NEW' }),
    dashboardOrder({
      id: '2',
      status: 'MEASURED',
      measuredOn: '2026-10-02',
      measurerName: 'Mardon',
    }),
    dashboardOrder({
      id: '3',
      status: 'CANCELLED',
      measuredOn: '2026-10-02',
      measurerName: 'Mardon',
      cancelReason: 'TOO_EXPENSIVE',
    }),
    dashboardOrder({
      id: '4',
      status: 'INSTALLED',
      measuredOn: '2026-10-03',
      measurerName: 'Mardon',
      total: 3_000_000,
    }),
    dashboardOrder({
      id: '5',
      status: 'PRODUCTION',
      measuredOn: '2026-10-03',
      total: 2_000_000,
    }),
    dashboardOrder({ id: 'old', status: 'INSTALLED', createdOn: '2026-09-01' }),
  ];

  it('follows the period’s requests to installation', () => {
    expect(buildFunnel(orders, range)).toEqual({
      leads: 5,
      measured: 4,
      sold: 2,
      installed: 1,
      notMeasured: 1,
      refusedAfterMeasure: 1,
      thinking: 1,
    });
  });

  it('shows each measurer’s visits and sales', () => {
    expect(buildMeasurers(orders, range)).toEqual([
      {
        name: 'Mardon',
        measured: 3,
        sold: 1,
        conversionPercent: 33,
        averageOrder: 3_000_000,
      },
      {
        name: 'Не указан',
        measured: 1,
        sold: 1,
        conversionPercent: 100,
        averageOrder: 2_000_000,
      },
    ]);
  });

  it('counts refusals by reason', () => {
    expect(buildRefusals(orders, range)).toEqual([
      { label: 'Дорого', count: 1 },
    ]);
  });
});

describe('buildStageDays', () => {
  it('averages each step over the orders that finished it in the period', () => {
    const range = { start: '2026-10-01', end: '2026-10-09' };
    const result = buildStageDays(
      [
        dashboardOrder({
          status: 'INSTALLED',
          createdOn: '2026-09-25',
          measuredOn: '2026-09-27',
          productionStart: '2026-09-30',
          readyAt: '2026-10-05',
          installedAt: '2026-10-07',
        }),
      ],
      range,
    );

    expect(result).toEqual({
      stages: [
        { label: 'Заявка → замер', days: null },
        { label: 'Замер → решение', days: null },
        { label: 'Делается в цеху', days: 5 },
        { label: 'Ждёт установку', days: 2 },
      ],
      decisionToInstall: 7,
    });
  });
});

describe('buildKinds', () => {
  it('adds up the area of each grille kind the period’s buyers chose', () => {
    const range = { start: '2026-10-01', end: '2026-10-09' };

    expect(
      buildKinds(
        [
          dashboardOrder({
            id: 'sold',
            status: 'PRODUCTION',
            productionStart: '2026-10-02',
          }),
          dashboardOrder({ id: 'open', status: 'MEASURED' }),
        ],
        [
          { orderId: 'sold', kindName: 'Ромб', area: 4 },
          { orderId: 'sold', kindName: 'Ромб', area: 2.5 },
          { orderId: 'sold', kindName: null, area: 1 },
          { orderId: 'open', kindName: 'Солнце', area: 9 },
        ],
        range,
      ),
    ).toEqual([
      { label: 'Ромб', area: 6.5 },
      { label: 'Вид не указан', area: 1 },
    ]);
  });
});
