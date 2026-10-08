import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  MONEY_ENTRY_KIND_OPTIONS,
  WALLET_OPTIONS,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { money } from 'src/objects/money-field';

const { moneyEntry } = IDS;

// Money the app does not already know from orders, pay and purchases: rent,
// fuel, what the owner took, what a supplier was paid. The amount is always
// positive; the kind says which way it went.
export default defineObject({
  universalIdentifier: moneyEntry.object,
  nameSingular: 'moneyEntry',
  namePlural: 'moneyEntries',
  labelSingular: 'Запись в деньгах',
  labelPlural: 'Деньги',
  icon: 'IconCash',
  labelIdentifierFieldMetadataUniversalIdentifier: moneyEntry.name,
  fields: [
    {
      universalIdentifier: moneyEntry.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: moneyEntry.date,
      type: FieldType.DATE,
      name: 'date',
      label: 'Дата',
      icon: 'IconCalendar',
      isNullable: true,
    },
    {
      universalIdentifier: moneyEntry.kind,
      type: FieldType.SELECT,
      name: 'kind',
      label: 'Тип',
      icon: 'IconTag',
      defaultValue: "'EXPENSE'",
      options: MONEY_ENTRY_KIND_OPTIONS,
    },
    money(moneyEntry.amount, 'amount', 'Сумма'),
    {
      universalIdentifier: moneyEntry.wallet,
      type: FieldType.SELECT,
      name: 'wallet',
      label: 'Откуда',
      icon: 'IconWallet',
      defaultValue: "'CASH'",
      options: WALLET_OPTIONS,
    },
    {
      universalIdentifier: moneyEntry.comment,
      type: FieldType.TEXT,
      name: 'comment',
      label: 'Комментарий',
      icon: 'IconMessage',
      isNullable: true,
    },
    {
      universalIdentifier: moneyEntry.receiptPhotos,
      type: FieldType.FILES,
      name: 'receiptPhotos',
      label: 'Фото чека',
      icon: 'IconReceipt',
      isNullable: true,
      universalSettings: { maxNumberOfValues: 5 },
    },
    {
      universalIdentifier: moneyEntry.supplier,
      type: FieldType.RELATION,
      name: 'supplier',
      label: 'Поставщик',
      icon: 'IconTruck',
      relationTargetObjectMetadataUniversalIdentifier: IDS.supplier.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.supplier.moneyEntries,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'supplierId',
      },
    },
    {
      universalIdentifier: moneyEntry.purchase,
      type: FieldType.RELATION,
      name: 'purchase',
      label: 'Приход',
      icon: 'IconTruckDelivery',
      relationTargetObjectMetadataUniversalIdentifier: IDS.purchase.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.purchase.moneyEntries,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'purchaseId',
      },
    },
  ],
});
