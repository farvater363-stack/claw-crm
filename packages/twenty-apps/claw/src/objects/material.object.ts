import {
  defineObject,
  FieldType,
  NumberDataType,
  RelationType,
} from 'twenty-sdk/define';

import { withoutAuditOfAdminOnlyFields } from 'src/constants/admin-only-fields';
import { FULL_MONEY_DISPLAY } from 'src/constants/money-display';
import {
  MATERIAL_UNIT_OPTIONS,
  STOCK_STATE_OPTIONS,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';

const { material } = IDS;

const quantity = (
  universalIdentifier: string,
  name: string,
  label: string,
  icon: string,
) =>
  ({
    universalIdentifier,
    type: FieldType.NUMBER,
    name,
    label,
    icon,
    isNullable: true,
    universalSettings: { decimals: 2, dataType: NumberDataType.FLOAT },
  }) as const;

export default defineObject({
  universalIdentifier: material.object,
  nameSingular: 'material',
  namePlural: 'materials',
  labelSingular: 'Материал',
  labelPlural: 'Материалы',
  icon: 'IconBox',
  labelIdentifierFieldMetadataUniversalIdentifier: material.name,
  fields: withoutAuditOfAdminOnlyFields([
    {
      universalIdentifier: material.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: material.unit,
      type: FieldType.SELECT,
      name: 'unit',
      label: 'Ед.',
      icon: 'IconRuler2',
      defaultValue: "'METER'",
      options: MATERIAL_UNIT_OPTIONS,
    },
    {
      universalIdentifier: material.safetyPercent,
      type: FieldType.NUMBER,
      name: 'safetyPercent',
      label: 'Запас, %',
      icon: 'IconPercentage',
      isNullable: true,
      defaultValue: 10,
    },
    {
      ...quantity(
        material.minimumStock,
        'minimumStock',
        'Минимальный остаток',
        'IconArrowBarToDown',
      ),
      defaultValue: 0,
    },
    quantity(material.onHand, 'onHand', 'На складе', 'IconBuildingWarehouse'),
    quantity(material.reserved, 'reserved', 'Нужно под заказы', 'IconLock'),
    quantity(material.available, 'available', 'Свободно', 'IconCheck'),
    quantity(material.toBuy, 'toBuy', 'Купить', 'IconShoppingCart'),
    {
      universalIdentifier: material.stockState,
      type: FieldType.SELECT,
      name: 'stockState',
      label: 'Статус',
      icon: 'IconTrafficLights',
      isNullable: true,
      options: STOCK_STATE_OPTIONS,
    },
    {
      universalIdentifier: material.lastPurchasePrice,
      type: FieldType.CURRENCY,
      name: 'lastPurchasePrice',
      label: 'Цена закупки',
      icon: 'IconCurrency',
      isNullable: true,
      universalSettings: FULL_MONEY_DISPLAY,
    },
    quantity(
      material.overrunPercent,
      'overrunPercent',
      'Перерасход, %',
      'IconTrendingUp',
    ),
    {
      universalIdentifier: material.norms,
      type: FieldType.RELATION,
      name: 'norms',
      label: 'Нормы расхода',
      icon: 'IconRuler',
      relationTargetObjectMetadataUniversalIdentifier: IDS.materialNorm.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.materialNorm.material,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
    {
      universalIdentifier: material.movements,
      type: FieldType.RELATION,
      name: 'movements',
      label: 'Движения',
      icon: 'IconArrowsExchange',
      relationTargetObjectMetadataUniversalIdentifier: IDS.stockMovement.object,
      relationTargetFieldMetadataUniversalIdentifier:
        IDS.stockMovement.material,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
    {
      universalIdentifier: material.orderMaterials,
      type: FieldType.RELATION,
      name: 'orderMaterials',
      label: 'Расход по заказам',
      icon: 'IconClipboardList',
      relationTargetObjectMetadataUniversalIdentifier: IDS.orderMaterial.object,
      relationTargetFieldMetadataUniversalIdentifier:
        IDS.orderMaterial.material,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ]),
});
