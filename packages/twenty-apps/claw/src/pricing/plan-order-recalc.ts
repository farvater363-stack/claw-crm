import {
  type DeadlineState,
  type DiscountKind,
  type ExtraServiceUnit,
} from 'src/constants/select-options';
import {
  applyLatePenalty,
  computeMasterBasePay,
  type KeptRate,
  type PayRule,
} from 'src/payroll/pay-rules';
import { computeDeadlineState } from 'src/pricing/compute-deadline-state';
import { computeDiscount } from 'src/pricing/compute-discount';
import { computeItemAreaSquareMeters } from 'src/pricing/compute-item-area';
import { addDays, computeDaysLate } from 'src/pricing/dates';
import { roundTo } from 'src/pricing/round';

export type GrillePrice = {
  id: string;
  pricePerSquareMeter: number | null;
  costPerSquareMeter: number | null;
};

export type ItemSnapshot = {
  id: string;
  name: string | null;
  designId: string | null;
  widthCm: number | null;
  heightCm: number | null;
  projectionCm: number | null;
  quantity: number | null;
  areaSquareMeters: number | null;
  pricePerSquareMeter: number | null;
  costPerSquareMeter: number | null;
  lineTotal: number | null;
  lineCost: number | null;
};

export type ExtraServiceLineSnapshot = {
  id: string;
  name: string | null;
  extraServiceId: string | null;
  quantity: number | null;
  price: number | null;
  cost: number | null;
  lineTotal: number | null;
  lineCost: number | null;
};

export type ExtraServiceCatalogEntry = {
  id: string;
  name: string;
  unit: ExtraServiceUnit | null;
  price: number | null;
  cost: number | null;
};

export type OrderSnapshot = {
  areaSquareMeters: number | null;
  subtotal: number | null;
  discountKind: DiscountKind | null;
  discountValue: number | null;
  discount: number | null;
  total: number | null;
  paid: number | null;
  balance: number | null;
  costTotal: number | null;
  margin: number | null;
  marginPercent: number | null;
  productionStartDate: string | null;
  installationDeadline: string | null;
  installedAt: string | null;
  readyAt: string | null;
  daysLate: number | null;
  masterBonus: number | null;
  masterPayCalculated: number | null;
  masterPenalty: number | null;
  masterPayTotal: number | null;
  status: string | null;
  deadlineState: DeadlineState | null;
};

export type MasterSnapshot = {
  penaltyPercentPerDay: number;
  // All pay rules of the order's master
  rules: PayRule[];
  // The rates already written on this order's accrual lines; they win over the rules
  keptRates: KeptRate[];
};

export type RecalcInput = {
  order: OrderSnapshot;
  items: ItemSnapshot[];
  extraServiceLines: ExtraServiceLineSnapshot[];
  extraServiceCatalog: ExtraServiceCatalogEntry[];
  grilles: GrillePrice[];
  master: MasterSnapshot | null;
  // Sum of the order's payments that are not deleted
  paymentsTotal: number;
  today: string;
  refreshPriceItemIds: string[];
  refreshPriceExtraServiceLineIds: string[];
};

export type RecalcPlan = {
  orderUpdate: Partial<OrderSnapshot>;
  itemUpdates: { id: string; update: Partial<ItemSnapshot> }[];
  extraServiceLineUpdates: {
    id: string;
    update: Partial<ExtraServiceLineSnapshot>;
  }[];
};

const INSTALLATION_DAYS_AFTER_START = 7;

const diff = <TRecord extends object>(
  current: TRecord,
  next: Partial<TRecord>,
): Partial<TRecord> =>
  Object.fromEntries(
    Object.entries(next).filter(
      ([key, value]) => current[key as keyof TRecord] !== value,
    ),
  ) as Partial<TRecord>;

const multiplyOrNull = (...values: (number | null)[]): number | null =>
  values.some((value) => value === null)
    ? null
    : Math.round(
        values.reduce<number>(
          (product, value) => product * (value as number),
          1,
        ),
      );

const planItem = (
  item: ItemSnapshot,
  grilles: GrillePrice[],
  shouldRefreshPrice: boolean,
): ItemSnapshot => {
  const hasDimensions = item.widthCm !== null && item.heightCm !== null;
  const projectionCm = item.projectionCm ?? 0;
  const areaSquareMeters = hasDimensions
    ? computeItemAreaSquareMeters({
        widthCm: item.widthCm as number,
        heightCm: item.heightCm as number,
        projectionCm,
      })
    : null;
  const name = hasDimensions
    ? [
        item.widthCm,
        item.heightCm,
        ...(projectionCm > 0 ? [projectionCm] : []),
      ].join('×')
    : item.name;

  const entry = grilles.find((grille) => grille.id === item.designId) ?? null;
  const pricePerSquareMeter =
    shouldRefreshPrice || item.pricePerSquareMeter === null
      ? (entry?.pricePerSquareMeter ??
        (shouldRefreshPrice ? null : item.pricePerSquareMeter))
      : item.pricePerSquareMeter;
  const costPerSquareMeter =
    shouldRefreshPrice || item.costPerSquareMeter === null
      ? (entry?.costPerSquareMeter ??
        (shouldRefreshPrice ? null : item.costPerSquareMeter))
      : item.costPerSquareMeter;
  const quantity = item.quantity ?? 1;

  return {
    ...item,
    name,
    areaSquareMeters,
    pricePerSquareMeter,
    costPerSquareMeter,
    lineTotal: multiplyOrNull(areaSquareMeters, quantity, pricePerSquareMeter),
    lineCost: multiplyOrNull(areaSquareMeters, quantity, costPerSquareMeter),
  };
};

