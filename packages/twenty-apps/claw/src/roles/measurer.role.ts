import {
  defineRole,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { ADMIN_ONLY_FIELD_PERMISSIONS } from 'src/roles/admin-only-fields';

// Twenty checks canUpdateObjectRecords for inserts as well as updates.
const createAndEdit = (objectUniversalIdentifier: string) => ({
  objectUniversalIdentifier,
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
});

export default defineRole({
  universalIdentifier: IDS.role.measurer,
  label: 'Замерщик',
  description: 'Создаёт заказы и позиции с планшета',
  icon: 'IconRuler2',
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: [
    createAndEdit(IDS.order.object),
    createAndEdit(IDS.orderItem.object),
    createAndEdit(IDS.orderExtraService.object),
    createAndEdit(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
    ),
    createAndEdit(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.note.universalIdentifier,
    ),
  ],
  fieldPermissions: ADMIN_ONLY_FIELD_PERMISSIONS,
});
