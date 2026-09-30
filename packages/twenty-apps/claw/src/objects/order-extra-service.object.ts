import {
  defineObject,
  FieldType,
  NumberDataType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { FULL_MONEY_DISPLAY } from 'src/constants/money-display';
import { IDS } from 'src/constants/universal-identifiers';

const money = (universalIdentifier: string, name: string, label: string) =>
  ({
    universalIdentifier,
    type: FieldType.CURRENCY,
    name,
    label,
    icon: 'IconCurrency',
    isNullable: true,
    universalSettings: FULL_MONEY_DISPLAY,
  }) as const;

export default defineObject({
  universalIdentifier: IDS.orderExtraService.object,
  nameSingular: 'orderExtraService',
  namePlural: 'orderExtraServices',
  labelSingular: 'Услуга в заказе',
  labelPlural: 'Услуги в заказе',
  icon: 'IconTool',
  labelIdentifierFieldMetadataUniversalIdentifier: IDS.orderExtraService.name,
  fields: [
    {
      universalIdentifier: IDS.orderExtraService.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
      isNullable: true,
    },
    {
      universalIdentifier: IDS.orderExtraService.quantity,
      type: FieldType.NUMBER,
      name: 'quantity',
      label: 'Количество (шт / п.м. / м²)',
      icon: 'IconHash',
      isNullable: true,
      universalSettings: { decimals: 2, dataType: NumberDataType.FLOAT },
    },
    money(IDS.orderExtraService.price, 'price', 'Цена'),
    money(IDS.orderExtraService.lineTotal, 'lineTotal', 'Сумма'),
    money(IDS.orderExtraService.cost, 'cost', 'Себестоимость за ед.'),
    money(IDS.orderExtraService.lineCost, 'lineCost', 'Себестоимость'),
    {
      universalIdentifier: IDS.orderExtraService.order,
      type: FieldType.RELATION,
      name: 'order',
      label: 'Заказ',
      icon: 'IconClipboardList',
      relationTargetObjectMetadataUniversalIdentifier: IDS.order.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.order.extraServices,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'orderId',
      },
    },
    {
      universalIdentifier: IDS.orderExtraService.extraService,
      type: FieldType.RELATION,
      name: 'extraService',
      label: 'Услуга',
      icon: 'IconTool',
      relationTargetObjectMetadataUniversalIdentifier: IDS.extraService.object,
      relationTargetFieldMetadataUniversalIdentifier:
        IDS.extraService.orderExtraServices,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'extraServiceId',
      },
    },
  ],
});
