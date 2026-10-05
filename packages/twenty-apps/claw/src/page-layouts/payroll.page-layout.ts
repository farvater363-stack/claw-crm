import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: IDS.payroll.pageLayout,
  name: 'ЗП',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: IDS.payroll.pageLayoutTab,
      title: 'ЗП',
      position: 0,
      icon: 'IconCash',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: IDS.payroll.pageLayoutWidget,
          title: 'ЗП',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: IDS.payroll.frontComponent,
          },
        },
      ],
    },
  ],
});
