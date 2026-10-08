import { defineObject, FieldType, RelationType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

const { supplier } = IDS;

export default defineObject({
  universalIdentifier: supplier.object,
  nameSingular: 'supplier',
  namePlural: 'suppliers',
  labelSingular: 'Поставщик',
  labelPlural: 'Поставщики',
  icon: 'IconTruck',
  labelIdentifierFieldMetadataUniversalIdentifier: supplier.name,
  fields: [
    {
      universalIdentifier: supplier.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: supplier.phone,
      type: FieldType.TEXT,
      name: 'phone',
      label: 'Телефон',
      icon: 'IconPhone',
      isNullable: true,
    },
    {
      universalIdentifier: supplier.comment,
      type: FieldType.TEXT,
      name: 'comment',
      label: 'Комментарий',
      icon: 'IconMessage',
      isNullable: true,
    },
    {
      universalIdentifier: supplier.purchases,
      type: FieldType.RELATION,
      name: 'purchases',
      label: 'Приходы',
      icon: 'IconTruckDelivery',
      relationTargetObjectMetadataUniversalIdentifier: IDS.purchase.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.purchase.supplier,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
    {
      universalIdentifier: supplier.moneyEntries,
      type: FieldType.RELATION,
      name: 'moneyEntries',
      label: 'Оплаты',
      icon: 'IconCash',
      relationTargetObjectMetadataUniversalIdentifier: IDS.moneyEntry.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.moneyEntry.supplier,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ],
});
