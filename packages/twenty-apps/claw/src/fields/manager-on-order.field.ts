import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: IDS.order.manager,
  objectUniversalIdentifier: IDS.order.object,
  type: FieldType.RELATION,
  name: 'manager',
  label: 'Менеджер',
  icon: 'IconUserStar',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    IDS.workspaceMember.managedOrders,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'managerId',
  },
});
