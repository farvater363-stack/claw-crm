import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { METAL_OPTIONS } from 'src/constants/select-options';
import { withoutAuditOfAdminOnlyFields } from 'src/constants/admin-only-fields';
import { IDS } from 'src/constants/universal-identifiers';
import { money } from 'src/objects/money-field';

export default defineObject({
  universalIdentifier: IDS.design.object,
  nameSingular: 'design',
  namePlural: 'designs',
  labelSingular: 'Решётка',
  labelPlural: 'Решётки',
  icon: 'IconPalette',
  labelIdentifierFieldMetadataUniversalIdentifier: IDS.design.name,
  fields: withoutAuditOfAdminOnlyFields([
    {
      universalIdentifier: IDS.design.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: IDS.design.photos,
      type: FieldType.FILES,
      name: 'photos',
      label: 'Фото',
      icon: 'IconPhoto',
      isNullable: true,
      universalSettings: { maxNumberOfValues: 5 },
    },
    {
      universalIdentifier: IDS.design.metal,
      type: FieldType.SELECT,
      name: 'metal',
      label: 'Металл',
      icon: 'IconHammer',
      isNullable: true,
      options: METAL_OPTIONS,
    },
    // What the workshop calls this kind of grille, from the owner's own list.
    // `metal` above is what it was before the list could be edited.
    {
      universalIdentifier: IDS.design.grilleKind,
      type: FieldType.RELATION,
      name: 'grilleKind',
      label: 'Вид решётки для цеха',
      icon: 'IconHammer',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier: IDS.grilleKind.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.grilleKind.designs,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'grilleKindId',
      },
    },
    money(IDS.design.pricePerSquareMeter, 'pricePerSquareMeter', 'Цена за м²'),
    money(
      IDS.design.materialCostPerSquareMeter,
      'materialCostPerSquareMeter',
      'Материал за м²',
    ),
    money(
      IDS.design.manufacturingCostPerSquareMeter,
      'manufacturingCostPerSquareMeter',
      'Работа за м²',
    ),
    money(
      IDS.design.installationCostPerSquareMeter,
      'installationCostPerSquareMeter',
      'Установка за м²',
    ),
    {
      universalIdentifier: IDS.design.norms,
      type: FieldType.RELATION,
      name: 'norms',
      label: 'Из чего делается',
      icon: 'IconRuler',
      relationTargetObjectMetadataUniversalIdentifier: IDS.materialNorm.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.materialNorm.design,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
    {
      universalIdentifier: IDS.design.orderItems,
      type: FieldType.RELATION,
      name: 'orderItems',
      label: 'Позиции заказов',
      icon: 'IconRuler',
      relationTargetObjectMetadataUniversalIdentifier: IDS.orderItem.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.orderItem.design,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ]),
});
