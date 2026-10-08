import { type StockMovementKind } from 'src/constants/select-options';
import { roundTo } from 'src/pricing/round';
import {
  effectiveDate,
  inStockOrder,
} from 'src/warehouse/plan-warehouse-recalc';

export type LedgerMovement = {
  id: string;
  kind: StockMovementKind | null;
  materialId: string | null;
  quantity: number | null;
  countedQuantity: number | null;
  unitPrice: number | null;
  date: string | null;
  createdAt: string;
  orderId: string | null;
  purchaseId: string | null;
  comment: string | null;
};

export type ValuedMovement = {
  id: string;
  kind: StockMovementKind;
  materialId: string;
  date: string;
  // The change on the shelf: + came in, − went out
  quantity: number;
  // In сум: a purchase at its own price, anything else at the average price of
  // that moment. Null while the material has no price yet.
  value: number | null;
  unitPrice: number | null;
  orderId: string | null;
  purchaseId: string | null;
  comment: string | null;
};

// Material taken off the shelf by hand; the write-off by composition is WRITE_OFF.
export const MANUAL_OUT_KINDS = [
  'ORDER_EXTRA',
  'SCRAP',
  'WASTE',
  'WORKSHOP_USE',
  'SUPPLIER_RETURN',
  'OTHER_OUT',
] as const satisfies readonly StockMovementKind[];

export type ManualOutKind = (typeof MANUAL_OUT_KINDS)[number];

export const isManualOut = (
  kind: StockMovementKind | null,
): kind is ManualOutKind =>
  MANUAL_OUT_KINDS.some((manualKind) => manualKind === kind);

const round = (value: number) => roundTo(value, 2);

// The same walk as the stock recalc: in date order, a recount sets the shelf to
// what was counted, and a priced purchase moves the average price.
export const valueStockMovements = (
  movements: LedgerMovement[],
): ValuedMovement[] => {
  const balanceByMaterialId = new Map<string, number>();
  const averageByMaterialId = new Map<string, number>();
  const valued: ValuedMovement[] = [];

  for (const movement of inStockOrder(movements)) {
    if (movement.materialId === null || movement.kind === null) continue;

    const materialId = movement.materialId;
    const balance = balanceByMaterialId.get(materialId) ?? 0;
    const quantity =
      movement.kind === 'STOCKTAKE' && movement.countedQuantity !== null
        ? round(movement.countedQuantity - balance)
        : round(movement.quantity ?? 0);
    const average = averageByMaterialId.get(materialId);
    const isPricedReceipt =
      movement.kind === 'RECEIPT' && movement.unitPrice !== null;
    const unitPrice = isPricedReceipt ? movement.unitPrice : (average ?? null);

    if (isPricedReceipt && movement.unitPrice !== null) {
      // A shelf counted below zero holds nothing to average with.
      const held = Math.max(balance, 0);

      averageByMaterialId.set(
        materialId,
        average === undefined || held + quantity <= 0
          ? movement.unitPrice
          : Math.round(
              (held * average + quantity * movement.unitPrice) /
                (held + quantity),
            ),
      );
    }

    balanceByMaterialId.set(materialId, round(balance + quantity));
    valued.push({
      id: movement.id,
      kind: movement.kind,
      materialId,
      date: effectiveDate(movement),
      quantity,
      value: unitPrice === null ? null : Math.round(quantity * unitPrice),
      unitPrice,
      orderId: movement.orderId,
      purchaseId: movement.purchaseId,
      comment: movement.comment,
    });
  }

  return valued;
};

export type StockMonthMaterial = {
  materialId: string;
  opening: number;
  received: number;
  toOrders: number;
  lost: number;
  other: number;
  closing: number;
};

export type StockMonthReport = {
  opening: number;
  received: number;
  receiptCount: number;
  // By composition and by hand («сверх нормы»)
  toOrders: number;
  overuse: number;
  orderCount: number;
  scrap: number;
  waste: number;
  // What a recount found missing (negative) or extra (positive)
  recount: number;
  workshopUse: number;
  returned: number;
  otherOut: number;
  closing: number;
  // Losses = брак + отходы + other + recount shortage
  losses: number;
  // A movement without any price is counted as zero
  hasUnpriced: boolean;
  materials: StockMonthMaterial[];
};

