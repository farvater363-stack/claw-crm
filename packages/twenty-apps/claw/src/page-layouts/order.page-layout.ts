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

const notesTab = tab(
  ids.notesTab,
  ids.notesWidget,
  'Заметки',
  'IconNotes',
  30,
  'NOTES',
);

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
    // On the full page the first tab is pinned to the left column, so this tab
    // is what the main area opens on: openings with their area and total.
    {
      universalIdentifier: ids.itemsTab,
      title: 'Позиции',
      position: 15,
      icon: 'IconRuler',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: ids.itemsWidget,
          title: 'Проёмы',
          type: 'FIELD',
          configuration: {
            configurationType: 'FIELD',
            fieldMetadataId: IDS.order.items,
            fieldDisplayMode: 'TABLE',
            viewId: IDS.view.orderItemsTable,
          },
        },
        {
          universalIdentifier: ids.extraServicesWidget,
          title: 'Доп. услуги',
          type: 'FIELD',
          configuration: {
            configurationType: 'FIELD',
            fieldMetadataId: IDS.order.extraServices,
            fieldDisplayMode: 'TABLE',
            viewId: IDS.view.orderExtraServicesTable,
          },
        },
        {
          universalIdentifier: ids.totalsWidget,
          title: 'Итого',
          type: 'FIELDS',
          configuration: {
            configurationType: 'FIELDS',
            viewUniversalIdentifier: IDS.view.orderTotals,
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
    {
      ...notesTab,
      // The notes list fills the tab, so the SDK requires it to come last.
      widgets: [
        {
          universalIdentifier: IDS.measurementNotes.orderPageWidget,
          title: 'Из замера',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier:
              IDS.measurementNotes.frontComponent,
          },
        },
        ...notesTab.widgets,
      ],
    },
    tab(ids.filesTab, ids.filesWidget, 'Файлы', 'IconPaperclip', 40, 'FILES'),
  ],
});
