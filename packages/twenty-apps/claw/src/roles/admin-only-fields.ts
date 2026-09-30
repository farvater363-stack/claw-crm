import { type defineRole } from 'twenty-sdk/define';

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

export const ADMIN_ONLY_FIELD_PERMISSIONS: FieldPermission[] = [
  ...hide(IDS.order.object, [
    IDS.order.costTotal,
    IDS.order.margin,
    IDS.order.marginPercent,
    IDS.order.daysLate,
    IDS.order.masterPayCalculated,
    IDS.order.masterBonus,
    IDS.order.masterPayTotal,
    IDS.order.masterPayPaid,
  ]),
  ...hide(IDS.orderItem.object, [
    IDS.orderItem.costPerSquareMeter,
    IDS.orderItem.lineCost,
  ]),
  ...hide(IDS.orderExtraService.object, [
    IDS.orderExtraService.cost,
    IDS.orderExtraService.lineCost,
  ]),
  ...hide(IDS.priceListItem.object, [
    IDS.priceListItem.materialCostPerSquareMeter,
    IDS.priceListItem.manufacturingCostPerSquareMeter,
    IDS.priceListItem.installationCostPerSquareMeter,
  ]),
  ...hide(IDS.extraService.object, [IDS.extraService.cost]),
  ...hide(IDS.master.object, [
    IDS.master.ratePerSquareMeter,
    IDS.master.penaltyPercentPerDay,
  ]),
];

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
// own create flow writes the label identifier.
export const CALCULATED_FIELD_PERMISSIONS: FieldPermission[] = [
  ...readOnly(IDS.order.object, [
    IDS.order.number,
    IDS.order.areaSquareMeters,
    IDS.order.total,
    IDS.order.balance,
  ]),
  ...readOnly(IDS.orderItem.object, [
    IDS.orderItem.areaSquareMeters,
    IDS.orderItem.lineTotal,
  ]),
  ...readOnly(IDS.orderExtraService.object, [IDS.orderExtraService.lineTotal]),
];
