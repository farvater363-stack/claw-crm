import { describe, expect, it } from 'vitest';

import { IDS } from 'src/constants/universal-identifiers';
import { DECIDED_ORDERS } from 'src/page-layouts/owner-dashboard-filters';
import ownerDashboard from 'src/page-layouts/owner-dashboard.page-layout';
import nearestDeadlines from 'src/views/dashboard-nearest-deadlines.view';
import owesUs from 'src/views/dashboard-owes-us.view';

type ChartRecordFilter = {
  fieldMetadataUniversalIdentifier: string;
  operand: string;
  value?: string;
  recordFilterGroupId?: string;
  subFieldName?: string;
};

type Configuration = {
  configurationType: string;
  viewUniversalIdentifier?: string;
  recordLimit?: number;
  aggregateFieldMetadataUniversalIdentifier?: string;
  aggregateOperation?: string;
  numberFormat?: string;
  filter?: {
    recordFilters?: ChartRecordFilter[];
    recordFilterGroups?: { id: string; logicalOperator: string }[];
  };
};

type GridPosition = {
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
};

const tabs = [...(ownerDashboard.config.tabs ?? [])].sort(
  (left, right) => left.position - right.position,
);
const [today, analytics] = tabs;

type Tab = (typeof tabs)[number];
type Widget = NonNullable<Tab['widgets']>[number];

const widgetsOf = (tab: Tab | undefined) => tab?.widgets ?? [];
const titlesOf = (tab: Tab | undefined) =>
  widgetsOf(tab).map((widget) => widget.title);
const widgets = tabs.flatMap(widgetsOf);
const graphWidgets = widgets.filter((widget) => widget.type === 'GRAPH');
const configurationOf = (widget: Widget) =>
  widget.configuration as Configuration;
const filtersOf = (widget: Widget) =>
  configurationOf(widget).filter?.recordFilters ?? [];
const isConversion = (widget: Widget) =>
  configurationOf(widget).filter === DECIDED_ORDERS;

const byId = (universalIdentifier: string): Widget => {
  const widget = widgets.find(
    (candidate) => candidate.universalIdentifier === universalIdentifier,
  );

  if (widget === undefined)
    throw new Error(`widget ${universalIdentifier} not found`);

  return widget;
};

describe('owner dashboard layout', () => {
  it('opens on «Сегодня» and keeps the charts on «Аналитика»', () => {
    expect(tabs.map((tab) => [tab.title, tab.universalIdentifier])).toEqual([
      ['Сегодня', IDS.ownerDashboard.todayTab],
      ['Аналитика', IDS.ownerDashboard.pageLayoutTab],
    ]);
  });

  it('gives every widget its own id', () => {
    const ids = widgets.map((widget) => widget.universalIdentifier);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lets no two widgets of a tab overlap and keeps them on the twelve columns', () => {
    for (const tab of tabs) {
      const taken = new Set<string>();

      for (const widget of widgetsOf(tab)) {
        const { row, column, rowSpan, columnSpan } =
          widget.position as GridPosition;

        expect(column + columnSpan).toBeLessThanOrEqual(12);

        for (let y = row; y < row + rowSpan; y++) {
          for (let x = column; x < column + columnSpan; x++) {
            expect(taken.has(`${y}:${x}`)).toBe(false);
            taken.add(`${y}:${x}`);
          }
        }
      }
    }
  });

  it('puts every chart filter in a declared group', () => {
    for (const widget of graphWidgets) {
      const groupIds = (
        configurationOf(widget).filter?.recordFilterGroups ?? []
      ).map((group) => group.id);

      for (const filter of filtersOf(widget)) {
        if (filter.recordFilterGroupId !== undefined) {
          expect(groupIds).toContain(filter.recordFilterGroupId);
        }
      }
    }
  });
});