const monthStart = (month: string) => `${month}-01`;

const sumValues = (movements: ValuedMovement[]) =>
  movements.reduce((sum, movement) => sum + (movement.value ?? 0), 0);

// Money leaving the shelf is shown as a positive amount.
const outValue = (movements: ValuedMovement[]) => -sumValues(movements);

export const buildStockMonthReport = (
  valued: ValuedMovement[],
  month: string,
): StockMonthReport => {
  const before = valued.filter((movement) => movement.date < monthStart(month));
  const inMonth = valued.filter((movement) => movement.date.startsWith(month));
  const ofKind = (...kinds: StockMovementKind[]) =>
    inMonth.filter((movement) => kinds.includes(movement.kind));
  const receipts = ofKind('RECEIPT');
  const toOrders = ofKind('WRITE_OFF', 'ORDER_EXTRA');
  const recount = sumValues(ofKind('STOCKTAKE'));
  const scrap = outValue(ofKind('SCRAP'));
  const waste = outValue(ofKind('WASTE'));
  const otherOut = outValue(ofKind('OTHER_OUT'));
  const materialIds = [
    ...new Set([...before, ...inMonth].map((movement) => movement.materialId)),
  ];
  const quantityOf = (
    movements: ValuedMovement[],
    materialId: string,
    kinds?: StockMovementKind[],
  ) =>
    round(
      movements
        .filter(
          (movement) =>
            movement.materialId === materialId &&
            (kinds === undefined || kinds.includes(movement.kind)),
        )
        .reduce((sum, movement) => sum + movement.quantity, 0),
    );

  // Subtracted from zero, so nothing taken out reads 0, not -0.
  const takenOut = (
    movements: ValuedMovement[],
    materialId: string,
    kinds: StockMovementKind[],
  ) => 0 - quantityOf(movements, materialId, kinds);

  return {
    opening: sumValues(before),
    received: sumValues(receipts),
    receiptCount: new Set(
      receipts.map((movement) => movement.purchaseId ?? movement.id),
    ).size,
    toOrders: outValue(toOrders),
    overuse: outValue(ofKind('ORDER_EXTRA')),
    orderCount: new Set(
      toOrders.flatMap((movement) =>
        movement.orderId === null ? [] : [movement.orderId],
      ),
    ).size,
    scrap,
    waste,
    recount,
    workshopUse: outValue(ofKind('WORKSHOP_USE')),
    returned: outValue(ofKind('SUPPLIER_RETURN')),
    otherOut,
    closing: sumValues(before) + sumValues(inMonth),
    losses: scrap + waste + otherOut + Math.max(0, -recount),
    hasUnpriced: [...before, ...inMonth].some(
      (movement) => movement.value === null && movement.quantity !== 0,
    ),
    materials: materialIds.map((materialId) => {
      const opening = quantityOf(before, materialId);
      const all = quantityOf(inMonth, materialId);
      const received = quantityOf(inMonth, materialId, ['RECEIPT']);
      const toOrdersQuantity = takenOut(inMonth, materialId, [
        'WRITE_OFF',
        'ORDER_EXTRA',
      ]);
      const lost = takenOut(inMonth, materialId, [
        'SCRAP',
        'WASTE',
        'OTHER_OUT',
        'STOCKTAKE',
      ]);

      return {
        materialId,
        opening,
        received,
        toOrders: toOrdersQuantity,
        lost,
        other: round(received - toOrdersQuantity - lost - all),
        closing: round(opening + all),
      };
    }),
  };
};

export type PurchaseRecord = {
  id: string;
  date: string | null;
  createdAt: string;
  supplierId: string | null;
  comment: string | null;
};

export type SupplierRecord = { id: string; name: string };

export type SupplierPayment = {
  id: string;
  amount: number;
  date: string | null;
  supplierId: string | null;
  purchaseId: string | null;
};

export type PurchaseLine = {
  movementId: string;
  materialId: string;
  quantity: number;
  unitPrice: number | null;
  value: number | null;
};

