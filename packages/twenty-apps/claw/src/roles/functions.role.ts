import { defineApplicationRole } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

// A screen's requests are bounded by this role as well as by the user's own.
// The order material sync soft-deletes the lines and movements it no longer
// needs; «Цены» removes grilles, their kinds, services and composition rows; the accrual
// sync removes pay lines that are no longer due and «ЗП» removes pay rules.
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
    readUpdateSoftDelete(IDS.design.object),
    readUpdateSoftDelete(IDS.grilleKind.object),
    readUpdateSoftDelete(IDS.extraService.object),
    readUpdateSoftDelete(IDS.materialNorm.object),
    readUpdateSoftDelete(IDS.payRule.object),
    readUpdateSoftDelete(IDS.payAccrual.object),
  ],
});
