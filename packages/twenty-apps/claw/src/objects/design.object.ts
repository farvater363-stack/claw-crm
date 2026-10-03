import { defineObject, FieldType, RelationType } from 'twenty-sdk/define';

import {
  DESIGN_CATALOG_OPTIONS,
  METAL_OPTIONS,
} from 'src/constants/select-options';
import { FULL_MONEY_DISPLAY } from 'src/constants/money-display';
import { withoutAuditOfAdminOnlyFields } from 'src/constants/admin-only-fields';
import { IDS } from 'src/constants/universal-identifiers';

const currencyField = (
  universalIdentifier: string,
  name: string,
  label: string,
) =>
  ({
    universalIdentifier,
    type: FieldType.CURRENCY,
    universalSettings: FULL_MONEY_DISPLAY,
    name,
    label,
    icon: 'IconCurrency',
    isNullable: true,
  }) as const;

export default defineObject({
  universalIdentifier: IDS.design.object,
  nameSingular: 'design',
  namePlural: 'designs',
  labelSingular: 'Решётка',
  labelPlural: 'Решётки',
  icon: 'IconPalette',
  labelIdentifierFieldMetadataUniversalIdentifier: IDS.design.name,
  fields: withoutAuditOfAdminOnlyFields([
    {
      universalIdentifier: IDS.design.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
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
      universalIdentifier: IDS.design.metal,
      type: FieldType.SELECT,
      name: 'metal',
      label: 'Металл',
      icon: 'IconHammer',
      isNullable: true,
      options: METAL_OPTIONS,
    },
    currencyField(
      IDS.design.pricePerSquareMeter,
      'pricePerSquareMeter',
      'Цена за м²',
    ),
    currencyField(
      IDS.design.materialCostPerSquareMeter,
      'materialCostPerSquareMeter',
      'Материал за м²',
    ),
    currencyField(
      IDS.design.manufacturingCostPerSquareMeter,
      'manufacturingCostPerSquareMeter',
      'Работа за м²',
    ),
    currencyField(
      IDS.design.installationCostPerSquareMeter,
      'installationCostPerSquareMeter',
      'Установка за м²',
    ),
    {
      universalIdentifier: IDS.design.norms,
      type: FieldType.RELATION,
      name: 'norms',
      label: 'Из чего делается',
      icon: 'IconRuler',
      relationTargetObjectMetadataUniversalIdentifier: IDS.materialNorm.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.materialNorm.design,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
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
  ]),
});
