import { type ExtraServiceUnit } from 'src/constants/select-options';
import { computeItemAreaSquareMeters } from 'src/pricing/compute-item-area';
import { computeMasterPay } from 'src/pricing/compute-master-pay';
import { addDays, computeDaysLate } from 'src/pricing/dates';
import {
  type PriceListEntry,
  resolvePriceListEntry,
} from 'src/pricing/resolve-price-list-entry';
import { roundTo } from 'src/pricing/round';

export type ItemSnapshot = {
  id: string;
  name: string | null;
  designId: string | null;
  metal: string | null;
  metalSize: string | null;
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
  total: number | null;
  prepayment: number | null;
  balance: number | null;
  costTotal: number | null;
  margin: number | null;
  marginPercent: number | null;
  productionStartDate: string | null;
  installationDeadline: string | null;
  installedAt: string | null;
  daysLate: number | null;
  masterBonus: number | null;
  masterPayCalculated: number | null;
  masterPayTotal: number | null;
};

export type MasterSnapshot = {
  ratePerSquareMeter: number;
  penaltyPercentPerDay: number;
};

export type RecalcInput = {
  order: OrderSnapshot;
  items: ItemSnapshot[];
  extraServiceLines: ExtraServiceLineSnapshot[];
  extraServiceCatalog: ExtraServiceCatalogEntry[];
  priceList: PriceListEntry[];
  master: MasterSnapshot | null;
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
  priceList: PriceListEntry[],
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

  const entry = resolvePriceListEntry(priceList, item);
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
    planItem(
      item,
      input.priceList,
      input.refreshPriceItemIds.includes(item.id),
    ),
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
  const total = hasLines
    ? sumTreatingNullAsZero(
        [...plannedItems, ...plannedLines].map((line) => line.lineTotal),
      )
    : order.total;
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
    installedAt: order.installedAt,
  });
  const masterPayCalculated =
    input.master !== null && areaSquareMeters !== null
      ? computeMasterPay({
          areaSquareMeters,
          ratePerSquareMeter: input.master.ratePerSquareMeter,
          penaltyPercentPerDay: input.master.penaltyPercentPerDay,
          daysLate: daysLate ?? 0,
        })
      : null;

  const nextOrder: OrderSnapshot = {
    ...order,
    areaSquareMeters,
    total,
    costTotal,
    balance: total !== null ? total - (order.prepayment ?? 0) : null,
    margin,
    marginPercent:
      margin !== null && total !== null && total !== 0
        ? roundTo((margin / total) * 100, 2)
        : null,
    installationDeadline,
    daysLate,
    masterPayCalculated,
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
