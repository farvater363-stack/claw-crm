import { defineRole } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import {
  ADMIN_ONLY_FIELD_PERMISSIONS,
  CALCULATED_FIELD_PERMISSIONS,
} from 'src/roles/admin-only-fields';

const readOnly = (objectUniversalIdentifier: string) => ({
  objectUniversalIdentifier,
  canReadObjectRecords: true,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
});

export default defineRole({
  universalIdentifier: IDS.role.workshop,
  label: 'Цех',
  description: 'Общий логин монитора в цехе, только просмотр',
  icon: 'IconHammer',
  // A shared monitor login: orders and masters only (spec §3).
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: [
    readOnly(IDS.order.object),
    readOnly(IDS.orderItem.object),
    readOnly(IDS.orderExtraService.object),
    readOnly(IDS.master.object),
    readOnly(IDS.design.object),
    readOnly(IDS.material.object),
    readOnly(IDS.orderMaterial.object),
  ],
  fieldPermissions: [
    ...ADMIN_ONLY_FIELD_PERMISSIONS,
    ...CALCULATED_FIELD_PERMISSIONS,
  ],
});
