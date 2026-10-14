import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: IDS.catalog.pageLayout,
  name: 'Каталог',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: IDS.catalog.pageLayoutTab,
      title: 'Каталог',
      position: 0,
      icon: 'IconPhoto',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: IDS.catalog.pageLayoutWidget,
          title: 'Каталог',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: IDS.catalog.frontComponent,
          },
        },
      ],
    },
  ],
});
