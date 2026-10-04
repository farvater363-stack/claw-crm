import { defineObject, FieldType, RelationType } from 'twenty-sdk/define';

import { FULL_MONEY_DISPLAY } from 'src/constants/money-display';
import { withoutAuditOfAdminOnlyFields } from 'src/constants/admin-only-fields';
import { WORKER_CATEGORY_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';

const DEFAULT_RATE_PER_SQUARE_METER = 0;
const DEFAULT_PENALTY_PERCENT_PER_DAY = 0;

export default defineObject({
  universalIdentifier: IDS.master.object,
  nameSingular: 'master',
  namePlural: 'masters',
  labelSingular: 'Работник',
  labelPlural: 'Работники',
  icon: 'IconHammer',
  labelIdentifierFieldMetadataUniversalIdentifier: IDS.master.name,
  fields: withoutAuditOfAdminOnlyFields([
    {
      universalIdentifier: IDS.master.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Имя',
      icon: 'IconUser',
    },
    {
      universalIdentifier: IDS.master.phone,
      type: FieldType.TEXT,
      name: 'phone',
      label: 'Телефон',
      icon: 'IconPhone',
      isNullable: true,
    },
    {
      universalIdentifier: IDS.master.isActive,
      type: FieldType.BOOLEAN,
      name: 'isActive',
      label: 'Активен',
      icon: 'IconCheck',
      defaultValue: true,
    },
    {
      universalIdentifier: IDS.master.categories,
      type: FieldType.MULTI_SELECT,
      name: 'categories',
      label: 'Кто',
      icon: 'IconUsers',
      isNullable: true,
      options: WORKER_CATEGORY_OPTIONS,
    },
    {
      universalIdentifier: IDS.master.ratePerSquareMeter,
      type: FieldType.CURRENCY,
      universalSettings: FULL_MONEY_DISPLAY,
      name: 'ratePerSquareMeter',
      label: 'Ставка за м²',
      icon: 'IconCurrency',
      // SDK types amountMicros as string, but a string default warns as an unquoted literal; the server takes a number
      defaultValue: {
        amountMicros: (DEFAULT_RATE_PER_SQUARE_METER *
          1_000_000) as unknown as string,
        currencyCode: "'UZS'",
      },
    },
    {
      universalIdentifier: IDS.master.penaltyPercentPerDay,
      type: FieldType.NUMBER,
      name: 'penaltyPercentPerDay',
      label: 'Штраф за день просрочки, %',
      icon: 'IconPercentage',
      defaultValue: DEFAULT_PENALTY_PERCENT_PER_DAY,
    },
    {
      universalIdentifier: IDS.master.orders,
      type: FieldType.RELATION,
      name: 'orders',
      label: 'Заказы',
      icon: 'IconClipboardList',
      relationTargetObjectMetadataUniversalIdentifier: IDS.order.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.order.master,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
    {
      universalIdentifier: IDS.master.payments,
      type: FieldType.RELATION,
      name: 'payments',
      label: 'Выплаты',
      icon: 'IconCash',
      relationTargetObjectMetadataUniversalIdentifier: IDS.masterPayment.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.masterPayment.master,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
      isAuditLogged: false,
    },
    {
      universalIdentifier: IDS.master.payRules,
      type: FieldType.RELATION,
      name: 'payRules',
      label: 'Как платим',
      icon: 'IconCoins',
      relationTargetObjectMetadataUniversalIdentifier: IDS.payRule.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.payRule.worker,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
      isAuditLogged: false,
    },
    {
      universalIdentifier: IDS.master.accruals,
      type: FieldType.RELATION,
      name: 'accruals',
      label: 'Начисления',
      icon: 'IconReceipt',
      relationTargetObjectMetadataUniversalIdentifier: IDS.payAccrual.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.payAccrual.worker,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
      isAuditLogged: false,
    },
    {
      universalIdentifier: IDS.master.installedOrders,
      type: FieldType.RELATION,
      name: 'installedOrders',
      label: 'Заказы на установку',
      icon: 'IconTool',
      relationTargetObjectMetadataUniversalIdentifier: IDS.order.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.order.installer,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
    {
      universalIdentifier: IDS.master.soldOrders,
      type: FieldType.RELATION,
      name: 'soldOrders',
      label: 'Проданные заказы',
      icon: 'IconClipboardList',
      relationTargetObjectMetadataUniversalIdentifier: IDS.order.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.order.soldBy,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ]),
});
