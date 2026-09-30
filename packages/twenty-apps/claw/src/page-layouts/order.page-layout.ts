import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';

const ids = VIEW_PART_IDS.orderRecordPage;

const tab = (
  universalIdentifier: string,
  widgetUniversalIdentifier: string,
  title: string,
  icon: string,
  position: number,
  type: 'TIMELINE' | 'NOTES' | 'FILES',
) => ({
  universalIdentifier,
  title,
  position,
  icon,
  layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
  widgets: [
    {
      universalIdentifier: widgetUniversalIdentifier,
      title,
      type,
      configuration: { configurationType: type },
    },
  ],
});

export default definePageLayout({
  universalIdentifier: ids.layout,
  name: 'Карточка заказа',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: IDS.order.object,
  tabs: [
    {
      universalIdentifier: ids.homeTab,
      title: 'Заказ',
      position: 10,
      icon: 'IconClipboardList',
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
    tab(
      ids.timelineTab,
      ids.timelineWidget,
      'История',
      'IconTimelineEvent',
      20,
      'TIMELINE',
    ),
    tab(ids.notesTab, ids.notesWidget, 'Заметки', 'IconNotes', 30, 'NOTES'),
    tab(ids.filesTab, ids.filesWidget, 'Файлы', 'IconPaperclip', 40, 'FILES'),
  ],
});
