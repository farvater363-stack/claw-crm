import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: IDS.workspaceMember.workers,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'workers',
  label: 'Работники',
  icon: 'IconHammer',
  relationTargetObjectMetadataUniversalIdentifier: IDS.master.object,
  relationTargetFieldMetadataUniversalIdentifier: IDS.master.login,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
