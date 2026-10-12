import {
  defineRole,
  RowLevelPermissionPredicateOperand,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  SystemPermissionFlag,
} from 'twenty-sdk/define';

import { MEASURER_BOARD_STATUSES } from 'src/constants/order-status-sets';
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

// Twenty checks every written order against these rules as well as filtering
// reads: a measurer reads and writes only the orders he measures, and only
// while they are being measured. Новый замер writes the measurer and
// «Замер выполнен» on every save, so a new order, its retry (an upsert of the
// same id) and the contract step all pass; giving an order to another
// measurer, sending it on to production or cancelling it is refused.
const ORDER_ROW_RULES = [
  {
    universalIdentifier: IDS.role.measurerOwnOrders,
    objectUniversalIdentifier: IDS.order.object,
    fieldUniversalIdentifier: IDS.order.measurer,
    operand: RowLevelPermissionPredicateOperand.IS,
    value: { isCurrentWorkspaceMemberSelected: true, selectedRecordIds: [] },
  },
  {
    universalIdentifier: IDS.role.measurerMeasuringStatuses,
    objectUniversalIdentifier: IDS.order.object,
    fieldUniversalIdentifier: IDS.order.status,
    operand: RowLevelPermissionPredicateOperand.IS,
    value: [...MEASURER_BOARD_STATUSES],
  },
];

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
    // Rules can only look at the record's own fields, and lines and payments
    // have no measurer of their own, so these are not limited to his orders.
    createAndEdit(IDS.orderItem.object),
    createAndEdit(IDS.orderExtraService.object),
    // Twenty has no create right apart from update: a payment the measurer
    // may take he may also change, and Новый замер's retry of a payment whose
    // answer was lost is an update of the same id.
    createAndEdit(IDS.orderPayment.object),
    // The client is made from the order by the app's own trigger; the
    // measurer only reads it.
    readOnly(STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier),
    createAndEdit(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.note.universalIdentifier,
    ),
    readOnly(IDS.design.object),
    readOnly(IDS.grilleKind.object),
    readOnly(IDS.extraService.object),
    readOnly(IDS.contractTemplate.object),
    createAndEdit(IDS.signedContract.object),
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
  rowLevelPermissionPredicates: ORDER_ROW_RULES,
  // Measurers attach photos of openings; without it every upload is rejected.
  permissionFlagUniversalIdentifiers: [SystemPermissionFlag.UPLOAD_FILE],
});
