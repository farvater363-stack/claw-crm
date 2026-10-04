import {
  MATERIAL_UNIT_OPTIONS,
  type MaterialUnit,
  type OrderMaterialState,
  STOCK_MOVEMENT_KIND_OPTIONS,
  type StockMovementKind,
  type StockState,
} from 'src/constants/select-options';
import { todayInTashkent } from 'src/pricing/dates';
import { roundTo } from 'src/pricing/round';

export type WarehouseMaterial = {
  id: string;
  name: string | null;
  unit: MaterialUnit | null;
  minimumStock: number | null;
  onHand: number | null;
  reserved: number | null;
  toBuy: number | null;
  stockState: StockState | null;
  lastPurchasePrice: number | null;
  overrunPercent: number | null;
};

export type WarehouseNorm = {
  id: string;
  name: string | null;
  materialId: string | null;
  quantityPerUnit: number | null;
};

export type WarehouseMovement = {
  id: string;
  name: string | null;
  kind: StockMovementKind | null;
  materialId: string | null;
  quantity: number | null;
  countedQuantity: number | null;
  unitPrice: number | null;
  date: string | null;
  createdAt: string;
};

export type WarehouseOrderMaterial = {
  id: string;
  name: string | null;
  orderId: string | null;
  materialId: string | null;
  plannedQuantity: number | null;
  writtenOffQuantity: number | null;
};

export type WarehouseOrder = {
  id: string;
  status: string | null;
  materialState: OrderMaterialState | null;
  materialNote: string | null;
  missingNorms: string | null;
};

// The planner only rewrites these, so the update type cannot carry fields the API types differently.
type MovementWrite = Pick<
  WarehouseMovement,
  'id' | 'name' | 'quantity' | 'date'
>;

type LineWrite = Pick<WarehouseOrderMaterial, 'id' | 'name'>;

type OrderWrite = Pick<WarehouseOrder, 'id' | 'materialState' | 'materialNote'>;

export type WarehouseRecalcInput = {
  materials: WarehouseMaterial[];
  norms: WarehouseNorm[];
  movements: WarehouseMovement[];
  lines: WarehouseOrderMaterial[];
  orders: WarehouseOrder[];
};

export type RecordUpdate<TRecord extends { id: string }> = {
  id: string;
  update: Partial<Omit<TRecord, 'id'>>;
};

export type WarehouseRecalcPlan = {
  materialUpdates: RecordUpdate<WarehouseMaterial>[];
  normUpdates: RecordUpdate<WarehouseNorm>[];
  movementUpdates: RecordUpdate<MovementWrite>[];
  lineUpdates: RecordUpdate<LineWrite>[];
  orderUpdates: RecordUpdate<OrderWrite>[];
};

const round = (value: number) => roundTo(value, 2);

export const formatQuantity = (value: number): string =>
  value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

const unitLabel = (unit: MaterialUnit | null) =>
  MATERIAL_UNIT_OPTIONS.find((option) => option.value === unit)?.label ?? '';

const kindLabel = (kind: StockMovementKind | null) =>
  STOCK_MOVEMENT_KIND_OPTIONS.find((option) => option.value === kind)?.label ??
  '';

export const computeMaterialStock = ({
  onHand,
  reserved,
  minimumStock,
}: {
  onHand: number;
  reserved: number;
  minimumStock: number;
}): Pick<WarehouseMaterial, 'onHand' | 'reserved' | 'toBuy'> & {
  stockState: StockState;
} => {
  const toBuy = round(Math.max(0, reserved + minimumStock - onHand));

  return {
    onHand: round(onHand),
    reserved: round(reserved),
    toBuy,
    // Rounded, so a float remainder of summed quantities is not a shortage.
    stockState: round(reserved - onHand) > 0 ? 'BUY' : toBuy > 0 ? 'LOW' : 'OK',
  };
};

// The planner compares with `!==`, so only fields whose value really changed are written.
const changedFields = <TRecord extends { id: string }>(
  current: TRecord,
  next: Partial<Omit<TRecord, 'id'>>,
): Partial<Omit<TRecord, 'id'>> =>
  Object.fromEntries(
    Object.entries(next).filter(
      ([key, value]) => current[key as keyof TRecord] !== value,
    ),
  ) as Partial<Omit<TRecord, 'id'>>;

type Entry<TRecord extends { id: string }> = [
  TRecord,
  Partial<Omit<TRecord, 'id'>>,
];

const toUpdates = <TRecord extends { id: string }>(
  entries: Entry<TRecord>[],
): RecordUpdate<TRecord>[] =>
  entries.flatMap(([record, next]) => {
    const update = changedFields(record, next);

    return Object.keys(update).length > 0 ? [{ id: record.id, update }] : [];
  });

const effectiveDate = (movement: WarehouseMovement) =>
  movement.date ?? todayInTashkent(new Date(movement.createdAt));

// A stocktake counts what physically lay there on its date, so a receipt dated
// earlier but typed in later is already inside the count.
const inStockOrder = (movements: WarehouseMovement[]) =>
  [...movements].sort(
    (left, right) =>
      effectiveDate(left).localeCompare(effectiveDate(right)) ||
      left.createdAt.localeCompare(right.createdAt),
  );

const signed = (value: number) =>
  value > 0 ? `+${formatQuantity(value)}` : formatQuantity(value);

