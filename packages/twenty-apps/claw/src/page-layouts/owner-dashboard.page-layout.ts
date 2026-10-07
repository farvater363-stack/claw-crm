import {
  AggregateOperations,
  definePageLayout,
  ObjectRecordGroupByDateGranularity,
  PageLayoutTabLayoutMode,
  type PageLayoutWidgetGridPosition,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import {
  ACCEPTED_THIS_MONTH,
  CANCELLED_IN_LAST_TWELVE_MONTHS,
  CHART_DEFAULTS,
  type ChartFilter,
  DECIDED_ORDERS,
  INSTALLED_WITH_BALANCE,
  MATERIALS_TO_BUY,
  ORDERS_IN_PRODUCTION,
  OVERDUE_ORDERS,
  READY_IN_LAST_TWELVE_MONTHS,
  READY_THIS_MONTH,
  RECEIVED_THIS_MONTH,
} from 'src/page-layouts/owner-dashboard-filters';

const grid = (
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

// One number of «Сегодня»: four of them share the first row.
const tile = ({
  universalIdentifier,
  title,
  column,
  objectUniversalIdentifier,
  fieldUniversalIdentifier,
  aggregateOperation,
  filter,
}: {
  universalIdentifier: string;
  title: string;
  column: number;
  objectUniversalIdentifier: string;
  fieldUniversalIdentifier: string;
  aggregateOperation: AggregateOperations;
  filter: ChartFilter;
}) => ({
  universalIdentifier,
  title,
  type: 'GRAPH' as const,
  objectUniversalIdentifier,
  position: grid(0, column, 2, 3),
  configuration: {
    configurationType: 'AGGREGATE_CHART' as const,
    aggregateFieldMetadataUniversalIdentifier: fieldUniversalIdentifier,
    aggregateOperation,
    numberFormat: 'FULL' as const,
    filter,
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
  name: 'Сегодня',
  type: 'DASHBOARD',
  tabs: [
    {
      universalIdentifier: IDS.ownerDashboard.todayTab,
      title: 'Сегодня',
      position: 0,
      icon: 'IconSun',
      layoutMode: PageLayoutTabLayoutMode.GRID,
      widgets: [
        tile({
          universalIdentifier: IDS.ownerDashboard.overdueCountWidget,
          title: 'Просрочены',
          column: 0,
          objectUniversalIdentifier: IDS.order.object,
          fieldUniversalIdentifier: IDS.order.name,
          aggregateOperation: AggregateOperations.COUNT,
          filter: OVERDUE_ORDERS,
        }),
        tile({
          universalIdentifier: IDS.ownerDashboard.owesUsSumWidget,
          title: 'Должны нам',
          column: 3,
          objectUniversalIdentifier: IDS.order.object,
          fieldUniversalIdentifier: IDS.order.balance,
          aggregateOperation: AggregateOperations.SUM,
          filter: INSTALLED_WITH_BALANCE,
        }),
        tile({
          universalIdentifier: IDS.ownerDashboard.inProductionCountWidget,
          title: 'В работе',
          column: 6,
          objectUniversalIdentifier: IDS.order.object,
          fieldUniversalIdentifier: IDS.order.name,
          aggregateOperation: AggregateOperations.COUNT,
          filter: ORDERS_IN_PRODUCTION,
        }),
        // Keeps its identifier whatever it counts: the server then updates the
        // widget in place instead of destroying it and creating another.
        tile({
          universalIdentifier: IDS.ownerDashboard.materialsBuyWidget,
          title: 'Купить',
          column: 9,
          objectUniversalIdentifier: IDS.material.object,
          fieldUniversalIdentifier: IDS.material.name,
          aggregateOperation: AggregateOperations.COUNT,
          filter: MATERIALS_TO_BUY,
        }),
        {
          universalIdentifier: IDS.ownerDashboard.purchasePlanTableWidget,
          title: 'Купить',
          type: 'RECORD_TABLE',
          objectUniversalIdentifier: IDS.material.object,
          position: grid(2, 0, 6, 6),
          configuration: {
            configurationType: 'RECORD_TABLE',
            viewUniversalIdentifier: IDS.view.dashboardPurchasePlan,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.nearestDeadlinesTableWidget,
          title: 'Ближайшие сроки',
          type: 'RECORD_TABLE',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(2, 6, 6, 6),
          configuration: {
            configurationType: 'RECORD_TABLE',
            viewUniversalIdentifier: IDS.view.dashboardNearestDeadlines,
            recordLimit: 5,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.acceptedThisMonthWidget,
          title: 'Принято заказов за месяц',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(8, 0, 2, 6),
          configuration: {
            configurationType: 'AGGREGATE_CHART',
            aggregateFieldMetadataUniversalIdentifier: IDS.order.total,
            aggregateOperation: AggregateOperations.SUM,
            numberFormat: 'FULL',
            filter: ACCEPTED_THIS_MONTH,
            ...CHART_DEFAULTS,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.receivedThisMonthWidget,
          title: 'Получено за месяц',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.orderPayment.object,
          position: grid(8, 6, 2, 6),
          configuration: {
            configurationType: 'AGGREGATE_CHART',
            aggregateFieldMetadataUniversalIdentifier: IDS.orderPayment.amount,
            aggregateOperation: AggregateOperations.SUM,
            numberFormat: 'FULL',
            filter: RECEIVED_THIS_MONTH,
            ...CHART_DEFAULTS,
          },
        },
        {
          universalIdentifier: IDS.ownerDashboard.revenueThisMonthWidget,
          title: 'Выручка за месяц',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(10, 0, 2, 6),
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
          position: grid(10, 6, 2, 6),
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
          universalIdentifier: IDS.ownerDashboard.callBacksTableWidget,
          title: 'Перезвонить',
          type: 'RECORD_TABLE',
          objectUniversalIdentifier:
            STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
          position: grid(12, 0, 6, 12),
          configuration: {
            configurationType: 'RECORD_TABLE',
            viewUniversalIdentifier: IDS.view.dashboardCallBacks,
          },
        },
      ],
    },
    {
      universalIdentifier: IDS.ownerDashboard.pageLayoutTab,
      title: 'Аналитика',
      position: 1,
      icon: 'IconChartBar',
      layoutMode: PageLayoutTabLayoutMode.GRID,
      widgets: [
        {
          universalIdentifier: IDS.ownerDashboard.areaThisMonthWidget,
          title: 'м² за месяц',
          type: 'GRAPH',
          objectUniversalIdentifier: IDS.order.object,
          position: grid(0, 0, 2, 4),
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
          position: grid(0, 4, 2, 4),
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
          position: grid(0, 8, 2, 4),
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
        {
          universalIdentifier: IDS.ownerDashboard.overrunTableWidget,
          title: 'Уходит больше нормы',
          type: 'RECORD_TABLE',
          objectUniversalIdentifier: IDS.material.object,
          position: grid(44, 0, 6, 12),
          configuration: {
            configurationType: 'RECORD_TABLE',
            viewUniversalIdentifier: IDS.view.dashboardOverrun,
          },
        },
      ],
    },
  ],
});
