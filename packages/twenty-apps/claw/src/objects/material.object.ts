import {
  defineObject,
  FieldType,
  NumberDataType,
  RelationType,
} from 'twenty-sdk/define';

import { withoutAuditOfAdminOnlyFields } from 'src/constants/admin-only-fields';
import {
  MATERIAL_UNIT_OPTIONS,
  STOCK_STATE_OPTIONS,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { money } from 'src/objects/money-field';

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
      ...quantity(
        material.minimumStock,
        'minimumStock',
        'Запас не меньше',
        'IconArrowBarToDown',
      ),
      defaultValue: 0,
    },
    quantity(material.onHand, 'onHand', 'Есть', 'IconBuildingWarehouse'),
    quantity(material.reserved, 'reserved', 'Нужно на заказы', 'IconLock'),
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
    money(material.lastPurchasePrice, 'lastPurchasePrice', 'Цена закупки'),
    quantity(
      material.overrunPercent,
      'overrunPercent',
      'Уходит больше, %',
      'IconTrendingUp',
    ),
    {
      universalIdentifier: material.norms,
      type: FieldType.RELATION,
      name: 'norms',
      label: 'Где используется',
      icon: 'IconRuler',
      relationTargetObjectMetadataUniversalIdentifier: IDS.materialNorm.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.materialNorm.material,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
    {
      universalIdentifier: material.movements,
      type: FieldType.RELATION,
      name: 'movements',
      label: 'История склада',
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
