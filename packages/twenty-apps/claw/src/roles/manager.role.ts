import {
  defineRole,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { ADMIN_ONLY_FIELD_PERMISSIONS } from 'src/roles/admin-only-fields';

const readWrite = (objectUniversalIdentifier: string) => ({
  objectUniversalIdentifier,
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: true,
  canDestroyObjectRecords: false,
});

export default defineRole({
  universalIdentifier: IDS.role.manager,
  label: 'Менеджер',
  description: 'Ведёт заказы, назначает замерщиков и мастеров, правит прайс',
  icon: 'IconUserStar',
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: [
    readWrite(IDS.order.object),
    readWrite(IDS.orderItem.object),
    readWrite(IDS.orderExtraService.object),
    readWrite(IDS.design.object),
    readWrite(IDS.priceListItem.object),
    readWrite(IDS.extraService.object),
    readWrite(IDS.master.object),
    readWrite(STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier),
    readWrite(STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.note.universalIdentifier),
    readWrite(STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.task.universalIdentifier),
  ],
  fieldPermissions: ADMIN_ONLY_FIELD_PERMISSIONS,
});