const defaultQuantity = (
  unit: ExtraServiceUnit | null,
  orderAreaSquareMeters: number,
): number | null => {
  if (unit === 'FIXED') return 1;
  // Left empty until the order has an area, so it fills in once items arrive.
  if (unit === 'PER_SQUARE_METER') {
    return orderAreaSquareMeters > 0 ? orderAreaSquareMeters : null;
  }

  return null;
};

const planExtraServiceLine = (
  line: ExtraServiceLineSnapshot,
  catalog: ExtraServiceCatalogEntry[],
  shouldRefreshPrice: boolean,
  orderAreaSquareMeters: number,
): ExtraServiceLineSnapshot => {
  const service =
    catalog.find((entry) => entry.id === line.extraServiceId) ?? null;
  const price =
    shouldRefreshPrice || line.price === null
      ? (service?.price ?? null)
      : line.price;
  const cost =
    shouldRefreshPrice || line.cost === null
      ? (service?.cost ?? null)
      : line.cost;
  const quantity =
    line.quantity ??
    defaultQuantity(service?.unit ?? null, orderAreaSquareMeters);

  return {
    ...line,
    name: service?.name ?? line.name,
    quantity,
    price,
    cost,
    lineTotal: multiplyOrNull(quantity, price),
    lineCost: multiplyOrNull(quantity, cost),
  };
};

const sumTreatingNullAsZero = (values: (number | null)[]): number =>
  values.reduce<number>((sum, value) => sum + (value ?? 0), 0);

export const planOrderRecalc = (input: RecalcInput): RecalcPlan => {
  const plannedItems = input.items.map((item) =>
    planItem(item, input.grilles, input.refreshPriceItemIds.includes(item.id)),
  );

  const hasLines = input.items.length + input.extraServiceLines.length > 0;
  const itemsAreaSquareMeters = roundTo(
    sumTreatingNullAsZero(
      plannedItems.map(
        (item) => (item.areaSquareMeters ?? 0) * (item.quantity ?? 1),
      ),
    ),
    2,
  );

  const plannedLines = input.extraServiceLines.map((line) =>
    planExtraServiceLine(
      line,
      input.extraServiceCatalog,
      input.refreshPriceExtraServiceLineIds.includes(line.id),
      itemsAreaSquareMeters,
    ),
  );

  const { order } = input;
  const areaSquareMeters = hasLines
    ? itemsAreaSquareMeters
    : order.areaSquareMeters;
  // An order without lines keeps its stored sums. One saved before the discount
  // existed has only a total, which is then its sum before the discount.
  const subtotal = hasLines
    ? sumTreatingNullAsZero(
        [...plannedItems, ...plannedLines].map((line) => line.lineTotal),
      )
    : (order.subtotal ?? order.total);
  const discount =
    subtotal !== null
      ? computeDiscount({
          subtotal,
          kind: order.discountKind,
          value: order.discountValue,
        })
      : null;
  const total =
    subtotal !== null && discount !== null ? subtotal - discount : null;
  const costTotal = hasLines
    ? sumTreatingNullAsZero(
        [...plannedItems, ...plannedLines].map((line) => line.lineCost),
      )
    : order.costTotal;

  const margin =
    total !== null && costTotal !== null ? total - costTotal : null;
  const installationDeadline =
    order.installationDeadline ??
    (order.productionStartDate !== null
      ? addDays(order.productionStartDate, INSTALLATION_DAYS_AFTER_START)
      : null);
  const daysLate = computeDaysLate({
    deadline: installationDeadline,
    readyAt: order.readyAt,
  });
  const masterBasePay =
    input.master !== null
      ? computeMasterBasePay({
          rules: input.master.rules,
          keptRates: input.master.keptRates,
          areaSquareMeters,
        })
      : null;
  const masterPayCalculated =
    input.master !== null && masterBasePay !== null
      ? applyLatePenalty({
          basePay: masterBasePay,
          penaltyPercentPerDay: input.master.penaltyPercentPerDay,
          daysLate: daysLate ?? 0,
        })
      : null;
  const masterPenalty =
    masterBasePay !== null && masterPayCalculated !== null
      ? masterBasePay - masterPayCalculated
      : null;

  const nextOrder: OrderSnapshot = {
    ...order,
    areaSquareMeters,
    subtotal,
    discount,
    total,
    costTotal,
    paid: input.paymentsTotal,
    balance: total !== null ? total - input.paymentsTotal : null,
    margin,
    marginPercent:
      margin !== null && total !== null && total !== 0
        ? roundTo((margin / total) * 100, 2)
        : null,
    installationDeadline,
    daysLate,
    deadlineState: computeDeadlineState({
      status: order.status,
      deadline: installationDeadline,
      today: input.today,
    }),
    masterPayCalculated,
    masterPenalty,
    masterPayTotal:
      masterPayCalculated !== null
        ? masterPayCalculated + (order.masterBonus ?? 0)
        : null,
  };

  return {
    orderUpdate: diff(order, nextOrder),
    itemUpdates: plannedItems
      .map((planned, index) => ({
        id: planned.id,
        update: diff(input.items[index], planned),
      }))
      .filter(({ update }) => Object.keys(update).length > 0),
    extraServiceLineUpdates: plannedLines
      .map((planned, index) => ({
        id: planned.id,
        update: diff(input.extraServiceLines[index], planned),
      }))
      .filter(({ update }) => Object.keys(update).length > 0),
  };
};
