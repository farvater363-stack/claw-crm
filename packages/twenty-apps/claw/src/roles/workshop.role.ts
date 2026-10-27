import {
  defineRole,
  FieldType,
  RelationType,
  SystemPermissionFlag,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import orderObject from 'src/objects/order.object';
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

// «Готово» on the wall screen. Twenty checks canUpdateObjectRecords per object
// and has no rule per status value; the shared login is trusted with it.
const readUpdate = (objectUniversalIdentifier: string) => ({
  ...readOnly(objectUniversalIdentifier),
  canUpdateObjectRecords: true,
});

const WORKSHOP_WRITABLE_ORDER_FIELDS: string[] = [
  IDS.order.status,
  IDS.order.productionStage,
  IDS.order.finishedPhotos,
  // «Печать схемы» saves the sheet it prints on the order
  IDS.order.schemePdf,
  // Установщики fix the point on site
  IDS.order.locationLat,
  IDS.order.locationLng,
  IDS.order.locationNote,
  IDS.order.locationPhotos,
  // Twenty writes the author itself on every update, through the same check
  // as the caller's fields, and overwrites whatever the caller sent: locked,
  // «Готово» would be refused; open, it still cannot be falsified.
  IDS.order.updatedBy,
];

// The object's own identifier, and the retired fields that are no longer defined.
const ORDER_KEYS_WITHOUT_FIELD: string[] = [
  'object',
  'masterPayPaid',
  'prepayment',
  'isUrgent',
];

// The shared wall login sees the work, not the money or the client's phone.
// Twenty refuses a whole query that asks for one of these, so every screen
// the workshop opens either leaves them out or falls back without them. The
// contract is the office's too; without it the order page hides its block.
const HIDDEN_ORDER_FIELDS: string[] = [
  IDS.order.contractState,
  IDS.order.clientPhone,
  IDS.order.subtotal,
  IDS.order.discountValue,
  IDS.order.discount,
  IDS.order.total,
  IDS.order.prepaid,
  IDS.order.paid,
  IDS.order.balance,
];

const WORKSHOP_HIDDEN_FIELD_IDS_BY_OBJECT: Record<string, string[]> = {
  [IDS.order.object]: HIDDEN_ORDER_FIELDS,
  [IDS.orderItem.object]: [
    IDS.orderItem.pricePerSquareMeter,
    IDS.orderItem.lineTotal,
  ],
  [IDS.orderExtraService.object]: [
    IDS.orderExtraService.price,
    IDS.orderExtraService.lineTotal,
  ],
  [IDS.design.object]: [IDS.design.pricePerSquareMeter],
};

const workshopHiddenFieldIds = new Set(
  Object.values(WORKSHOP_HIDDEN_FIELD_IDS_BY_OBJECT).flat(),
);

// A field is named once per role: the calculated money the other roles read
// is hidden here instead.
const SHARED_FIELD_PERMISSIONS = [
  ...ADMIN_ONLY_FIELD_PERMISSIONS,
  ...CALCULATED_FIELD_PERMISSIONS.filter(
    (permission) =>
      !workshopHiddenFieldIds.has(permission.fieldUniversalIdentifier),
  ),
];

const alreadyLimitedOrderFields = new Set(
  SHARED_FIELD_PERMISSIONS.filter(
    (permission) => permission.objectUniversalIdentifier === IDS.order.object,
  ).map((permission) => permission.fieldUniversalIdentifier),
);

const relationTypeOf = (field: object): unknown =>
  'universalSettings' in field &&
  typeof field.universalSettings === 'object' &&
  field.universalSettings !== null &&
  'relationType' in field.universalSettings
    ? field.universalSettings.relationType
    : undefined;

// The other side of a one-to-many relation holds the value, so the order has
// nothing to lock.
const oneToManyOrderFields = new Set(
  orderObject.config.fields
    .filter(
      (field) =>
        field.type === FieldType.RELATION &&
        relationTypeOf(field) === RelationType.ONE_TO_MANY,
    )
    .map((field) => field.universalIdentifier),
);

// Every identifier of the order, so a field added later, in the object or in
// src/fields, is locked without anyone remembering this file. That includes
// the fields Twenty keeps itself: it has no create right apart from update,
// but every create carries a position, so a login that may not write the
// position cannot create an order; and without the lock a plain update could
// soft-delete an order (deletedAt), move it between periods (createdAt) or
// change its author (createdBy).
const LOCKED_ORDER_FIELDS = Object.entries(IDS.order)
  .filter(
    ([key, fieldUniversalIdentifier]) =>
      !ORDER_KEYS_WITHOUT_FIELD.includes(key) &&
      !oneToManyOrderFields.has(fieldUniversalIdentifier) &&
      !WORKSHOP_WRITABLE_ORDER_FIELDS.includes(fieldUniversalIdentifier) &&
      !HIDDEN_ORDER_FIELDS.includes(fieldUniversalIdentifier) &&
      !alreadyLimitedOrderFields.has(fieldUniversalIdentifier),
  )
  .map(([, fieldUniversalIdentifier]) => ({
    objectUniversalIdentifier: IDS.order.object,
    fieldUniversalIdentifier,
    canReadFieldValue: true,
    canUpdateFieldValue: false,
  }));

export default defineRole({
  universalIdentifier: IDS.role.workshop,
  label: 'Цех',
  description: 'Общий логин монитора в цехе: видит работу и отмечает «Готово»',
  icon: 'IconHammer',
  // Shared monitor login: reads orders, workers and materials without money or
  // the client's phone; writes an order's status, stage and photos only.
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: [
    readUpdate(IDS.order.object),
    readOnly(IDS.orderItem.object),
    readOnly(IDS.orderExtraService.object),
    readOnly(IDS.master.object),
    readOnly(IDS.design.object),
    readOnly(IDS.grilleKind.object),
    readOnly(IDS.material.object),
    readOnly(IDS.orderMaterial.object),
  ],
  fieldPermissions: [
    ...SHARED_FIELD_PERMISSIONS,
    ...LOCKED_ORDER_FIELDS,
    ...Object.entries(WORKSHOP_HIDDEN_FIELD_IDS_BY_OBJECT).flatMap(
      ([objectUniversalIdentifier, fieldUniversalIdentifiers]) =>
        fieldUniversalIdentifiers.map((fieldUniversalIdentifier) => ({
          objectUniversalIdentifier,
          fieldUniversalIdentifier,
          canReadFieldValue: false,
          canUpdateFieldValue: false,
        })),
    ),
  ],
  // The workshop photographs a finished order before it leaves; without it
  // every upload is rejected.
  permissionFlagUniversalIdentifiers: [SystemPermissionFlag.UPLOAD_FILE],
});
