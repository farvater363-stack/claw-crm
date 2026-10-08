import { type StockMovementKind } from 'src/constants/select-options';
import { type StockMaterial } from 'src/stock/stock-screen';
import {
  type ManualOutKind,
  type PurchaseSummary,
  type ValuedMovement,
} from 'src/stock/stock-ledger';
import { formatQuantity } from 'src/ui/format';

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

// «2026-10» → «Октябрь 2026»
export const monthLabel = (month: string): string =>
  `${MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}`;

export const shiftMonth = (month: string, by: number): string => {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by;

  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
};

export type OutFilter = 'all' | 'orders' | 'losses' | 'other';

export const OUT_FILTERS: { value: OutFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'orders', label: 'На заказы' },
  { value: 'losses', label: 'Брак и отходы' },
  { value: 'other', label: 'Другое' },
];

const FILTER_KINDS: Record<Exclude<OutFilter, 'all'>, StockMovementKind[]> = {
  orders: ['WRITE_OFF', 'ORDER_EXTRA'],
  losses: ['SCRAP', 'WASTE', 'STOCKTAKE'],
  other: ['WORKSHOP_USE', 'SUPPLIER_RETURN', 'OTHER_OUT'],
};

const OUT_TITLES: Record<
  Exclude<StockMovementKind, 'RECEIPT' | 'WRITE_OFF' | 'ORDER_EXTRA'>,
  string
> = {
  STOCKTAKE: 'Недостача при пересчёте',
  SCRAP: 'Брак',
  WASTE: 'Отходы',
  WORKSHOP_USE: 'Для цеха',
  SUPPLIER_RETURN: 'Вернул поставщику',
  OTHER_OUT: 'Другое',
};

export type OutEntry = {
  key: string;
  date: string;
  title: string;
  orderId: string | null;
  // «Профиль 20×20, 52 м · Прут 10, 60 м»
  lines: string;
  // In сум, what left; null when a line has no price yet
  value: number | null;
  note: string | null;
  // Written by hand beyond the composition
  isOveruse: boolean;
};

// One entry per order and day for what went to orders, so the write-off of a
// whole order reads as one line; anything else stays one entry per movement.
export const buildOutEntries = ({
  valued,
  month,
  filter,
  materials,
  orderNames,
}: {
  valued: ValuedMovement[];
  month: string;
  filter: OutFilter;
  materials: StockMaterial[];
  orderNames: Record<string, string>;
}): OutEntry[] => {
  const materialById = new Map(materials.map((item) => [item.id, item]));
  const outgoing = valued.filter(
    (movement) =>
      movement.date.startsWith(month) &&
      movement.kind !== 'RECEIPT' &&
      movement.quantity < 0 &&
      (filter === 'all' || FILTER_KINDS[filter].includes(movement.kind)),
  );
  const groups = new Map<string, ValuedMovement[]>();

  for (const movement of outgoing) {
    const key =
      movement.kind === 'WRITE_OFF' && movement.orderId !== null
        ? `order:${movement.orderId}:${movement.date}`
        : `movement:${movement.id}`;

    groups.set(key, [...(groups.get(key) ?? []), movement]);
  }

  return [...groups.entries()]
    .map(([key, movements]): OutEntry => {
      const [first] = movements;
      const values = movements.map((movement) => movement.value);
      const orderName =
        first.orderId === null ? null : (orderNames[first.orderId] ?? 'Заказ');

      return {
        key,
        date: first.date,
        title:
          first.kind === 'WRITE_OFF' ||
          first.kind === 'ORDER_EXTRA' ||
          first.kind === 'RECEIPT'
            ? (orderName ?? 'Заказ')
            : OUT_TITLES[first.kind],
        orderId: first.orderId,
        lines: movements
          .map((movement) => {
            const material = materialById.get(movement.materialId);

            return `${material?.name || 'Без названия'}, ${formatQuantity(-movement.quantity, material?.unitLabel ?? '')}`;
          })
          .join(' · '),
        value: values.some((value) => value === null)
          ? null
          : -values.reduce((sum: number, value) => sum + (value ?? 0), 0),
        note:
          first.kind === 'WRITE_OFF'
            ? 'По составу решётки'
            : first.kind === 'ORDER_EXTRA'
              ? ['Сверх нормы', first.comment].filter(Boolean).join(': ')
              : first.comment,
        isOveruse: first.kind === 'ORDER_EXTRA',
      };
    })
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) || left.key.localeCompare(right.key),
    );
};

