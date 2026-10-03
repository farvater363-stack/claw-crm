import { describe, expect, it } from 'vitest';

import { IDS } from 'src/constants/universal-identifiers';
import { DECIDED_ORDERS } from 'src/page-layouts/owner-dashboard-filters';
import ownerDashboard from 'src/page-layouts/owner-dashboard.page-layout';

type WidgetConfiguration = {
  configurationType: string;
  viewUniversalIdentifier?: string;
};

const widgets = (ownerDashboard.config.tabs ?? []).flatMap(
  (tab) => tab.widgets ?? [],
);

const configurationOf = (widget: (typeof widgets)[number]) =>
  widget.configuration as WidgetConfiguration;

type ChartRecordFilter = {
  fieldMetadataUniversalIdentifier: string;
  operand: string;
  value?: string;
  recordFilterGroupId?: string;
};

type ChartConfiguration = {
  configurationType: string;
  aggregateFieldMetadataUniversalIdentifier?: string;
  aggregateOperation?: string;
  numberFormat?: string;
  filter?: {
    recordFilters?: ChartRecordFilter[];
    recordFilterGroups?: { id: string; logicalOperator: string }[];
  };
};

const graphWidgets = widgets.filter((widget) => widget.type === 'GRAPH');

const WAREHOUSE_COUNT_WIDGETS: string[] = [
  IDS.ownerDashboard.materialsTotalWidget,
  IDS.ownerDashboard.materialsOkWidget,
  IDS.ownerDashboard.materialsLowWidget,
  IDS.ownerDashboard.materialsBuyWidget,
];

const analyticsGraphWidgets = graphWidgets.filter(
  (widget) => !WAREHOUSE_COUNT_WIDGETS.includes(widget.universalIdentifier),
);

const chartConfigurationOf = (widget: (typeof widgets)[number]) =>
  widget.configuration as ChartConfiguration;

const filtersOf = (widget: (typeof widgets)[number]) =>
  chartConfigurationOf(widget).filter?.recordFilters ?? [];

const isConversion = (widget: (typeof widgets)[number]) =>
  chartConfigurationOf(widget).filter === DECIDED_ORDERS;

describe('owner dashboard layout', () => {
  it('gives every widget its own id', () => {
    const ids = widgets.map((widget) => widget.universalIdentifier);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows the three lists from their order views', () => {
    const tables = widgets.filter(
      (widget) =>
        widget.type === 'RECORD_TABLE' &&
        widget.objectUniversalIdentifier === IDS.order.object,
    );

    expect(tables.map((widget) => widget.title)).toEqual([
      'Просрочены',
      'Должны нам',
      'Просрочки за месяц',
    ]);
    expect(
      tables.map((widget) => configurationOf(widget).viewUniversalIdentifier),
    ).toEqual([
      IDS.view.dashboardOverdue,
      IDS.view.dashboardOwesUs,
      IDS.view.dashboardLateThisMonth,
    ]);
  });

  it('starts the analytics with the five monthly KPIs', () => {
    expect(
      analyticsGraphWidgets.slice(0, 5).map((widget) => widget.title),
    ).toEqual([
      'Выручка за месяц',
      'Маржа за месяц',
      'м² за месяц',
      'Готово заказов',
      'Средний чек',
    ]);
  });

  it('points every analytics chart at orders', () => {
    expect(
      analyticsGraphWidgets.every(
        (widget) => widget.objectUniversalIdentifier === IDS.order.object,
      ),
    ).toBe(true);
  });

  it('keeps cancelled orders out of every chart counted by ready date', () => {
    const byReadyDate = graphWidgets.filter(
      (widget) =>
        !isConversion(widget) &&
        filtersOf(widget).some(
          (filter) =>
            filter.fieldMetadataUniversalIdentifier === IDS.order.readyAt,
        ),
    );

    expect(byReadyDate.length).toBeGreaterThan(0);
    for (const widget of byReadyDate) {
      expect(filtersOf(widget)).toContainEqual(
        expect.objectContaining({
          fieldMetadataUniversalIdentifier: IDS.order.status,
          operand: 'IS_NOT',
          value: JSON.stringify(['CANCELLED']),
        }),
      );
    }
  });

  it('shows KPI money in full', () => {
    const moneyKpis = graphWidgets.filter((widget) => {
      const configuration = chartConfigurationOf(widget);

      return (
        configuration.configurationType === 'AGGREGATE_CHART' &&
        ([IDS.order.total, IDS.order.margin] as string[]).includes(
          configuration.aggregateFieldMetadataUniversalIdentifier ?? '',
        )
      );
    });

    expect(moneyKpis).toHaveLength(3);
    expect(
      moneyKpis.every(
        (widget) => chartConfigurationOf(widget).numberFormat === 'FULL',
      ),
    ).toBe(true);
  });

  it('puts every chart filter in a declared group', () => {
    for (const widget of graphWidgets) {
      const groupIds = (
        chartConfigurationOf(widget).filter?.recordFilterGroups ?? []
      ).map((group) => group.id);

      for (const filter of filtersOf(widget)) {
        if (filter.recordFilterGroupId !== undefined) {
          expect(groupIds).toContain(filter.recordFilterGroupId);
        }
      }
    }
  });

  it('lists every widget in reading order', () => {
    expect(widgets.map((widget) => widget.title)).toEqual([
      'Всего материалов',
      'Достаточно',
      'Скоро закончится',
      'Нужно купить',
      'План закупок',
      'Перерасход',
      'Выручка за месяц',
      'Маржа за месяц',
      'м² за месяц',
      'Готово заказов',
      'Средний чек',
      'Выручка по месяцам',
      'Маржа по месяцам',
      'м² по месяцам',
      'Выручка по источникам',
      'Конверсия по источникам',
      'Конверсия по замерщикам',
      'Выручка по районам',
      'Отмены по причинам',
      'Просрочены',
      'Должны нам',
      'Просрочки за месяц',
    ]);
  });

  it('counts conversion as the share of decided orders that got ready', () => {
    const conversion = graphWidgets.filter(isConversion);

    expect(conversion.map((widget) => widget.title)).toEqual([
      'Конверсия по источникам',
      'Конверсия по замерщикам',
    ]);
    for (const widget of conversion) {
      expect(chartConfigurationOf(widget)).toMatchObject({
        aggregateFieldMetadataUniversalIdentifier: IDS.order.readyAt,
        aggregateOperation: 'PERCENTAGE_NOT_EMPTY',
        rangeMax: 100,
      });
    }
  });
});

