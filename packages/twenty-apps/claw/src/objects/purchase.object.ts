import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

const { purchase } = IDS;

// One trip to a supplier: its lines are the receipts on the stock history, and
// what was paid for it is in the money entries. Totals and debt are counted
// from those, never stored, so they cannot drift from them.
export default defineObject({
  universalIdentifier: purchase.object,
  nameSingular: 'purchase',
  namePlural: 'purchases',
  labelSingular: 'Приход',
  labelPlural: 'Приходы',
  icon: 'IconTruckDelivery',
  labelIdentifierFieldMetadataUniversalIdentifier: purchase.name,
  fields: [
    {
      universalIdentifier: purchase.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: purchase.date,
      type: FieldType.DATE,
      name: 'date',
      label: 'Дата',
      icon: 'IconCalendar',
      isNullable: true,
    },
    {
      universalIdentifier: purchase.supplier,
      type: FieldType.RELATION,
      name: 'supplier',
      label: 'Поставщик',
      icon: 'IconTruck',
      relationTargetObjectMetadataUniversalIdentifier: IDS.supplier.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.supplier.purchases,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'supplierId',
      },
    },
    {
      universalIdentifier: purchase.invoicePhotos,
      type: FieldType.FILES,
      name: 'invoicePhotos',
      label: 'Фото накладной',
      icon: 'IconPhoto',
      isNullable: true,
      universalSettings: { maxNumberOfValues: 5 },
    },
    {
      universalIdentifier: purchase.comment,
      type: FieldType.TEXT,
      name: 'comment',
      label: 'Комментарий',
      icon: 'IconMessage',
      isNullable: true,
    },
    {
      universalIdentifier: purchase.lines,
      type: FieldType.RELATION,
      name: 'lines',
      label: 'Что купили',
      icon: 'IconList',
      relationTargetObjectMetadataUniversalIdentifier: IDS.stockMovement.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.stockMovement.purchase,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
    {
      universalIdentifier: purchase.moneyEntries,
      type: FieldType.RELATION,
      name: 'moneyEntries',
      label: 'Оплаты',
      icon: 'IconCash',
      relationTargetObjectMetadataUniversalIdentifier: IDS.moneyEntry.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.moneyEntry.purchase,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ],
});
