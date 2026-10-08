import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: IDS.money.pageLayout,
  name: 'Деньги',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: IDS.money.pageLayoutTab,
      title: 'Деньги',
      position: 0,
      icon: 'IconWallet',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: IDS.money.pageLayoutWidget,
          title: 'Деньги',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: IDS.money.frontComponent,
          },
        },
      ],
    },
  ],
});
