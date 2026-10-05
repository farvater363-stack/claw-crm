import {
  defineObject,
  FieldType,
  NumberDataType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { withoutAuditOfAdminOnlyFields } from 'src/constants/admin-only-fields';
import { IDS } from 'src/constants/universal-identifiers';
import { money } from 'src/objects/money-field';

const centimeters = (
  universalIdentifier: string,
  name: string,
  label: string,
) =>
  ({
    universalIdentifier,
    type: FieldType.NUMBER,
    name,
    label,
    icon: 'IconRuler2',
    isNullable: true,
  }) as const;
export default defineObject({
  universalIdentifier: IDS.orderItem.object,
  nameSingular: 'orderItem',
  namePlural: 'orderItems',
  labelSingular: 'Позиция',
  labelPlural: 'Позиции',
  icon: 'IconRuler',
  labelIdentifierFieldMetadataUniversalIdentifier: IDS.orderItem.name,
  fields: withoutAuditOfAdminOnlyFields([
    {
      universalIdentifier: IDS.orderItem.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Размер',
      icon: 'IconAbc',
      isNullable: true,
    },
    centimeters(IDS.orderItem.widthCm, 'widthCm', 'Ширина, см'),
    centimeters(IDS.orderItem.heightCm, 'heightCm', 'Высота, см'),
    {
      ...centimeters(IDS.orderItem.projectionCm, 'projectionCm', 'Вылет, см'),
      defaultValue: 0,
    },
    {
      universalIdentifier: IDS.orderItem.quantity,
      type: FieldType.NUMBER,
      name: 'quantity',
      label: 'Количество',
      icon: 'IconHash',
      defaultValue: 1,
    },
    {
      universalIdentifier: IDS.orderItem.photos,
      type: FieldType.FILES,
      name: 'photos',
      label: 'Фото схемы / проёма',
      icon: 'IconCamera',
      isNullable: true,
      universalSettings: { maxNumberOfValues: 5 },
    },
    {
      universalIdentifier: IDS.orderItem.areaSquareMeters,
      type: FieldType.NUMBER,
      name: 'areaSquareMeters',
      label: 'Площадь, м²',
      icon: 'IconRuler',
      isNullable: true,
      universalSettings: { decimals: 2, dataType: NumberDataType.FLOAT },
    },
    money(
      IDS.orderItem.pricePerSquareMeter,
      'pricePerSquareMeter',
      'Цена за м²',
    ),
    money(IDS.orderItem.lineTotal, 'lineTotal', 'Сумма'),
    money(
      IDS.orderItem.costPerSquareMeter,
      'costPerSquareMeter',
      'Себестоимость за м²',
    ),
    money(IDS.orderItem.lineCost, 'lineCost', 'Себестоимость'),
    {
      universalIdentifier: IDS.orderItem.notes,
      type: FieldType.TEXT,
      name: 'notes',
      label: 'Заметки',
      icon: 'IconNotes',
      isNullable: true,
    },
    {
      universalIdentifier: IDS.orderItem.order,
      type: FieldType.RELATION,
      name: 'order',
      label: 'Заказ',
      icon: 'IconClipboardList',
      relationTargetObjectMetadataUniversalIdentifier: IDS.order.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.order.items,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'orderId',
      },
    },
    {
      universalIdentifier: IDS.orderItem.design,
      type: FieldType.RELATION,
      name: 'design',
      label: 'Решётка',
      icon: 'IconPalette',
      relationTargetObjectMetadataUniversalIdentifier: IDS.design.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.design.orderItems,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'designId',
      },
    },
    {
      universalIdentifier: IDS.orderItem.extraServices,
      type: FieldType.RELATION,
      name: 'extraServices',
      label: 'Козырьки',
      icon: 'IconTool',
      relationTargetObjectMetadataUniversalIdentifier:
        IDS.orderExtraService.object,
      relationTargetFieldMetadataUniversalIdentifier:
        IDS.orderExtraService.orderItem,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ]),
});
