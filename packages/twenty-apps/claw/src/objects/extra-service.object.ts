import { defineObject, FieldType, RelationType } from 'twenty-sdk/define';

import {
  EXTRA_SERVICE_KIND_OPTIONS,
  EXTRA_SERVICE_UNIT_OPTIONS,
} from 'src/constants/select-options';
import { withoutAuditOfAdminOnlyFields } from 'src/constants/admin-only-fields';
import { IDS } from 'src/constants/universal-identifiers';
import { money } from 'src/objects/money-field';

export default defineObject({
  universalIdentifier: IDS.extraService.object,
  nameSingular: 'extraService',
  namePlural: 'extraServices',
  labelSingular: 'Козырёк или услуга',
  labelPlural: 'Козырьки и услуги',
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
      universalIdentifier: IDS.extraService.kind,
      type: FieldType.SELECT,
      name: 'kind',
      label: 'Вид',
      icon: 'IconCategory',
      defaultValue: "'SERVICE'",
      options: EXTRA_SERVICE_KIND_OPTIONS,
    },
    money(IDS.extraService.price, 'price', 'Цена'),
    money(IDS.extraService.cost, 'cost', 'Себестоимость', { icon: 'IconCoin' }),
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
      label: 'Из чего делается',
      icon: 'IconRuler',
      relationTargetObjectMetadataUniversalIdentifier: IDS.materialNorm.object,
      relationTargetFieldMetadataUniversalIdentifier:
        IDS.materialNorm.extraService,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ]),
});
