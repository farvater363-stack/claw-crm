import { defineRole, FieldType, RelationType } from 'twenty-sdk/define';

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
  IDS.order.finishedPhotos,
];

const SHARED_FIELD_PERMISSIONS = [
  ...ADMIN_ONLY_FIELD_PERMISSIONS,
  ...CALCULATED_FIELD_PERMISSIONS,
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

// Every field that holds a value on the order, read from the definition so a
// field added later is locked without anyone remembering this file. A
// one-to-many relation holds nothing on the order, so there is nothing to lock.
const LOCKED_ORDER_FIELDS = [
  ...orderObject.config.fields
    .filter(
      (field) =>
        field.type !== FieldType.RELATION ||
        relationTypeOf(field) === RelationType.MANY_TO_ONE,
    )
    .map((field) => field.universalIdentifier),
  // Relations to standard objects are defined in src/fields
  IDS.order.client,
  IDS.order.manager,
  IDS.order.measurer,
]
  .filter(
    (fieldUniversalIdentifier) =>
      !WORKSHOP_WRITABLE_ORDER_FIELDS.includes(fieldUniversalIdentifier) &&
      !alreadyLimitedOrderFields.has(fieldUniversalIdentifier),
  )
  .map((fieldUniversalIdentifier) => ({
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
  // Shared monitor login: reads orders, workers and materials; writes an order's status and photos only.
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
    readOnly(IDS.material.object),
    readOnly(IDS.orderMaterial.object),
  ],
  fieldPermissions: [
    ...SHARED_FIELD_PERMISSIONS,
    ...LOCKED_ORDER_FIELDS,
    {
      objectUniversalIdentifier: IDS.design.object,
      fieldUniversalIdentifier: IDS.design.pricePerSquareMeter,
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    },
  ],
});