describe('warehouse block', () => {
  const byId = (universalIdentifier: string) => {
    const widget = widgets.find(
      (candidate) => candidate.universalIdentifier === universalIdentifier,
    );

    if (widget === undefined) throw new Error('widget not found');

    return widget;
  };

  it('counts materials in total and per stock state', () => {
    const states = [
      [IDS.ownerDashboard.materialsTotalWidget, undefined],
      [IDS.ownerDashboard.materialsOkWidget, 'OK'],
      [IDS.ownerDashboard.materialsLowWidget, 'LOW'],
      [IDS.ownerDashboard.materialsBuyWidget, 'BUY'],
    ] as const;

    for (const [universalIdentifier, state] of states) {
      const widget = byId(universalIdentifier);
      const configuration = chartConfigurationOf(widget);

      expect(widget.objectUniversalIdentifier).toBe(IDS.material.object);
      expect(configuration.aggregateOperation).toBe('COUNT');
      expect(configuration.filter?.recordFilters ?? []).toEqual(
        state === undefined
          ? []
          : [
              {
                fieldMetadataUniversalIdentifier: IDS.material.stockState,
                operand: 'IS',
                value: JSON.stringify([state]),
              },
            ],
      );
    }
  });

  it('shows the purchase plan and the overrun list from material views', () => {
    expect(
      configurationOf(byId(IDS.ownerDashboard.purchasePlanTableWidget))
        .viewUniversalIdentifier,
    ).toBe(IDS.view.dashboardPurchasePlan);
    expect(
      configurationOf(byId(IDS.ownerDashboard.overrunTableWidget))
        .viewUniversalIdentifier,
    ).toBe(IDS.view.dashboardOverrun);

    for (const universalIdentifier of [
      IDS.ownerDashboard.purchasePlanTableWidget,
      IDS.ownerDashboard.overrunTableWidget,
    ]) {
      expect(byId(universalIdentifier).objectUniversalIdentifier).toBe(
        IDS.material.object,
      );
    }
  });

  it('sits above the analytics widgets without overlapping them', () => {
    const rowsOf = (universalIdentifier: string) => {
      const position = byId(universalIdentifier).position as {
        row: number;
        rowSpan: number;
      };

      return [position.row, position.row + position.rowSpan];
    };

    expect(rowsOf(IDS.ownerDashboard.materialsTotalWidget)[0]).toBe(0);
    const firstAnalyticsRow = rowsOf(
      IDS.ownerDashboard.revenueThisMonthWidget,
    )[0];

    expect(
      rowsOf(IDS.ownerDashboard.purchasePlanTableWidget)[1],
    ).toBeLessThanOrEqual(firstAnalyticsRow);
    expect(
      rowsOf(IDS.ownerDashboard.overrunTableWidget)[1],
    ).toBeLessThanOrEqual(firstAnalyticsRow);
  });
});
