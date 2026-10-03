import { defineObject, FieldType, RelationType } from 'twenty-sdk/define';

import { EXTRA_SERVICE_UNIT_OPTIONS } from 'src/constants/select-options';
import { FULL_MONEY_DISPLAY } from 'src/constants/money-display';
import { withoutAuditOfAdminOnlyFields } from 'src/constants/admin-only-fields';
import { IDS } from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: IDS.extraService.object,
  nameSingular: 'extraService',
  namePlural: 'extraServices',
  labelSingular: 'Доп. услуга',
  labelPlural: 'Доп. услуги',
  icon: 'IconTool',
  labelIdentifierFieldMetadataUniversalIdentifier: IDS.extraService.name,
  fields: withoutAuditOfAdminOnlyFields([
    {
      universalIdentifier: IDS.extraService.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: IDS.extraService.unit,
      type: FieldType.SELECT,
      name: 'unit',
      label: 'Единица',
      icon: 'IconRuler2',
      defaultValue: "'FIXED'",
      options: EXTRA_SERVICE_UNIT_OPTIONS,
    },
    {
      universalIdentifier: IDS.extraService.price,
      type: FieldType.CURRENCY,
      name: 'price',
      label: 'Цена',
      icon: 'IconCurrency',
      isNullable: true,
      universalSettings: FULL_MONEY_DISPLAY,
    },
    {
      universalIdentifier: IDS.extraService.cost,
      type: FieldType.CURRENCY,
      name: 'cost',
      label: 'Себестоимость',
      icon: 'IconCoin',
      isNullable: true,
      universalSettings: FULL_MONEY_DISPLAY,
    },
    {
      universalIdentifier: IDS.extraService.orderExtraServices,
      type: FieldType.RELATION,
      name: 'orderExtraServices',
      label: 'В заказах',
      icon: 'IconClipboardList',
      relationTargetObjectMetadataUniversalIdentifier:
        IDS.orderExtraService.object,
      relationTargetFieldMetadataUniversalIdentifier:
        IDS.orderExtraService.extraService,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
    {
      universalIdentifier: IDS.extraService.norms,
      type: FieldType.RELATION,
      name: 'norms',
      label: 'Нормы расхода (на ед.)',
      icon: 'IconRuler',
      relationTargetObjectMetadataUniversalIdentifier: IDS.materialNorm.object,
      relationTargetFieldMetadataUniversalIdentifier:
        IDS.materialNorm.extraService,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ]),
});
