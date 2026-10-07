import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: IDS.person.calls,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'calls',
  label: 'Звонки',
  icon: 'IconPhoneCall',
  relationTargetObjectMetadataUniversalIdentifier: IDS.clientCall.object,
  relationTargetFieldMetadataUniversalIdentifier: IDS.clientCall.person,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
