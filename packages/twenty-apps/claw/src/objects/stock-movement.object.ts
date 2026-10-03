import {
  defineObject,
  FieldType,
  NumberDataType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { withoutAuditOfAdminOnlyFields } from 'src/constants/admin-only-fields';
import { FULL_MONEY_DISPLAY } from 'src/constants/money-display';
import { STOCK_MOVEMENT_KIND_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';

const { stockMovement } = IDS;

const FLOAT_2 = { decimals: 2, dataType: NumberDataType.FLOAT } as const;

export default defineObject({
  universalIdentifier: stockMovement.object,
  nameSingular: 'stockMovement',
  namePlural: 'stockMovements',
  labelSingular: 'Движение склада',
  labelPlural: 'Движения склада',
  icon: 'IconArrowsExchange',
  labelIdentifierFieldMetadataUniversalIdentifier: stockMovement.name,
  fields: withoutAuditOfAdminOnlyFields([
    {
      universalIdentifier: stockMovement.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: stockMovement.kind,
      type: FieldType.SELECT,
      name: 'kind',
      label: 'Тип',
      icon: 'IconTag',
      defaultValue: "'RECEIPT'",
      options: STOCK_MOVEMENT_KIND_OPTIONS,
    },
    {
      universalIdentifier: stockMovement.material,
      type: FieldType.RELATION,
      name: 'material',
      label: 'Материал',
      icon: 'IconBox',
      relationTargetObjectMetadataUniversalIdentifier: IDS.material.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.material.movements,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'materialId',
      },
    },
    {
      universalIdentifier: stockMovement.quantity,
      type: FieldType.NUMBER,
      name: 'quantity',
      label: 'Количество (+ приход, − расход)',
      icon: 'IconPlusMinus',
      isNullable: true,
      universalSettings: FLOAT_2,
    },
    {
      universalIdentifier: stockMovement.countedQuantity,
      type: FieldType.NUMBER,
      name: 'countedQuantity',
      label: 'Посчитано (инвентаризация)',
      icon: 'IconListCheck',
      isNullable: true,
      universalSettings: FLOAT_2,
    },
    {
      universalIdentifier: stockMovement.unitPrice,
      type: FieldType.CURRENCY,
      name: 'unitPrice',
      label: 'Цена за ед.',
      icon: 'IconCurrency',
      isNullable: true,
      universalSettings: FULL_MONEY_DISPLAY,
    },
    {
      universalIdentifier: stockMovement.date,
      type: FieldType.DATE,
      name: 'date',
      label: 'Дата',
      icon: 'IconCalendar',
      isNullable: true,
    },
    {
      universalIdentifier: stockMovement.comment,
      type: FieldType.TEXT,
      name: 'comment',
      label: 'Комментарий',
      icon: 'IconMessage',
      isNullable: true,
    },
  ]),
});
