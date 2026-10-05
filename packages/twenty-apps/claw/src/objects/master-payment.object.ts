import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { MASTER_PAYMENT_KIND_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { money } from 'src/objects/money-field';

const { masterPayment } = IDS;

// Every role can read the timeline, so payment values are never audit-logged.
const NOT_AUDIT_LOGGED = { isAuditLogged: false } as const;

export default defineObject({
  universalIdentifier: masterPayment.object,
  nameSingular: 'masterPayment',
  namePlural: 'masterPayments',
  labelSingular: 'Выплата',
  labelPlural: 'Выплаты',
  icon: 'IconCash',
  labelIdentifierFieldMetadataUniversalIdentifier: masterPayment.name,
  fields: [
    {
      universalIdentifier: masterPayment.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
      ...NOT_AUDIT_LOGGED,
    },
    {
      universalIdentifier: masterPayment.paidOn,
      type: FieldType.DATE,
      name: 'paidOn',
      label: 'Дата',
      icon: 'IconCalendar',
      isNullable: true,
      ...NOT_AUDIT_LOGGED,
    },
    money(masterPayment.amount, 'amount', 'Сумма', NOT_AUDIT_LOGGED),
    {
      universalIdentifier: masterPayment.kind,
      type: FieldType.SELECT,
      name: 'kind',
      label: 'Тип',
      icon: 'IconTag',
      isNullable: true,
      options: MASTER_PAYMENT_KIND_OPTIONS,
      ...NOT_AUDIT_LOGGED,
    },
    {
      universalIdentifier: masterPayment.comment,
      type: FieldType.TEXT,
      name: 'comment',
      label: 'Комментарий',
      icon: 'IconMessage',
      isNullable: true,
      ...NOT_AUDIT_LOGGED,
    },
    {
      universalIdentifier: masterPayment.master,
      type: FieldType.RELATION,
      name: 'master',
      label: 'Работник',
      icon: 'IconHammer',
      relationTargetObjectMetadataUniversalIdentifier: IDS.master.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.master.payments,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'masterId',
      },
      ...NOT_AUDIT_LOGGED,
    },
  ],
});