export type PurchaseSummary = {
  id: string;
  date: string;
  supplierId: string | null;
  supplierName: string | null;
  comment: string | null;
  lines: PurchaseLine[];
  // Null when no line has a price
  total: number | null;
  paid: number;
  debt: number;
};

export type SupplierSummary = {
  id: string;
  name: string;
  purchaseCount: number;
  purchased: number;
  paid: number;
  debt: number;
};

// A payment made later («Отдать долг») names only the supplier; it pays off
// that supplier's oldest unpaid purchases first.
export const summarizePurchases = ({
  purchases,
  suppliers,
  valued,
  payments,
}: {
  purchases: PurchaseRecord[];
  suppliers: SupplierRecord[];
  valued: ValuedMovement[];
  payments: SupplierPayment[];
}): PurchaseSummary[] => {
  const supplierNames = new Map(
    suppliers.map((supplier) => [supplier.id, supplier.name]),
  );
  const oldestFirst = purchases
    .map((purchase) => {
      const lines = valued
        .filter(
          (movement) =>
            movement.purchaseId === purchase.id && movement.kind === 'RECEIPT',
        )
        .map((movement) => ({
          movementId: movement.id,
          materialId: movement.materialId,
          quantity: movement.quantity,
          unitPrice: movement.unitPrice,
          value: movement.unitPrice === null ? null : movement.value,
        }));
      const priced = lines.flatMap((line) =>
        line.value === null ? [] : [line.value],
      );

      return {
        id: purchase.id,
        date: purchase.date ?? purchase.createdAt.slice(0, 10),
        supplierId: purchase.supplierId,
        supplierName:
          purchase.supplierId === null
            ? null
            : (supplierNames.get(purchase.supplierId) ?? null),
        comment: purchase.comment,
        lines,
        total:
          priced.length === 0
            ? null
            : priced.reduce((sum, value) => sum + value, 0),
        paid: payments
          .filter((payment) => payment.purchaseId === purchase.id)
          .reduce((sum, payment) => sum + payment.amount, 0),
        debt: 0,
      };
    })
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.id.localeCompare(right.id),
    );
  const unassignedBySupplierId = new Map<string, number>();

  for (const payment of payments) {
    if (payment.purchaseId !== null || payment.supplierId === null) continue;

    unassignedBySupplierId.set(
      payment.supplierId,
      (unassignedBySupplierId.get(payment.supplierId) ?? 0) + payment.amount,
    );
  }

  for (const purchase of oldestFirst) {
    const owed = Math.max(0, (purchase.total ?? 0) - purchase.paid);
    const available =
      purchase.supplierId === null
        ? 0
        : (unassignedBySupplierId.get(purchase.supplierId) ?? 0);
    const applied = Math.min(owed, available);

    if (purchase.supplierId !== null && applied > 0) {
      unassignedBySupplierId.set(purchase.supplierId, available - applied);
    }

    purchase.paid += applied;
    purchase.debt = owed - applied;
  }

  return oldestFirst.reverse();
};

// What is owed counts every payment to the supplier, also one not tied to a
// purchase («Отдать долг»), so a debt paid in parts adds up.
export const summarizeSuppliers = ({
  suppliers,
  purchases,
  payments,
}: {
  suppliers: SupplierRecord[];
  purchases: PurchaseSummary[];
  payments: SupplierPayment[];
}): SupplierSummary[] =>
  suppliers
    .map((supplier) => {
      const own = purchases.filter(
        (purchase) => purchase.supplierId === supplier.id,
      );
      const purchased = own.reduce(
        (sum, purchase) => sum + (purchase.total ?? 0),
        0,
      );
      const paid = payments
        .filter((payment) => payment.supplierId === supplier.id)
        .reduce((sum, payment) => sum + payment.amount, 0);

      return {
        id: supplier.id,
        name: supplier.name,
        purchaseCount: own.length,
        purchased,
        paid,
        debt: Math.max(0, purchased - paid),
      };
    })
    .sort(
      (left, right) =>
        right.debt - left.debt ||
        left.name.localeCompare(right.name, 'ru', { numeric: true }),
    );
