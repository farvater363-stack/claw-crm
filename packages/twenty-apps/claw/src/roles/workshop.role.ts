import { defineRole } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { ADMIN_ONLY_FIELD_PERMISSIONS } from 'src/roles/admin-only-fields';

export default defineRole({
  universalIdentifier: IDS.role.workshop,
  label: 'Цех',
  description: 'Общий логин монитора в цехе, только просмотр',
  icon: 'IconHammer',
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  fieldPermissions: ADMIN_ONLY_FIELD_PERMISSIONS,
});
