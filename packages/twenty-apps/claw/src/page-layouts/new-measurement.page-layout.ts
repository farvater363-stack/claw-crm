import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: IDS.measurerForm.pageLayout,
  name: 'Новый замер',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: IDS.measurerForm.pageLayoutTab,
      title: 'Новый замер',
      position: 0,
      icon: 'IconRulerMeasure',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: IDS.measurerForm.pageLayoutWidget,
          title: 'Новый замер',
          type: 'FRONT_COMPONENT',
          position: {
            layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
            index: 0,
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: IDS.measurerForm.frontComponent,
          },
        },
      ],
    },
  ],
});
