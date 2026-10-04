import { IDS } from 'src/constants/universal-identifiers';

// Cost, margin and pay: only admins may read them (spec §3).
export const ADMIN_ONLY_FIELD_IDS_BY_OBJECT: Record<string, string[]> = {
  [IDS.order.object]: [
    IDS.order.costTotal,
    IDS.order.margin,
    IDS.order.marginPercent,
    IDS.order.daysLate,
    IDS.order.masterPayCalculated,
    IDS.order.masterPenalty,
    IDS.order.masterBonus,
    IDS.order.masterPayTotal,
  ],
  [IDS.orderItem.object]: [
    IDS.orderItem.costPerSquareMeter,
    IDS.orderItem.lineCost,
  ],
  [IDS.orderExtraService.object]: [
    IDS.orderExtraService.cost,
    IDS.orderExtraService.lineCost,
  ],
  [IDS.design.object]: [
    IDS.design.materialCostPerSquareMeter,
    IDS.design.manufacturingCostPerSquareMeter,
    IDS.design.installationCostPerSquareMeter,
  ],
  [IDS.extraService.object]: [IDS.extraService.cost],
  [IDS.master.object]: [
    IDS.master.ratePerSquareMeter,
    IDS.master.penaltyPercentPerDay,
  ],
  [IDS.stockMovement.object]: [IDS.stockMovement.unitPrice],
  [IDS.material.object]: [IDS.material.lastPurchasePrice],
};

const ADMIN_ONLY_FIELD_IDS = new Set(
  Object.values(ADMIN_ONLY_FIELD_IDS_BY_OBJECT).flat(),
);

// The timeline is a system object every role can read through the API, so the
// before/after values of admin-only fields must never be written to it.
export const withoutAuditOfAdminOnlyFields = <
  TField extends { universalIdentifier: string },
>(
  fields: TField[],
): TField[] =>
  fields.map((field) =>
    ADMIN_ONLY_FIELD_IDS.has(field.universalIdentifier)
      ? { ...field, isAuditLogged: false }
      : field,
  );