export const planWarehouseRecalc = ({
  materials,
  norms,
  movements,
  lines,
  orders,
}: WarehouseRecalcInput): WarehouseRecalcPlan => {
  const materialById = new Map(materials.map((item) => [item.id, item]));
  const onHandByMaterialId = new Map<string, number>();
  const lastPriceByMaterialId = new Map<string, number>();
  const writtenOffSinceRecount = new Map<string, number>();
  const recountCount = new Map<string, number>();
  const overrunByMaterialId = new Map<string, number | null>();
  const movementEntries: Entry<MovementWrite>[] = [];

  for (const movement of inStockOrder(movements)) {
    const material =
      movement.materialId === null
        ? undefined
        : materialById.get(movement.materialId);

    if (material === undefined) continue;

    const balance = onHandByMaterialId.get(material.id) ?? 0;
    const quantity =
      movement.kind === 'STOCKTAKE' && movement.countedQuantity !== null
        ? round(movement.countedQuantity - balance)
        : round(movement.quantity ?? 0);

    onHandByMaterialId.set(material.id, round(balance + quantity));

    if (movement.kind === 'WRITE_OFF') {
      writtenOffSinceRecount.set(
        material.id,
        (writtenOffSinceRecount.get(material.id) ?? 0) + Math.abs(quantity),
      );
    }

    if (movement.kind === 'STOCKTAKE' && movement.countedQuantity !== null) {
      const base = writtenOffSinceRecount.get(material.id) ?? 0;
      const isFirst = (recountCount.get(material.id) ?? 0) === 0;

      // The first recount is the opening balance, not a drift.
      overrunByMaterialId.set(
        material.id,
        isFirst || base === 0 ? null : round((-quantity / base) * 100),
      );
      recountCount.set(material.id, (recountCount.get(material.id) ?? 0) + 1);
      writtenOffSinceRecount.set(material.id, 0);
    }

    if (movement.kind === 'RECEIPT' && movement.unitPrice !== null) {
      lastPriceByMaterialId.set(material.id, movement.unitPrice);
    }

    movementEntries.push([
      movement,
      {
        quantity,
        date: effectiveDate(movement),
        name: `${kindLabel(movement.kind)} · ${material.name ?? ''} · ${signed(quantity)} ${unitLabel(material.unit)}`,
      },
    ]);
  }

  // Only orders still at price approval reserve, so a deleted order or one whose
  // sync failed on leaving it cannot hold its reserve forever.
  const reservingOrderIds = new Set(
    orders
      .filter((order) => order.status === 'PRICE_APPROVAL')
      .map((order) => order.id),
  );
  const reservedByMaterialId = new Map<string, number>();

  for (const line of lines) {
    if (
      line.materialId === null ||
      line.writtenOffQuantity !== null ||
      line.orderId === null ||
      !reservingOrderIds.has(line.orderId)
    ) {
      continue;
    }

    reservedByMaterialId.set(
      line.materialId,
      (reservedByMaterialId.get(line.materialId) ?? 0) +
        (line.plannedQuantity ?? 0),
    );
  }

  const stockByMaterialId = new Map(
    materials.map((material) => [
      material.id,
      computeMaterialStock({
        onHand: onHandByMaterialId.get(material.id) ?? 0,
        reserved: reservedByMaterialId.get(material.id) ?? 0,
        minimumStock: material.minimumStock ?? 0,
      }),
    ]),
  );

  const shortagesOf = (orderId: string) =>
    lines.flatMap((line) => {
      if (
        line.orderId !== orderId ||
        line.writtenOffQuantity !== null ||
        line.materialId === null
      ) {
        return [];
      }

      const material = materialById.get(line.materialId);
      const stock = stockByMaterialId.get(line.materialId);
      const shortBy = round((stock?.reserved ?? 0) - (stock?.onHand ?? 0));

      return material !== undefined && shortBy > 0
        ? [
            `${material.name ?? ''} — ${formatQuantity(shortBy)} ${unitLabel(material.unit)}`,
          ]
        : [];
    });

  return {
    materialUpdates: toUpdates(
      materials.map((material): Entry<WarehouseMaterial> => [
        material,
        {
          ...stockByMaterialId.get(material.id),
          lastPurchasePrice: lastPriceByMaterialId.get(material.id) ?? null,
          overrunPercent: overrunByMaterialId.get(material.id) ?? null,
        },
      ]),
    ),
    normUpdates: toUpdates(
      norms.map((norm): Entry<WarehouseNorm> => {
        const material =
          norm.materialId === null
            ? undefined
            : materialById.get(norm.materialId);

        return [
          norm,
          {
            name:
              material === undefined
                ? ''
                : `${material.name ?? ''} — ${formatQuantity(norm.quantityPerUnit ?? 0)} ${unitLabel(material.unit)}`,
          },
        ];
      }),
    ),
    movementUpdates: toUpdates(movementEntries),
    lineUpdates: toUpdates(
      lines.map((line): Entry<LineWrite> => {
        const material =
          line.materialId === null
            ? undefined
            : materialById.get(line.materialId);

        return [
          line,
          {
            name:
              material === undefined
                ? ''
                : `${material.name ?? ''} — ${formatQuantity(line.plannedQuantity ?? 0)} ${unitLabel(material.unit)}`,
          },
        ];
      }),
    ),
    orderUpdates: toUpdates(
      orders.map((order): Entry<OrderWrite> => {
        if (order.status !== 'PRICE_APPROVAL') {
          return [order, { materialState: null, materialNote: null }];
        }

        const shortages = shortagesOf(order.id);
        const { missingNorms } = order;
        const parts = [
          ...(shortages.length > 0
            ? [`Не хватает: ${shortages.join(', ')}`]
            : []),
          ...(missingNorms !== null ? [missingNorms] : []),
        ];

        return [
          order,
          {
            materialState:
              shortages.length > 0
                ? 'SHORTAGE'
                : missingNorms !== null
                  ? 'NO_NORM'
                  : 'ENOUGH',
            materialNote: parts.length > 0 ? parts.join('. ') : null,
          },
        ];
      }),
    ),
  };
};
