import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { readableThroughOrder } from 'src/objects/readable-through-order';

const { orderNote } = IDS;

export const MAX_ORDER_NOTE_PHOTOS = 10;
export const MAX_ORDER_NOTE_FILES = 10;

// One place for everything people write or photograph about an order, so the
// order page and «В работе» read the same list. Who wrote it and when are the
// record's own createdBy and createdAt. A photo or a file with no text is a
// record too.
export default defineObject({
  universalIdentifier: orderNote.object,
  nameSingular: 'orderNote',
  namePlural: 'orderNotes',
  labelSingular: 'Заметка к заказу',
  labelPlural: 'Заметки к заказам',
  icon: 'IconMessage',
  labelIdentifierFieldMetadataUniversalIdentifier: orderNote.text,
  ...readableThroughOrder(orderNote.order),
  fields: [
    {
      universalIdentifier: orderNote.text,
      type: FieldType.TEXT,
      name: 'text',
      label: 'Текст',
      icon: 'IconMessage',
      isNullable: true,
    },
    {
      universalIdentifier: orderNote.photos,
      type: FieldType.FILES,
      name: 'photos',
      label: 'Фото',
      icon: 'IconCamera',
      isNullable: true,
      universalSettings: { maxNumberOfValues: MAX_ORDER_NOTE_PHOTOS },
    },
    // Documents: PDF, смета, чертёж. The contract has its own screen.
    {
      universalIdentifier: orderNote.files,
      type: FieldType.FILES,
      name: 'files',
      label: 'Файлы',
      icon: 'IconPaperclip',
      isNullable: true,
      universalSettings: { maxNumberOfValues: MAX_ORDER_NOTE_FILES },
    },
    {
      universalIdentifier: orderNote.order,
      type: FieldType.RELATION,
      name: 'order',
      label: 'Заказ',
      icon: 'IconClipboardList',
      relationTargetObjectMetadataUniversalIdentifier: IDS.order.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.order.orderNotes,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'orderId',
      },
    },
    // Empty when the note is about the whole order
    {
      universalIdentifier: orderNote.orderItem,
      type: FieldType.RELATION,
      name: 'orderItem',
      label: 'Проём',
      icon: 'IconWindow',
      relationTargetObjectMetadataUniversalIdentifier: IDS.orderItem.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.orderItem.orderNotes,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'orderItemId',
      },
    },
  ],
});
