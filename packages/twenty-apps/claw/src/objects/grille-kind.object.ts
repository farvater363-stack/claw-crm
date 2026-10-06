import { defineObject, FieldType, RelationType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

const { grilleKind } = IDS;

export default defineObject({
  universalIdentifier: grilleKind.object,
  nameSingular: 'grilleKind',
  namePlural: 'grilleKinds',
  labelSingular: 'Вид решётки',
  labelPlural: 'Виды решёток',
  icon: 'IconHammer',
  labelIdentifierFieldMetadataUniversalIdentifier: grilleKind.name,
  fields: [
    {
      universalIdentifier: grilleKind.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: grilleKind.designs,
      type: FieldType.RELATION,
      name: 'designs',
      label: 'Решётки',
      icon: 'IconLayoutGrid',
      relationTargetObjectMetadataUniversalIdentifier: IDS.design.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.design.grilleKind,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ],
});
