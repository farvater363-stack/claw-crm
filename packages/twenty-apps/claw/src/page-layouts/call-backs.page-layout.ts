import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: IDS.callBacks.pageLayout,
  name: 'Перезвоны',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: IDS.callBacks.pageLayoutTab,
      title: 'Перезвоны',
      position: 0,
      icon: 'IconPhoneCall',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: IDS.callBacks.pageLayoutWidget,
          title: 'Перезвоны',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: IDS.callBacks.frontComponent,
          },
        },
      ],
    },
  ],
});