describe('«Сегодня»', () => {
  it('reads as four tiles, two lists, the month taken and built, and who to call back', () => {
    expect(titlesOf(today)).toEqual([
      'Просрочены',
      'Должны нам',
      'В работе',
      'Купить',
      'Купить',
      'Ближайшие сроки',
      'Принято заказов за месяц',
      'Получено за месяц',
      'Выручка за месяц',
      'Маржа за месяц',
      'Перезвонить',
    ]);
  });

  it('lists clients to call back today or late from the call-backs view', () => {
    expect(
      configurationOf(byId(IDS.ownerDashboard.callBacksTableWidget)),
    ).toMatchObject({
      configurationType: 'RECORD_TABLE',
      viewUniversalIdentifier: IDS.view.dashboardCallBacks,
    });
  });

  it.each([
    [
      IDS.ownerDashboard.overdueCountWidget,
      IDS.order.object,
      IDS.order.name,
      'COUNT',
      [
        {
          fieldMetadataUniversalIdentifier: IDS.order.deadlineState,
          operand: 'IS',
          value: '["OVERDUE"]',
        },
      ],
    ],
    [
      IDS.ownerDashboard.owesUsSumWidget,
      IDS.order.object,
      IDS.order.balance,
      'SUM',
      [
        {
          fieldMetadataUniversalIdentifier: IDS.order.status,
          operand: 'IS',
          value: '["INSTALLED"]',
        },
        {
          fieldMetadataUniversalIdentifier: IDS.order.balance,
          operand: 'GREATER_THAN_OR_EQUAL',
          subFieldName: 'amountMicros',
          value: '1',
        },
      ],
    ],
    [
      IDS.ownerDashboard.inProductionCountWidget,
      IDS.order.object,
      IDS.order.name,
      'COUNT',
      [
        {
          fieldMetadataUniversalIdentifier: IDS.order.status,
          operand: 'IS',
          value: '["PRODUCTION"]',
        },
      ],
    ],
    [
      IDS.ownerDashboard.materialsBuyWidget,
      IDS.material.object,
      IDS.material.name,
      'COUNT',
      [
        {
          fieldMetadataUniversalIdentifier: IDS.material.stockState,
          operand: 'IS',
          value: '["BUY","LOW"]',
        },
      ],
    ],
  ])(
    'counts the tile %s from its source',
    (widgetId, objectId, fieldId, operation, filters) => {
      const widget = byId(widgetId);

      expect(widgetsOf(today)).toContain(widget);
      expect(widget.objectUniversalIdentifier).toBe(objectId);
      expect(configurationOf(widget)).toMatchObject({
        configurationType: 'AGGREGATE_CHART',
        aggregateFieldMetadataUniversalIdentifier: fieldId,
        aggregateOperation: operation,
        numberFormat: 'FULL',
      });
      expect(filtersOf(widget)).toEqual(filters);
    },
  );

  it.each([
    [
      IDS.ownerDashboard.acceptedThisMonthWidget,
      IDS.order.object,
      IDS.order.total,
      [
        {
          fieldMetadataUniversalIdentifier: IDS.order.createdAt,
          operand: 'IS_RELATIVE',
          value: 'THIS_1_MONTH;;Asia/Tashkent;;',
        },
        {
          fieldMetadataUniversalIdentifier: IDS.order.status,
          operand: 'IS_NOT',
          value: '["CANCELLED"]',
        },
      ],
    ],
    [
      IDS.ownerDashboard.receivedThisMonthWidget,
      IDS.orderPayment.object,
      IDS.orderPayment.amount,
      [
        {
          fieldMetadataUniversalIdentifier: IDS.orderPayment.paidOn,
          operand: 'IS_RELATIVE',
          value: 'THIS_1_MONTH;;Asia/Tashkent;;',
        },
      ],
    ],
  ])(
    'sums the month of %s whether or not the orders are ready',
    (widgetId, objectId, fieldId, filters) => {
      const widget = byId(widgetId);

      expect(widgetsOf(today)).toContain(widget);
      expect(widget.objectUniversalIdentifier).toBe(objectId);
      expect(configurationOf(widget)).toMatchObject({
        configurationType: 'AGGREGATE_CHART',
        aggregateFieldMetadataUniversalIdentifier: fieldId,
        aggregateOperation: 'SUM',
        numberFormat: 'FULL',
      });
      expect(filtersOf(widget)).toEqual(filters);
    },
  );

  it('lists what to buy from the purchase plan view', () => {
    const widget = byId(IDS.ownerDashboard.purchasePlanTableWidget);

    expect(widgetsOf(today)).toContain(widget);
    expect(configurationOf(widget).viewUniversalIdentifier).toBe(
      IDS.view.dashboardPurchasePlan,
    );
  });

  it('lists the five nearest deadlines of orders in production', () => {
    expect(
      configurationOf(byId(IDS.ownerDashboard.nearestDeadlinesTableWidget)),
    ).toMatchObject({
      configurationType: 'RECORD_TABLE',
      viewUniversalIdentifier: IDS.view.dashboardNearestDeadlines,
      recordLimit: 5,
    });
    expect(
      (nearestDeadlines.config.fields ?? []).map(
        (field) => field.fieldMetadataUniversalIdentifier,
      ),
    ).toEqual([
      IDS.order.name,
      IDS.order.clientFullName,
      IDS.order.installationDeadline,
      IDS.order.master,
    ]);
    expect(
      (nearestDeadlines.config.filters ?? []).map((filter) => filter.value),
    ).toEqual(['["PRODUCTION"]']);
    expect(
      (nearestDeadlines.config.sorts ?? []).map((sort) => [
        sort.fieldMetadataUniversalIdentifier,
        sort.direction,
      ]),
    ).toEqual([[IDS.order.installationDeadline, 'ASC']]);
  });
});

describe('«Аналитика»', () => {
  it('keeps everything else, in the old order', () => {
    expect(titlesOf(analytics)).toEqual([
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
      'Уходит больше нормы',
    ]);
  });

  it('lists who owes: installed orders with a balance', () => {
    expect((owesUs.config.filters ?? [])[0]?.value).toBe('["INSTALLED"]');
  });

  it('shows the overrun list from its material view', () => {
    const widget = byId(IDS.ownerDashboard.overrunTableWidget);

    expect(widget.objectUniversalIdentifier).toBe(IDS.material.object);
    expect(configurationOf(widget).viewUniversalIdentifier).toBe(
      IDS.view.dashboardOverrun,
    );
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
      const configuration = configurationOf(widget);

      return (
        configuration.configurationType === 'AGGREGATE_CHART' &&
        ([IDS.order.total, IDS.order.margin] as string[]).includes(
          configuration.aggregateFieldMetadataUniversalIdentifier ?? '',
        )
      );
    });

    expect(moneyKpis).toHaveLength(4);
    expect(
      moneyKpis.every(
        (widget) => configurationOf(widget).numberFormat === 'FULL',
      ),
    ).toBe(true);
  });

  it('counts conversion as the share of decided orders that got ready', () => {
    const conversion = graphWidgets.filter(isConversion);

    expect(conversion.map((widget) => widget.title)).toEqual([
      'Конверсия по источникам',
      'Конверсия по замерщикам',
    ]);
    for (const widget of conversion) {
      expect(configurationOf(widget)).toMatchObject({
        aggregateFieldMetadataUniversalIdentifier: IDS.order.readyAt,
        aggregateOperation: 'PERCENTAGE_NOT_EMPTY',
        rangeMax: 100,
      });
    }
  });
});
