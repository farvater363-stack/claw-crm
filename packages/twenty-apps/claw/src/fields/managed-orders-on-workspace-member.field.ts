import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: IDS.workspaceMember.managedOrders,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'managedOrders',
  label: 'Заказы (менеджер)',
  icon: 'IconClipboardList',
  relationTargetObjectMetadataUniversalIdentifier:
    IDS.order.object,
  relationTargetFieldMetadataUniversalIdentifier: IDS.order.manager,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
