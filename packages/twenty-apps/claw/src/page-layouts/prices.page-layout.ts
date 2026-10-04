import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: IDS.prices.pageLayout,
  name: 'Цены',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: IDS.prices.pageLayoutTab,
      title: 'Цены',
      position: 0,
      icon: 'IconReceipt2',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: IDS.prices.pageLayoutWidget,
          title: 'Цены',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: IDS.prices.frontComponent,
          },
        },
      ],
    },
  ],
});
