import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: IDS.workshop.pageLayout,
  name: 'В работе',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: IDS.workshop.pageLayoutTab,
      title: 'В работе',
      position: 0,
      icon: 'IconHammer',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: IDS.workshop.pageLayoutWidget,
          title: 'В работе',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: IDS.workshop.frontComponent,
          },
        },
      ],
    },
  ],
});
