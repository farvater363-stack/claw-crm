import { type defineRole } from 'twenty-sdk/define';

import { ADMIN_ONLY_FIELD_IDS_BY_OBJECT } from 'src/constants/admin-only-fields';
import { IDS } from 'src/constants/universal-identifiers';

type FieldPermission = NonNullable<
  Parameters<typeof defineRole>[0]['fieldPermissions']
>[number];

const hide = (
  objectUniversalIdentifier: string,
  fieldUniversalIdentifiers: string[],
): FieldPermission[] =>
  fieldUniversalIdentifiers.map((fieldUniversalIdentifier) => ({
    objectUniversalIdentifier,
    fieldUniversalIdentifier,
    canReadFieldValue: false,
    canUpdateFieldValue: false,
  }));

export const ADMIN_ONLY_FIELD_PERMISSIONS: FieldPermission[] = Object.entries(
  ADMIN_ONLY_FIELD_IDS_BY_OBJECT,
).flatMap(([objectUniversalIdentifier, fieldUniversalIdentifiers]) =>
  hide(objectUniversalIdentifier, fieldUniversalIdentifiers),
);

const readOnly = (
  objectUniversalIdentifier: string,
  fieldUniversalIdentifiers: string[],
): FieldPermission[] =>
  fieldUniversalIdentifiers.map((fieldUniversalIdentifier) => ({
    objectUniversalIdentifier,
    fieldUniversalIdentifier,
    canReadFieldValue: true,
    canUpdateFieldValue: false,
  }));

// The recalc triggers own these values; names stay writable because Twenty's
// own create flow writes the label identifier, except on order material lines,
// which no role creates by hand, so their name, order and material are locked
// too, and on norms, whose name is composed from the material and the amount.
export const CALCULATED_FIELD_PERMISSIONS: FieldPermission[] = [
  ...readOnly(IDS.order.object, [
    IDS.order.number,
    IDS.order.areaSquareMeters,
    IDS.order.total,
    IDS.order.balance,
    IDS.order.deadlineState,
    IDS.order.materialState,
    IDS.order.materialNote,
    IDS.order.missingNorms,
  ]),
  ...readOnly(IDS.orderItem.object, [
    IDS.orderItem.areaSquareMeters,
    IDS.orderItem.lineTotal,
  ]),
  ...readOnly(IDS.orderExtraService.object, [IDS.orderExtraService.lineTotal]),
  ...readOnly(IDS.orderMaterial.object, [
    IDS.orderMaterial.name,
    IDS.orderMaterial.plannedQuantity,
    IDS.orderMaterial.writtenOffQuantity,
    IDS.orderMaterial.order,
    IDS.orderMaterial.material,
  ]),
  ...readOnly(IDS.material.object, [
    IDS.material.onHand,
    IDS.material.reserved,
    IDS.material.available,
    IDS.material.toBuy,
    IDS.material.stockState,
    IDS.material.overrunPercent,
  ]),
  ...readOnly(IDS.materialNorm.object, [IDS.materialNorm.name]),
];
