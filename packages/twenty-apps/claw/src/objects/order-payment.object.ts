import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { PAYMENT_METHOD_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { money } from 'src/objects/money-field';

const { orderPayment } = IDS;

export default defineObject({
  universalIdentifier: orderPayment.object,
  nameSingular: 'orderPayment',
  namePlural: 'orderPayments',
  labelSingular: 'Оплата',
  labelPlural: 'Оплаты',
  icon: 'IconCash',
  labelIdentifierFieldMetadataUniversalIdentifier: orderPayment.name,
  fields: [
    {
      universalIdentifier: orderPayment.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
    // No "now" default: it is the UTC day, which is yesterday in Tashkent until
    // 05:00. The created trigger fills an empty date with the Tashkent day.
    {
      universalIdentifier: orderPayment.paidOn,
      type: FieldType.DATE,
      name: 'paidOn',
      label: 'Дата',
      icon: 'IconCalendar',
      isNullable: true,
    },
    money(orderPayment.amount, 'amount', 'Сумма'),
    {
      universalIdentifier: orderPayment.method,
      type: FieldType.SELECT,
      name: 'method',
      label: 'Способ',
      icon: 'IconCreditCard',
      defaultValue: "'CASH'",
      options: PAYMENT_METHOD_OPTIONS,
    },
    {
      universalIdentifier: orderPayment.comment,
      type: FieldType.TEXT,
      name: 'comment',
      label: 'Комментарий',
      icon: 'IconMessage',
      isNullable: true,
    },
    {
      universalIdentifier: orderPayment.order,
      type: FieldType.RELATION,
      name: 'order',
      label: 'Заказ',
      icon: 'IconClipboardList',
      relationTargetObjectMetadataUniversalIdentifier: IDS.order.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.order.payments,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'orderId',
      },
    },
  ],
});
