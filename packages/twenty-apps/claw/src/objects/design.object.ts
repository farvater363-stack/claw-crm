import { defineObject, FieldType, RelationType } from 'twenty-sdk/define';

import { DESIGN_CATALOG_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: IDS.design.object,
  nameSingular: 'design',
  namePlural: 'designs',
  labelSingular: 'Дизайн',
  labelPlural: 'Дизайны',
  icon: 'IconPalette',
  labelIdentifierFieldMetadataUniversalIdentifier: IDS.design.name,
  fields: [
    { universalIdentifier: IDS.design.name, type: FieldType.TEXT, name: 'name', label: 'Название', icon: 'IconAbc' },
    {
      universalIdentifier: IDS.design.catalog,
      type: FieldType.SELECT,
      name: 'catalog',
      label: 'Каталог',
      icon: 'IconFolder',
      isNullable: true,
      options: DESIGN_CATALOG_OPTIONS,
    },
    {
      universalIdentifier: IDS.design.photos,
      type: FieldType.FILES,
      name: 'photos',
      label: 'Фото',
      icon: 'IconPhoto',
      isNullable: true,
      universalSettings: { maxNumberOfValues: 5 },
    },
    {
      universalIdentifier: IDS.design.priceListItems,
      type: FieldType.RELATION,
      name: 'priceListItems',
      label: 'Прайс',
      icon: 'IconReceipt2',
      relationTargetObjectMetadataUniversalIdentifier: IDS.priceListItem.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.priceListItem.design,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
    {
      universalIdentifier: IDS.design.orderItems,
      type: FieldType.RELATION,
      name: 'orderItems',
      label: 'Позиции заказов',
      icon: 'IconRuler',
      relationTargetObjectMetadataUniversalIdentifier: IDS.orderItem.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.orderItem.design,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ],
});
