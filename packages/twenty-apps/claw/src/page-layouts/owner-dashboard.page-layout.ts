import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

const screen = ({
  universalIdentifier,
  title,
  frontComponentUniversalIdentifier,
}: {
  universalIdentifier: string;
  title: string;
  frontComponentUniversalIdentifier: string;
}) => ({
  universalIdentifier,
  title,
  type: 'FRONT_COMPONENT' as const,
  position: {
    layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST as const,
    index: 0,
  },
  configuration: {
    configurationType: 'FRONT_COMPONENT' as const,
    frontComponentUniversalIdentifier,
  },
});

// A standalone page, not a dashboard: dashboards force a fixed-height grid
// that cuts a long screen off.
export default definePageLayout({
  universalIdentifier: IDS.ownerDashboard.pageLayout,
  name: 'Сегодня',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: IDS.ownerDashboard.todayTab,
      title: 'Сегодня',
      position: 0,
      icon: 'IconSun',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        screen({
          universalIdentifier: IDS.ownerDashboard.todayWidget,
          title: 'Сегодня',
          frontComponentUniversalIdentifier:
            IDS.ownerDashboard.todayFrontComponent,
        }),
      ],
    },
    {
      universalIdentifier: IDS.ownerDashboard.pageLayoutTab,
      title: 'Аналитика',
      position: 1,
      icon: 'IconChartBar',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        screen({
          universalIdentifier: IDS.ownerDashboard.analyticsWidget,
          title: 'Аналитика',
          frontComponentUniversalIdentifier:
            IDS.ownerDashboard.analyticsFrontComponent,
        }),
      ],
    },
  ],
});
