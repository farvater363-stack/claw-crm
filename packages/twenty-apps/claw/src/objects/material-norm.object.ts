import {
  defineObject,
  FieldType,
  NumberDataType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

const { materialNorm } = IDS;

const manyToOne = (
  universalIdentifier: string,
  name: string,
  label: string,
  icon: string,
  targetObject: string,
  targetField: string,
) =>
  ({
    universalIdentifier,
    type: FieldType.RELATION,
    name,
    label,
    icon,
    relationTargetObjectMetadataUniversalIdentifier: targetObject,
    relationTargetFieldMetadataUniversalIdentifier: targetField,
    universalSettings: {
      relationType: RelationType.MANY_TO_ONE,
      onDelete: OnDeleteAction.SET_NULL,
      joinColumnName: `${name}Id`,
    },
  }) as const;

export default defineObject({
  universalIdentifier: materialNorm.object,
  nameSingular: 'materialNorm',
  namePlural: 'materialNorms',
  labelSingular: 'Материал в составе',
  labelPlural: 'Из чего делается',
  icon: 'IconRuler',
  labelIdentifierFieldMetadataUniversalIdentifier: materialNorm.name,
  fields: [
    {
      universalIdentifier: materialNorm.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
    manyToOne(
      materialNorm.material,
      'material',
      'Материал',
      'IconBox',
      IDS.material.object,
      IDS.material.norms,
    ),
    manyToOne(
      materialNorm.priceListItem,
      'priceListItem',
      'Строка прайса (на 1 м²)',
      'IconReceipt2',
      IDS.priceListItem.object,
      IDS.priceListItem.norms,
    ),
    manyToOne(
      materialNorm.design,
      'design',
      'Решётка (на 1 м²)',
      'IconPalette',
      IDS.design.object,
      IDS.design.norms,
    ),
    manyToOne(
      materialNorm.extraService,
      'extraService',
      'Доп. услуга (на ед.)',
      'IconTool',
      IDS.extraService.object,
      IDS.extraService.norms,
    ),
    {
      universalIdentifier: materialNorm.quantityPerUnit,
      type: FieldType.NUMBER,
      name: 'quantityPerUnit',
      label: 'Расход на ед.',
      icon: 'IconHash',
      isNullable: true,
      universalSettings: { decimals: 3, dataType: NumberDataType.FLOAT },
    },
  ],
});
