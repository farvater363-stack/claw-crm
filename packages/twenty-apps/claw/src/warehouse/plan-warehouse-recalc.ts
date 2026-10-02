import {
  MATERIAL_UNIT_OPTIONS,
  type MaterialUnit,
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
  safetyPercent: number | null;
  minimumStock: number | null;
  onHand: number | null;
  reserved: number | null;
  available: number | null;
  toBuy: number | null;
  stockState: StockState | null;
  lastPurchasePrice: number | null;
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

export type WarehouseRecalcInput = {
  materials: WarehouseMaterial[];
  norms: WarehouseNorm[];
  movements: WarehouseMovement[];
  reservedByMaterialId: Readonly<Record<string, number>>;
};

export type RecordUpdate<TRecord extends { id: string }> = {
  id: string;
  update: Partial<Omit<TRecord, 'id'>>;
};

export type WarehouseRecalcPlan = {
  materialUpdates: RecordUpdate<WarehouseMaterial>[];
  normUpdates: RecordUpdate<WarehouseNorm>[];
  movementUpdates: RecordUpdate<WarehouseMovement>[];
};

const round = (value: number) => roundTo(value, 2);

export const formatQuantity = (value: number): string =>
  value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

const unitLabel = (unit: MaterialUnit | null) =>
  MATERIAL_UNIT_OPTIONS.find((option) => option.value === unit)?.label ?? '';

const kindLabel = (kind: StockMovementKind | null) =>
  STOCK_MOVEMENT_KIND_OPTIONS.find((option) => option.value === kind)
    ?.label ?? '';

export const computeMaterialStock = ({
  onHand,
  reserved,
  safetyPercent,
  minimumStock,
}: {
  onHand: number;
  reserved: number;
  safetyPercent: number;
  minimumStock: number;
}): Pick<
  WarehouseMaterial,
  'onHand' | 'reserved' | 'available' | 'toBuy'
> & { stockState: StockState } => {
  const available = round(onHand - reserved);
  const toBuy = round(
    Math.max(0, reserved * (1 + safetyPercent / 100) + minimumStock - onHand),
  );

  return {
    onHand: round(onHand),
    reserved: round(reserved),
    available,
    toBuy,
    stockState: available < 0 ? 'BUY' : toBuy > 0 ? 'LOW' : 'OK',
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
  reservedByMaterialId,
}: WarehouseRecalcInput): WarehouseRecalcPlan => {
  const materialById = new Map(materials.map((item) => [item.id, item]));
  const onHandByMaterialId = new Map<string, number>();
  const lastPriceByMaterialId = new Map<string, number>();
  const movementEntries: Entry<WarehouseMovement>[] = [];

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

  return {
    materialUpdates: toUpdates(
      materials.map((material): Entry<WarehouseMaterial> => [
        material,
        {
          ...computeMaterialStock({
            onHand: onHandByMaterialId.get(material.id) ?? 0,
            reserved: reservedByMaterialId[material.id] ?? 0,
            safetyPercent: material.safetyPercent ?? 0,
            minimumStock: material.minimumStock ?? 0,
          }),
          lastPurchasePrice: lastPriceByMaterialId.get(material.id) ?? null,
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
  };
};
