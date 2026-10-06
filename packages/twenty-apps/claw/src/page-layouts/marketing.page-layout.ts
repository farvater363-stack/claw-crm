import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: IDS.marketing.pageLayout,
  name: 'Маркетинг',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: IDS.marketing.pageLayoutTab,
      title: 'Маркетинг',
      position: 0,
      icon: 'IconSpeakerphone',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: IDS.marketing.pageLayoutWidget,
          title: 'Маркетинг',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: IDS.marketing.frontComponent,
          },
        },
      ],
    },
  ],
});
