import {
  definePageLayout,
  PageLayoutTabLayoutMode,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';

const ids = VIEW_PART_IDS.clientRecordPage;

// Replaces Twenty's own person page: a client is a buyer here, not a contact
// at a company.
export default definePageLayout({
  universalIdentifier: ids.layout,
  name: 'Карточка клиента',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  defaultTabToFocusOnMobileAndSidePanelUniversalIdentifier: ids.ordersTab,
  tabs: [
    {
      universalIdentifier: ids.clientTab,
      title: 'Клиент',
      position: 10,
      icon: 'IconUser',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: ids.fieldsWidget,
          title: 'Поля',
          type: 'FIELDS',
          configuration: {
            configurationType: 'FIELDS',
            viewUniversalIdentifier: ids.view,
          },
        },
      ],
    },
    {
      universalIdentifier: ids.ordersTab,
      title: 'Заказы и звонки',
      position: 15,
      icon: 'IconClipboardList',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: IDS.clientPage.widget,
          title: 'Заказы',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: IDS.clientPage.frontComponent,
          },
        },
        {
          universalIdentifier: ids.callsWidget,
          title: 'Звонки',
          type: 'FIELD',
          configuration: {
            configurationType: 'FIELD',
            fieldMetadataId: IDS.person.calls,
            fieldDisplayMode: 'TABLE',
            viewId: IDS.view.clientCallsTable,
          },
        },
      ],
    },
    {
      universalIdentifier: ids.notesTab,
      title: 'Заметки',
      position: 20,
      icon: 'IconNotes',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: ids.notesWidget,
          title: 'Заметки',
          type: 'NOTES',
          configuration: { configurationType: 'NOTES' },
        },
      ],
    },
    {
      universalIdentifier: ids.timelineTab,
      title: 'История',
      position: 30,
      icon: 'IconTimelineEvent',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: ids.timelineWidget,
          title: 'История',
          type: 'TIMELINE',
          configuration: { configurationType: 'TIMELINE' },
        },
      ],
    },
  ],
});
