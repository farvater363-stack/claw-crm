import { defineObject, FieldType, RelationType } from 'twenty-sdk/define';

import {
  EXPENSE_CATEGORY_OPTIONS,
  WALLET_OPTIONS,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { money } from 'src/objects/money-field';

const { recurringExpense } = IDS;

// Rent, salaries and the like: due on the same day every month. Paying one
// writes a money entry linked to it, which is how a month counts as paid.
export default defineObject({
  universalIdentifier: recurringExpense.object,
  nameSingular: 'recurringExpense',
  namePlural: 'recurringExpenses',
  labelSingular: 'Постоянный расход',
  labelPlural: 'Постоянные расходы',
  icon: 'IconRepeat',
  labelIdentifierFieldMetadataUniversalIdentifier: recurringExpense.name,
  fields: [
    {
      universalIdentifier: recurringExpense.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
    money(recurringExpense.amount, 'amount', 'Сумма в месяц'),
    {
      universalIdentifier: recurringExpense.dayOfMonth,
      type: FieldType.NUMBER,
      name: 'dayOfMonth',
      label: 'Какого числа',
      icon: 'IconCalendar',
      isNullable: true,
    },
    {
      universalIdentifier: recurringExpense.wallet,
      type: FieldType.SELECT,
      name: 'wallet',
      label: 'Откуда',
      icon: 'IconWallet',
      defaultValue: "'CASH'",
      options: WALLET_OPTIONS,
    },
    {
      universalIdentifier: recurringExpense.category,
      type: FieldType.SELECT,
      name: 'category',
      label: 'На что',
      icon: 'IconCategory',
      isNullable: true,
      options: EXPENSE_CATEGORY_OPTIONS,
    },
    {
      universalIdentifier: recurringExpense.isActive,
      type: FieldType.BOOLEAN,
      name: 'isActive',
      label: 'Платим',
      icon: 'IconCheck',
      defaultValue: true,
    },
    {
      universalIdentifier: recurringExpense.moneyEntries,
      type: FieldType.RELATION,
      name: 'moneyEntries',
      label: 'Оплаты',
      icon: 'IconCash',
      relationTargetObjectMetadataUniversalIdentifier: IDS.moneyEntry.object,
      relationTargetFieldMetadataUniversalIdentifier:
        IDS.moneyEntry.recurringExpense,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ],
});