export const purchasesInMonth = (
  purchases: PurchaseSummary[],
  month: string,
): PurchaseSummary[] =>
  purchases.filter((purchase) => purchase.date.startsWith(month));

// «Профиль 20×20, 120 м × 27,000»
export const purchaseLinesText = (
  purchase: PurchaseSummary,
  materials: StockMaterial[],
  formatPrice: (value: number) => string,
): string => {
  const materialById = new Map(materials.map((item) => [item.id, item]));

  return purchase.lines
    .map((line) => {
      const material = materialById.get(line.materialId);
      const amount = `${material?.name || 'Без названия'}, ${formatQuantity(line.quantity, material?.unitLabel ?? '')}`;

      return line.unitPrice === null
        ? amount
        : `${amount} × ${formatPrice(line.unitPrice)}`;
    })
    .join(' · ');
};

export const outKindLabel = (kind: ManualOutKind): string =>
  kind === 'ORDER_EXTRA' ? 'На заказ сверх нормы' : OUT_TITLES[kind];

const HISTORY_WORDS: Record<StockMovementKind, string> = {
  RECEIPT: 'пришло',
  STOCKTAKE: 'пересчёт',
  WRITE_OFF: 'ушло на',
  ORDER_EXTRA: 'сверх нормы на',
  SCRAP: 'брак',
  WASTE: 'отходы',
  WORKSHOP_USE: 'для цеха',
  SUPPLIER_RETURN: 'вернул поставщику',
  OTHER_OUT: 'другое',
};

// One line of a material's history: «3 октября ушло на №1012 23 м»
export const historyLineText = (
  movement: ValuedMovement,
  unitLabel: string,
  orderNames: Record<string, string>,
  formatDay: (isoDate: string) => string,
): string => {
  const orderName =
    movement.orderId === null ? null : (orderNames[movement.orderId] ?? 'заказ');
  const amount =
    movement.kind === 'STOCKTAKE'
      ? `${movement.quantity > 0 ? '+' : movement.quantity < 0 ? '−' : ''}${formatQuantity(Math.abs(movement.quantity), unitLabel)}`
      : formatQuantity(Math.abs(movement.quantity), unitLabel);

  return [
    formatDay(movement.date),
    HISTORY_WORDS[movement.kind],
    ...((movement.kind === 'WRITE_OFF' || movement.kind === 'ORDER_EXTRA') &&
    orderName !== null
      ? [orderName]
      : []),
    amount,
  ].join(' ');
};

export type PurchaseListItem = PurchaseSummary & {
  // A purchase typed before purchases had a supplier: one material, no payment
  isLoose: boolean;
};

export const purchaseList = (
  purchases: PurchaseSummary[],
  valued: ValuedMovement[],
  month: string,
): PurchaseListItem[] =>
  [
    ...purchasesInMonth(purchases, month).map((purchase) => ({
      ...purchase,
      isLoose: false,
    })),
    ...valued
      .filter(
        (movement) =>
          movement.kind === 'RECEIPT' &&
          movement.purchaseId === null &&
          movement.date.startsWith(month),
      )
      .map((movement) => {
        const value = movement.unitPrice === null ? null : movement.value;

        return {
          id: `movement:${movement.id}`,
          date: movement.date,
          supplierId: null,
          supplierName: null,
          comment: movement.comment,
          lines: [
            {
              movementId: movement.id,
              materialId: movement.materialId,
              quantity: movement.quantity,
              unitPrice: movement.unitPrice,
              value,
            },
          ],
          total: value,
          paid: 0,
          debt: 0,
          isLoose: true,
        };
      }),
  ].sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.id.localeCompare(right.id),
  );
