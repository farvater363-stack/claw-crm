import {
  defineObject,
  FieldType,
  NumberDataType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

const { orderMaterial } = IDS;

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
  universalIdentifier: orderMaterial.object,
  nameSingular: 'orderMaterial',
  namePlural: 'orderMaterials',
  labelSingular: 'Расход по заказу',
  labelPlural: 'Расход по заказам',
  icon: 'IconBox',
  labelIdentifierFieldMetadataUniversalIdentifier: orderMaterial.name,
  fields: [
    {
      universalIdentifier: orderMaterial.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: orderMaterial.order,
      type: FieldType.RELATION,
      name: 'order',
      label: 'Заказ',
      icon: 'IconClipboardList',
      relationTargetObjectMetadataUniversalIdentifier: IDS.order.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.order.materials,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'orderId',
      },
    },
    {
      universalIdentifier: orderMaterial.material,
      type: FieldType.RELATION,
      name: 'material',
      label: 'Материал',
      icon: 'IconBox',
      relationTargetObjectMetadataUniversalIdentifier: IDS.material.object,
      relationTargetFieldMetadataUniversalIdentifier:
        IDS.material.orderMaterials,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'materialId',
      },
    },
    quantity(
      orderMaterial.plannedQuantity,
      'plannedQuantity',
      'По норме',
      'IconRuler',
    ),
    quantity(
      orderMaterial.writtenOffQuantity,
      'writtenOffQuantity',
      'Списано',
      'IconPackageExport',
    ),
    {
      universalIdentifier: orderMaterial.movements,
      type: FieldType.RELATION,
      name: 'movements',
      label: 'Движения',
      icon: 'IconArrowsExchange',
      relationTargetObjectMetadataUniversalIdentifier: IDS.stockMovement.object,
      relationTargetFieldMetadataUniversalIdentifier:
        IDS.stockMovement.orderMaterial,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ],
});
