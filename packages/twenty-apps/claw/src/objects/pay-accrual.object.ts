import {
  defineObject,
  FieldType,
  NumberDataType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  ACCRUAL_METHOD_OPTIONS,
  WORKER_CATEGORY_OPTIONS,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { money } from 'src/objects/money-field';

const { payAccrual } = IDS;

// Every role can read the timeline, so pay values are never audit-logged.
const NOT_AUDIT_LOGGED = { isAuditLogged: false } as const;

const decimal = (universalIdentifier: string, name: string, label: string) =>
  ({
    universalIdentifier,
    type: FieldType.NUMBER,
    name,
    label,
    icon: 'IconNumbers',
    isNullable: true,
    universalSettings: { decimals: 2, dataType: NumberDataType.FLOAT },
    ...NOT_AUDIT_LOGGED,
  }) as const;

export default defineObject({
  universalIdentifier: payAccrual.object,
  nameSingular: 'payAccrual',
  namePlural: 'payAccruals',
  labelSingular: 'Начисление',
  labelPlural: 'Начисления',
  icon: 'IconReceipt',
  labelIdentifierFieldMetadataUniversalIdentifier: payAccrual.name,
  fields: [
    {
      universalIdentifier: payAccrual.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
      ...NOT_AUDIT_LOGGED,
    },
    {
      universalIdentifier: payAccrual.earnedOn,
      type: FieldType.DATE,
      name: 'earnedOn',
      label: 'Дата',
      icon: 'IconCalendar',
      isNullable: true,
      ...NOT_AUDIT_LOGGED,
    },
    {
      universalIdentifier: payAccrual.method,
      type: FieldType.SELECT,
      name: 'method',
      label: 'Способ',
      icon: 'IconTag',
      isNullable: true,
      options: ACCRUAL_METHOD_OPTIONS,
      ...NOT_AUDIT_LOGGED,
    },
    {
      universalIdentifier: payAccrual.work,
      type: FieldType.SELECT,
      name: 'work',
      label: 'За что',
      icon: 'IconUsers',
      isNullable: true,
      options: WORKER_CATEGORY_OPTIONS,
      ...NOT_AUDIT_LOGGED,
    },
    decimal(payAccrual.basis, 'basis', 'Количество'),
    decimal(payAccrual.rate, 'rate', 'Ставка'),
    money(payAccrual.amount, 'amount', 'Сумма', NOT_AUDIT_LOGGED),
    // Which row of «Ставки цеха» a workshop line was paid by: «kind:…»,
    // «design:…», «none» or «rule». Empty on lines written before that table.
    {
      universalIdentifier: payAccrual.part,
      type: FieldType.TEXT,
      name: 'part',
      label: 'Строка ставки',
      icon: 'IconTag',
      isNullable: true,
      ...NOT_AUDIT_LOGGED,
    },
    {
      universalIdentifier: payAccrual.worker,
      type: FieldType.RELATION,
      name: 'worker',
      label: 'Работник',
      icon: 'IconHammer',
      relationTargetObjectMetadataUniversalIdentifier: IDS.master.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.master.accruals,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'workerId',
      },
      ...NOT_AUDIT_LOGGED,
    },
    {
      universalIdentifier: payAccrual.order,
      type: FieldType.RELATION,
      name: 'order',
      label: 'Заказ',
      icon: 'IconClipboardList',
      relationTargetObjectMetadataUniversalIdentifier: IDS.order.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.order.accruals,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'orderId',
      },
      ...NOT_AUDIT_LOGGED,
    },
  ],
});
