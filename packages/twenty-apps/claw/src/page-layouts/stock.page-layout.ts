import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: IDS.stock.pageLayout,
  name: 'Склад',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: IDS.stock.pageLayoutTab,
      title: 'Склад',
      position: 0,
      icon: 'IconBuildingWarehouse',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: IDS.stock.pageLayoutWidget,
          title: 'Склад',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: IDS.stock.frontComponent,
          },
        },
      ],
    },
  ],
});
