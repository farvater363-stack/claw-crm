import { defineApplicationRole } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

// The order material sync soft-deletes the lines and movements it no longer needs.
const readUpdateSoftDelete = (objectUniversalIdentifier: string) => ({
  objectUniversalIdentifier,
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: true,
  canDestroyObjectRecords: false,
});

export default defineApplicationRole({
  universalIdentifier: IDS.role.functions,
  label: 'Claw CRM functions',
  description: 'Role the Claw CRM logic functions run as',
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canBeAssignedToUsers: false,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: [
    readUpdateSoftDelete(IDS.orderMaterial.object),
    readUpdateSoftDelete(IDS.stockMovement.object),
  ],
});
