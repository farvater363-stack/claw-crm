import {
  AggregateOperations,
  definePageLayout,
  ObjectRecordGroupByDateGranularity,
  PageLayoutTabLayoutMode,
  type PageLayoutWidgetGridPosition,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import {
  CANCELLED_IN_LAST_TWELVE_MONTHS,
  CHART_DEFAULTS,
  type ChartFilter,
  DECIDED_ORDERS,
  materialsInStockState,
  READY_IN_LAST_TWELVE_MONTHS,
  READY_THIS_MONTH,
} from 'src/page-layouts/owner-dashboard-filters';

// The warehouse block takes the first rows; every analytics widget sits below it.
const WAREHOUSE_ROWS = 8;

const topGrid = (
  row: number,
  column: number,
  rowSpan: number,
  columnSpan: number,
): PageLayoutWidgetGridPosition => ({
  layoutMode: PageLayoutTabLayoutMode.GRID,
  row,
  column,
  rowSpan,
  columnSpan,
});

const grid = (
  row: number,
  column: number,
  rowSpan: number,
  columnSpan: number,
): PageLayoutWidgetGridPosition =>
  topGrid(row + WAREHOUSE_ROWS, column, rowSpan, columnSpan);

const materialCount = (
  universalIdentifier: string,
  title: string,
  column: number,
  filter?: ChartFilter,
) => ({
  universalIdentifier,
  title,
  type: 'GRAPH' as const,
  objectUniversalIdentifier: IDS.material.object,
  position: topGrid(0, column, 2, 3),
  configuration: {
    configurationType: 'AGGREGATE_CHART' as const,
    aggregateFieldMetadataUniversalIdentifier: IDS.material.name,
    aggregateOperation: AggregateOperations.COUNT,
    numberFormat: 'FULL' as const,
    ...(filter !== undefined && { filter }),
    ...CHART_DEFAULTS,
  },
});

const BAR_DEFAULTS = {
  ...CHART_DEFAULTS,
  layout: 'VERTICAL',
  axisNameDisplay: 'NONE',
  color: 'auto',
} as const;

export default definePageLayout({
  universalIdentifier: IDS.ownerDashboard.pageLayout,
  name: 'Аналитика',
  type: 'DASHBOARD',
  tabs: [
    {
      universalIdentifier: IDS.ownerDashboard.pageLayoutTab,
      title: 'Аналитика',
      position: 0,
      icon: 'IconChartBar',
      layoutMode: PageLayoutTabLayoutMode.GRID,
      widgets: [
        materialCount(
          IDS.ownerDashboard.materialsTotalWidget,
          'Всего материалов',
          0,
        ),
        materialCount(
          IDS.ownerDashboard.materialsOkWidget,
          'Достаточно',
          3,
          materialsInStockState('OK'),
        ),
        materialCount(
          IDS.ownerDashboard.materialsLowWidget,
          'Скоро закончится',
          6,
          materialsInStockState('LOW'),
        ),
        materialCount(
          IDS.ownerDashboard.materialsBuyWidget,
          'Нужно купить',
          9,
          materialsInStockState('BUY'),
        ),
        {
          universalIdentifier: IDS.ownerDashboard.purchasePlanTableWidget,
          title: 'План закупок',
          type: 'RECORD_TABLE',
          objectUniversalIdentifier: IDS.material.object,
          position: topGrid(2, 0, 6, 8),
          configuration: {
            configurationType: 'RECORD_TABLE',
            viewUniversalIdentifier: IDS.view.dashboardPurchasePlan,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.overrunTableWidget,
          title: 'Перерасход',
          type: 'RECORD_TABLE',
          objectUniversalIdentifier: IDS.material.object,
          position: topGrid(2, 8, 6, 4),
          configuration: {
            configurationType: 'RECORD_TABLE',
            viewUniversalIdentifier: IDS.view.dashboardOverrun,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.revenueThisMonthWidget,
          title: 'Выручка за месяц',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(0, 0, 2, 3),
          configuration: {
            configurationType: 'AGGREGATE_CHART',
            aggregateFieldMetadataUniversalIdentifier: IDS.order.total,
            aggregateOperation: AggregateOperations.SUM,
            numberFormat: 'FULL',
            filter: READY_THIS_MONTH,
            ...CHART_DEFAULTS,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.marginThisMonthWidget,
          title: 'Маржа за месяц',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(0, 3, 2, 3),
          configuration: {
            configurationType: 'AGGREGATE_CHART',
            aggregateFieldMetadataUniversalIdentifier: IDS.order.margin,
            aggregateOperation: AggregateOperations.SUM,
            numberFormat: 'FULL',
            filter: READY_THIS_MONTH,
            ...CHART_DEFAULTS,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.areaThisMonthWidget,
          title: 'м² за месяц',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(0, 6, 2, 2),
          configuration: {
            configurationType: 'AGGREGATE_CHART',
            aggregateFieldMetadataUniversalIdentifier:
              IDS.order.areaSquareMeters,
            aggregateOperation: AggregateOperations.SUM,
            numberFormat: 'FULL',
            filter: READY_THIS_MONTH,
            ...CHART_DEFAULTS,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.readyCountThisMonthWidget,
          title: 'Готово заказов',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(0, 8, 2, 2),
          configuration: {
            configurationType: 'AGGREGATE_CHART',
            aggregateFieldMetadataUniversalIdentifier: IDS.order.name,
            aggregateOperation: AggregateOperations.COUNT,
            numberFormat: 'FULL',
            filter: READY_THIS_MONTH,
            ...CHART_DEFAULTS,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.averageOrderThisMonthWidget,
          title: 'Средний чек',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(0, 10, 2, 2),
          configuration: {
            configurationType: 'AGGREGATE_CHART',
            aggregateFieldMetadataUniversalIdentifier: IDS.order.total,
            aggregateOperation: AggregateOperations.AVG,
            numberFormat: 'FULL',
            filter: READY_THIS_MONTH,
            ...CHART_DEFAULTS,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.revenueByMonthWidget,
          title: 'Выручка по месяцам',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(2, 0, 6, 6),
          configuration: {
            configurationType: 'BAR_CHART',
            aggregateFieldMetadataUniversalIdentifier: IDS.order.total,
            aggregateOperation: AggregateOperations.SUM,
            primaryAxisGroupByFieldMetadataUniversalIdentifier:
              IDS.order.readyAt,
            primaryAxisDateGranularity:
              ObjectRecordGroupByDateGranularity.MONTH,
            primaryAxisOrderBy: 'FIELD_ASC',
            filter: READY_IN_LAST_TWELVE_MONTHS,
            ...BAR_DEFAULTS,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.marginByMonthWidget,
          title: 'Маржа по месяцам',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(2, 6, 6, 6),
          configuration: {
            configurationType: 'BAR_CHART',
            aggregateFieldMetadataUniversalIdentifier: IDS.order.margin,
            aggregateOperation: AggregateOperations.SUM,
            primaryAxisGroupByFieldMetadataUniversalIdentifier:
              IDS.order.readyAt,
            primaryAxisDateGranularity:
              ObjectRecordGroupByDateGranularity.MONTH,
            primaryAxisOrderBy: 'FIELD_ASC',
            filter: READY_IN_LAST_TWELVE_MONTHS,
            ...BAR_DEFAULTS,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.areaByMonthWidget,
          title: 'м² по месяцам',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(8, 0, 6, 6),
          configuration: {
            configurationType: 'BAR_CHART',
            aggregateFieldMetadataUniversalIdentifier:
              IDS.order.areaSquareMeters,
            aggregateOperation: AggregateOperations.SUM,
            primaryAxisGroupByFieldMetadataUniversalIdentifier:
              IDS.order.readyAt,
            primaryAxisDateGranularity:
              ObjectRecordGroupByDateGranularity.MONTH,
            primaryAxisOrderBy: 'FIELD_ASC',
            filter: READY_IN_LAST_TWELVE_MONTHS,
            ...BAR_DEFAULTS,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.revenueBySourceWidget,
          title: 'Выручка по источникам',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(8, 6, 6, 6),
          configuration: {
            configurationType: 'BAR_CHART',
            aggregateFieldMetadataUniversalIdentifier: IDS.order.total,
            aggregateOperation: AggregateOperations.SUM,
            primaryAxisGroupByFieldMetadataUniversalIdentifier:
              IDS.order.source,
            primaryAxisOrderBy: 'VALUE_DESC',
            omitNullValues: true,
            filter: READY_IN_LAST_TWELVE_MONTHS,
            ...BAR_DEFAULTS,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.conversionBySourceWidget,
          title: 'Конверсия по источникам',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(14, 0, 6, 6),
          configuration: {
            configurationType: 'BAR_CHART',
            aggregateFieldMetadataUniversalIdentifier: IDS.order.readyAt,
            aggregateOperation: AggregateOperations.PERCENTAGE_NOT_EMPTY,
            primaryAxisGroupByFieldMetadataUniversalIdentifier:
              IDS.order.source,
            primaryAxisOrderBy: 'VALUE_DESC',
            omitNullValues: true,
            filter: DECIDED_ORDERS,
            rangeMin: 0,
            rangeMax: 100,
            ...BAR_DEFAULTS,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.conversionByMeasurerWidget,
          title: 'Конверсия по замерщикам',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(14, 6, 6, 6),
          configuration: {
            configurationType: 'BAR_CHART',
            aggregateFieldMetadataUniversalIdentifier: IDS.order.readyAt,
            aggregateOperation: AggregateOperations.PERCENTAGE_NOT_EMPTY,
            primaryAxisGroupByFieldMetadataUniversalIdentifier:
              IDS.order.measurer,
            primaryAxisOrderBy: 'VALUE_DESC',
            omitNullValues: true,
            filter: DECIDED_ORDERS,
            rangeMin: 0,
            rangeMax: 100,
            ...BAR_DEFAULTS,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.revenueByDistrictWidget,
          title: 'Выручка по районам',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(20, 0, 6, 6),
          configuration: {
            configurationType: 'BAR_CHART',
            aggregateFieldMetadataUniversalIdentifier: IDS.order.total,
            aggregateOperation: AggregateOperations.SUM,
            primaryAxisGroupByFieldMetadataUniversalIdentifier:
              IDS.order.district,
            primaryAxisOrderBy: 'VALUE_DESC',
            omitNullValues: true,
            filter: READY_IN_LAST_TWELVE_MONTHS,
            ...BAR_DEFAULTS,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.cancellationsByReasonWidget,
          title: 'Отмены по причинам',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(20, 6, 6, 6),
          configuration: {
            configurationType: 'PIE_CHART',
            aggregateFieldMetadataUniversalIdentifier: IDS.order.name,
            aggregateOperation: AggregateOperations.COUNT,
            groupByFieldMetadataUniversalIdentifier: IDS.order.cancelReason,
            displayLegend: true,
            filter: CANCELLED_IN_LAST_TWELVE_MONTHS,
            ...CHART_DEFAULTS,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.overdueTableWidget,
          title: 'Просрочены',
          type: 'RECORD_TABLE',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(26, 0, 6, 12),
          configuration: {
            configurationType: 'RECORD_TABLE',
            viewUniversalIdentifier: IDS.view.dashboardOverdue,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.owesUsTableWidget,
          title: 'Должны нам',
          type: 'RECORD_TABLE',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(32, 0, 6, 12),
          configuration: {
            configurationType: 'RECORD_TABLE',
            viewUniversalIdentifier: IDS.view.dashboardOwesUs,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.lateThisMonthTableWidget,
          title: 'Просрочки за месяц',
          type: 'RECORD_TABLE',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(38, 0, 6, 12),
          configuration: {
            configurationType: 'RECORD_TABLE',
            viewUniversalIdentifier: IDS.view.dashboardLateThisMonth,
          },
        },
      ],
    },
  ],
});
