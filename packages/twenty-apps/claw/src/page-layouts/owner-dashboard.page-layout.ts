import {
  AggregateOperations,
  definePageLayout,
  PageLayoutTabLayoutMode,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

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
          position: {
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 0,
            column: 0,
            rowSpan: 2,
            columnSpan: 3,
          },
          configuration: {
            configurationType: 'AGGREGATE_CHART',
            aggregateFieldMetadataUniversalIdentifier: IDS.order.total,
            aggregateOperation: AggregateOperations.SUM,
            displayDataLabel: true,
            timezone: 'Asia/Tashkent',
            firstDayOfTheWeek: 1,
          },
        },
      ],
    },
  ],
});
