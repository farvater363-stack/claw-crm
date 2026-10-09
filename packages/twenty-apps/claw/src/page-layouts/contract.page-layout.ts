import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: IDS.contract.pageLayout,
  name: 'Договор',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: IDS.contract.pageLayoutTab,
      title: 'Договор',
      position: 0,
      icon: 'IconFileText',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: IDS.contract.pageLayoutWidget,
          title: 'Договор',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: IDS.contract.frontComponent,
          },
        },
      ],
    },
  ],
});
