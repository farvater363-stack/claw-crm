import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { money } from 'src/objects/money-field';

const { workshopRate } = IDS;

// Every role can read the timeline, so pay values are never audit-logged.
const NOT_AUDIT_LOGGED = { isAuditLogged: false } as const;

// One cell of «Ставки цеха»: what the workshop gets per m² of a grille kind,
// of one special grille, or of a grille with no kind (both empty). Without a
// worker it is the usual rate; with one it is that master's own.
export default defineObject({
  universalIdentifier: workshopRate.object,
  nameSingular: 'workshopRate',
  namePlural: 'workshopRates',
  labelSingular: 'Ставка цеха',
  labelPlural: 'Ставки цеха',
  icon: 'IconCoins',
  labelIdentifierFieldMetadataUniversalIdentifier: workshopRate.name,
  fields: [
    {
      universalIdentifier: workshopRate.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
      ...NOT_AUDIT_LOGGED,
    },
    money(workshopRate.rate, 'rate', 'За м²', NOT_AUDIT_LOGGED),
    {
      universalIdentifier: workshopRate.grilleKind,
      type: FieldType.RELATION,
      name: 'grilleKind',
      label: 'Вид решётки',
      icon: 'IconHammer',
      relationTargetObjectMetadataUniversalIdentifier: IDS.grilleKind.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.grilleKind.workshopRates,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'grilleKindId',
      },
      ...NOT_AUDIT_LOGGED,
    },
    {
      universalIdentifier: workshopRate.design,
      type: FieldType.RELATION,
      name: 'design',
      label: 'Решётка',
      icon: 'IconPalette',
      relationTargetObjectMetadataUniversalIdentifier: IDS.design.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.design.workshopRates,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'designId',
      },
      ...NOT_AUDIT_LOGGED,
    },
    {
      universalIdentifier: workshopRate.worker,
      type: FieldType.RELATION,
      name: 'worker',
      label: 'Мастер',
      icon: 'IconHammer',
      relationTargetObjectMetadataUniversalIdentifier: IDS.master.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.master.workshopRates,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'workerId',
      },
      ...NOT_AUDIT_LOGGED,
    },
  ],
});
