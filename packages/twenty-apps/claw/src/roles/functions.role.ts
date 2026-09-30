import { defineApplicationRole } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineApplicationRole({
  universalIdentifier: IDS.role.functions,
  label: 'Claw CRM functions',
  description: 'Role the Claw CRM logic functions run as',
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
});
