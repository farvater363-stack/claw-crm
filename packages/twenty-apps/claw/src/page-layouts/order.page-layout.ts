import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';

const ids = VIEW_PART_IDS.orderRecordPage;

const table = (
  universalIdentifier: string,
  title: string,
  fieldMetadataId: string,
  viewId: string,
) => ({
  universalIdentifier,
  title,
  type: 'FIELD' as const,
  configuration: {
    configurationType: 'FIELD' as const,
    fieldMetadataId,
    fieldDisplayMode: 'TABLE' as const,
    viewId,
  },
});

export default definePageLayout({
  universalIdentifier: ids.layout,
  name: 'Карточка заказа',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: IDS.order.object,
  // A phone and the side panel show one tab at a time: they open on the work,
  // not on the fields.
  defaultTabToFocusOnMobileAndSidePanelUniversalIdentifier: ids.itemsTab,
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
    // is what the main area opens on: the next step, the схема, then what is
    // being made.
    {
      universalIdentifier: ids.itemsTab,
      title: 'Работа',
      position: 15,
      icon: 'IconHammer',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: IDS.orderHeader.orderPageWidget,
          title: 'Что дальше',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: IDS.orderHeader.frontComponent,
          },
        },
        {
          universalIdentifier: IDS.orderSketch.orderPageWidget,
          title: 'Схема',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: IDS.orderSketch.frontComponent,
          },
        },
        table(
          ids.itemsWidget,
          'Что делаем',
          IDS.order.items,
          IDS.view.orderItemsTable,
        ),
        {
          universalIdentifier: IDS.workshopPay.orderPageWidget,
          title: 'Оплата цеха',
          type: 'FRONT_COMPONENT',
          // Pay is the owner's: only a role that may read the order's cost
          // gets the field at all, so the others never see this block.
          conditionalDisplay: {
            '!!': [{ var: 'selectedRecords.0.costTotal.currencyCode' }],
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: IDS.workshopPay.frontComponent,
          },
        },
        table(
          ids.extraServicesWidget,
          'Козырьки и услуги',
          IDS.order.extraServices,
          IDS.view.orderExtraServicesTable,
        ),
        {
          universalIdentifier: IDS.contract.orderPageWidget,
          title: 'Договор',
          type: 'FRONT_COMPONENT',
          // Цех may not read contractState, so the block never shows there.
          conditionalDisplay: {
            '!!': [{ var: 'selectedRecords.0.contractState' }],
          },
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier: IDS.contract.orderFrontComponent,
          },
        },
        table(
          ids.paymentsWidget,
          'Оплаты',
          IDS.order.payments,
          IDS.view.orderPaymentsTable,
        ),
        table(
          ids.materialsWidget,
          'Материалы',
          IDS.order.materials,
          IDS.view.orderMaterialsTable,
        ),
      ],
    },
    {
      universalIdentifier: ids.notesTab,
      title: 'Фото и заметки',
      position: 20,
      icon: 'IconNotes',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: IDS.measurementNotes.orderPageWidget,
          title: 'Фото и комментарии',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier:
              IDS.measurementNotes.frontComponent,
          },
        },
        {
          universalIdentifier: ids.notesFilesWidget,
          title: 'Файлы',
          type: 'FILES',
          // Files fill a tab by default, and a tab may hold one such widget.
          heightBehavior: 'FIT_CONTENT',
          configuration: { configurationType: 'FILES' },
        },
        // The notes list fills the tab, so the SDK requires it to come last.
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
