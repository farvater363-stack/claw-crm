import {
  AggregateOperations,
  definePageLayout,
  PageLayoutTabLayoutMode,
  type PageLayoutWidgetGridPosition,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import {
  CHART_DEFAULTS,
  READY_THIS_MONTH,
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
