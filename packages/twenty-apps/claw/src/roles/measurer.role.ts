import {
  defineRole,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  SystemPermissionFlag,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import {
  ADMIN_ONLY_FIELD_PERMISSIONS,
  CALCULATED_FIELD_PERMISSIONS,
} from 'src/roles/admin-only-fields';

// Twenty checks canUpdateObjectRecords for inserts as well as updates.
const createAndEdit = (objectUniversalIdentifier: string) => ({
  objectUniversalIdentifier,
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
});

const readOnly = (objectUniversalIdentifier: string) => ({
  objectUniversalIdentifier,
  canReadObjectRecords: true,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
});

export default defineRole({
  universalIdentifier: IDS.role.measurer,
  label: 'Замерщик',
  description: 'Создаёт заказы и позиции с планшета',
  icon: 'IconRuler2',
  // Only the objects the measurer works with, so the sidebar shows nothing else.
  canReadAllObjectRecords: false,
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
    createAndEdit(IDS.orderPayment.object),
    createAndEdit(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
    ),
    createAndEdit(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.note.universalIdentifier,
    ),
    readOnly(IDS.design.object),
    readOnly(IDS.extraService.object),
  ],
  fieldPermissions: [
    ...ADMIN_ONLY_FIELD_PERMISSIONS,
    ...CALCULATED_FIELD_PERMISSIONS,
    {
      objectUniversalIdentifier: IDS.order.object,
      fieldUniversalIdentifier: IDS.order.readyAt,
      canReadFieldValue: true,
      canUpdateFieldValue: false,
    },
  ],
  // Measurers attach photos of openings; without it every upload is rejected.
  permissionFlagUniversalIdentifiers: [SystemPermissionFlag.UPLOAD_FILE],
});
