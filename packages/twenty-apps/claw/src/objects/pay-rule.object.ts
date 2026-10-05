import {
  defineObject,
  FieldType,
  NumberDataType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  PAY_METHOD_OPTIONS,
  WORKER_CATEGORY_OPTIONS,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { money } from 'src/objects/money-field';

const { payRule } = IDS;

// Every role can read the timeline, so pay values are never audit-logged.
const NOT_AUDIT_LOGGED = { isAuditLogged: false } as const;

export default defineObject({
  universalIdentifier: payRule.object,
  nameSingular: 'payRule',
  namePlural: 'payRules',
  labelSingular: 'Правило оплаты',
  labelPlural: 'Правила оплаты',
  icon: 'IconCoins',
  labelIdentifierFieldMetadataUniversalIdentifier: payRule.name,
  fields: [
    {
      universalIdentifier: payRule.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
      ...NOT_AUDIT_LOGGED,
    },
    {
      universalIdentifier: payRule.method,
      type: FieldType.SELECT,
      name: 'method',
      label: 'Способ',
      icon: 'IconTag',
      isNullable: true,
      options: PAY_METHOD_OPTIONS,
      ...NOT_AUDIT_LOGGED,
    },
    {
      universalIdentifier: payRule.work,
      type: FieldType.SELECT,
      name: 'work',
      label: 'За что',
      icon: 'IconUsers',
      isNullable: true,
      options: WORKER_CATEGORY_OPTIONS,
      ...NOT_AUDIT_LOGGED,
    },
    money(payRule.amount, 'amount', 'Сумма', NOT_AUDIT_LOGGED),
    {
      universalIdentifier: payRule.percent,
      type: FieldType.NUMBER,
      name: 'percent',
      label: 'Процент',
      icon: 'IconPercentage',
      isNullable: true,
      universalSettings: { decimals: 2, dataType: NumberDataType.FLOAT },
      ...NOT_AUDIT_LOGGED,
    },
    {
      universalIdentifier: payRule.worker,
      type: FieldType.RELATION,
      name: 'worker',
      label: 'Работник',
      icon: 'IconHammer',
      relationTargetObjectMetadataUniversalIdentifier: IDS.master.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.master.payRules,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'workerId',
      },
      ...NOT_AUDIT_LOGGED,
    },
  ],
});
