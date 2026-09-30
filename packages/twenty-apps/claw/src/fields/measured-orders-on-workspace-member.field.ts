import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: IDS.workspaceMember.measuredOrders,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'measuredOrders',
  label: 'Замеры',
  icon: 'IconRuler2',
  relationTargetObjectMetadataUniversalIdentifier: IDS.order.object,
  relationTargetFieldMetadataUniversalIdentifier: IDS.order.measurer,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
