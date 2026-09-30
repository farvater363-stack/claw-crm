import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { METAL_OPTIONS, METAL_SIZE_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';

const currencyField = (universalIdentifier: string, name: string, label: string) => ({
  universalIdentifier,
  type: FieldType.CURRENCY,
  name,
  label,
  icon: 'IconCurrency',
  isNullable: true,
} as const);

export default defineObject({
  universalIdentifier: IDS.priceListItem.object,
  nameSingular: 'priceListItem',
  namePlural: 'priceListItems',
  labelSingular: 'Строка прайса',
  labelPlural: 'Прайс',
  icon: 'IconReceipt2',
  labelIdentifierFieldMetadataUniversalIdentifier: IDS.priceListItem.name,
  fields: [
    { universalIdentifier: IDS.priceListItem.name, type: FieldType.TEXT, name: 'name', label: 'Название', icon: 'IconAbc' },
    { universalIdentifier: IDS.priceListItem.metal, type: FieldType.SELECT, name: 'metal', label: 'Металл', icon: 'IconBarbell', isNullable: true, options: METAL_OPTIONS },
    { universalIdentifier: IDS.priceListItem.metalSize, type: FieldType.SELECT, name: 'metalSize', label: 'Размер металла', icon: 'IconRuler2', isNullable: true, options: METAL_SIZE_OPTIONS },
    currencyField(IDS.priceListItem.pricePerSquareMeter, 'pricePerSquareMeter', 'Цена за м²'),
    currencyField(IDS.priceListItem.materialCostPerSquareMeter, 'materialCostPerSquareMeter', 'Материал за м²'),
    currencyField(IDS.priceListItem.manufacturingCostPerSquareMeter, 'manufacturingCostPerSquareMeter', 'Изготовление за м²'),
    currencyField(IDS.priceListItem.installationCostPerSquareMeter, 'installationCostPerSquareMeter', 'Установка за м²'),
    {
      universalIdentifier: IDS.priceListItem.design,
      type: FieldType.RELATION,
      name: 'design',
      label: 'Дизайн',
      icon: 'IconPalette',
      relationTargetObjectMetadataUniversalIdentifier: IDS.design.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.design.priceListItems,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'designId',
      },
    },
  ],
});
