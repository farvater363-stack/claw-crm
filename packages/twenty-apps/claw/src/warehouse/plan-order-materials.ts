import { type OrderStatus } from 'src/constants/select-options';
import { roundTo } from 'src/pricing/round';
import { deterministicUuid } from 'src/utils/deterministic-uuid';

export const RESERVING_STATUSES: OrderStatus[] = ['PRICE_APPROVAL'];
const WRITTEN_OFF_STATUSES = new Set([
  'PRODUCTION',
  'QUALITY_CHECK',
  'READY',
  'INSTALLED',
  'CLOSED',
]);

export type OrderMaterialLine = {
  id: string;
  materialId: string | null;
  plannedQuantity: number | null;
  writtenOffQuantity: number | null;
};

export type SystemMovement = { id: string; quantity: number | null };

export type OrderMaterialsInput = {
  orderId: string;
  status: string | null;
  demand: Map<string, number>;
  lines: OrderMaterialLine[];
  systemMovements: SystemMovement[];
  today: string;
  entersWrittenOff: boolean;
};

export type LineUpsert = {
  id: string;
  orderId: string;
  materialId: string;
  plannedQuantity: number;
  // Absent rather than null: a stale reserve upsert landing after the write-off
  // must not clear it.
  writtenOffQuantity?: number;
};

export type MovementUpsert = {
  id: string;
  kind: 'WRITE_OFF';
  materialId: string;
  orderId: string;
  orderMaterialId: string;
  quantity: number;
  date: string;
};

export type OrderMaterialsPlan = {
  lineUpserts: LineUpsert[];
  lineDeletes: string[];
  movementUpserts: MovementUpsert[];
};

export const orderMaterialLineId = (orderId: string, materialId: string) =>
  deterministicUuid(`orderMaterial:${orderId}:${materialId}`);

export const writeOffMovementId = (lineId: string) =>
  deterministicUuid(`writeoff:${lineId}`);

export const isWrittenOffStatus = (status: string | null) =>
  status !== null && WRITTEN_OFF_STATUSES.has(status);

export const isEnteringWrittenOff = ({
  status,
  previousStatus,
}: {
  status: string | null;
  previousStatus: string | null;
}) => isWrittenOffStatus(status) && !isWrittenOffStatus(previousStatus);

export const keepsOrderDemand = (status: string | null) =>
  status !== null &&
  (RESERVING_STATUSES.some((reserving) => reserving === status) ||
    WRITTEN_OFF_STATUSES.has(status));

export const isEmptyOrderMaterialsPlan = (plan: OrderMaterialsPlan) =>
  Object.values(plan).every((entries) => entries.length === 0);

// ponytail: one line per order and material; once written off, extra demand for that
// material on the same order is ignored. Add a second line kind if re-ordering becomes common.
export const planOrderMaterials = ({
  orderId,
  status,
  demand,
  lines,
  systemMovements,
  today,
  entersWrittenOff,
}: OrderMaterialsInput): OrderMaterialsPlan => {
  const plan: OrderMaterialsPlan = {
    lineUpserts: [],
    lineDeletes: [],
    movementUpserts: [],
  };
  const movementQuantityById = new Map(
    systemMovements.map((movement) => [movement.id, movement.quantity]),
  );
  const writesOff = isWrittenOffStatus(status);
  const writtenLines = lines.filter(
    (
      line,
    ): line is OrderMaterialLine & {
      materialId: string;
      writtenOffQuantity: number;
    } => line.writtenOffQuantity !== null && line.materialId !== null,
  );
  const writtenMaterialIds = new Set(
    writtenLines.map((line) => line.materialId),
  );
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const wantedIds = new Set<string>();

  const ensureMovement = (movement: MovementUpsert) => {
    if (movementQuantityById.get(movement.id) !== movement.quantity) {
      plan.movementUpserts.push(movement);
    }
  };

  const ensureWriteOff = (
    lineId: string,
    materialId: string,
    writtenOff: number,
  ) =>
    ensureMovement({
      id: writeOffMovementId(lineId),
      kind: 'WRITE_OFF',
      materialId,
      orderId,
      orderMaterialId: lineId,
      quantity: -writtenOff,
      date: today,
    });

  if (keepsOrderDemand(status)) {
    for (const [materialId, quantity] of demand) {
      if (writtenMaterialIds.has(materialId)) continue;

      const id = orderMaterialLineId(orderId, materialId);
      const plannedQuantity = roundTo(quantity, 2);
      const writtenOffQuantity = writesOff ? plannedQuantity : null;
      const existing = lineById.get(id);

      // Only the event that moves an order into a written-off status creates new lines.
      // So orders already in production at go-live, items added during production and
      // norms added later are not written off automatically; a stocktake settles them.
      if (writesOff && existing === undefined && !entersWrittenOff) {
        continue;
      }

      wantedIds.add(id);

      if (
        existing === undefined ||
        existing.plannedQuantity !== plannedQuantity ||
        existing.writtenOffQuantity !== writtenOffQuantity
      ) {
        plan.lineUpserts.push({
          id,
          orderId,
          materialId,
          plannedQuantity,
          ...(writtenOffQuantity !== null && { writtenOffQuantity }),
        });
      }

      if (writtenOffQuantity !== null) {
        ensureWriteOff(id, materialId, writtenOffQuantity);
      }
    }
  }

  for (const line of lines) {
    if (line.writtenOffQuantity === null && !wantedIds.has(line.id)) {
      plan.lineDeletes.push(line.id);
    }
  }

  for (const line of writtenLines) {
    ensureWriteOff(line.id, line.materialId, line.writtenOffQuantity);
  }

  return plan;
};
