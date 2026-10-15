import {
  type DeadlineState,
  type DiscountKind,
  type ExtraServiceUnit,
  type Product,
  type ProjectionKind,
} from 'src/constants/select-options';
import {
  parseItemShape,
  shapeKindLabel,
} from 'src/opening-shape/opening-shape';
import {
  applyLatePenalty,
  computeMasterBasePay,
  type KeptRate,
  masterRuleRate,
  type PayRule,
} from 'src/payroll/pay-rules';
import {
  EMPTY_WORKSHOP_CATALOG,
  type KeptSquareMeterRates,
  planSquareMeterParts,
  type WorkshopCatalog,
} from 'src/payroll/workshop-pay';
import { computeDeadlineState } from 'src/pricing/compute-deadline-state';
import { computeDiscount } from 'src/pricing/compute-discount';
import {
  computeItemAreaSquareMeters,
  computeItemUnits,
  formatItemSize,
  formatRailingSize,
} from 'src/pricing/compute-item-area';
import { addDays, computeDaysLate } from 'src/pricing/dates';
import { roundTo } from 'src/pricing/round';

export type GrillePrice = {
  id: string;
  // Missing on designs loaded before railings: those are grilles
  product?: Product | null;
  pricePerSquareMeter: number | null;
  costPerSquareMeter: number | null;
};

export type ItemSnapshot = {
  id: string;
  name: string | null;
  // Missing on items saved before railings: those are grilles
  product?: Product | null;
  // The saved outline of a non-rectangular проём, drawn and named from
  shape?: unknown;
  designId: string | null;
  widthCm: number | null;
  heightCm: number | null;
  projectionCm: number | null;
  projectionKind: ProjectionKind | null;
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
  // «Ставки цеха» and the rates per m² kept on this order's lines, by row
  workshop?: {
    masterId: string;
    catalog: WorkshopCatalog;
    kept: KeptSquareMeterRates;
  };
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
  // Sum of the pay lines already written for this order, every worker's
  payTotal: number;
  today: string;
  refreshPriceItemIds: string[];
  refreshPriceExtraServiceLineIds: string[];
  // Its last line was just removed: it is not an imported order without lines.
  linesRemoved?: boolean;
  // «Итого» as just typed by hand; on an order without lines it moves the sum.
  typedTotal?: number | null;
  // What the manager listed for the order's «Другая» рисунки, all together
  customMaterialCost?: number | null;
  // That list just changed: a cost left from rows since removed goes too
  recostCustomItems?: boolean;
};

export type RecalcPlan = {
  orderUpdate: Partial<OrderSnapshot>;
  itemUpdates: { id: string; update: Partial<ItemSnapshot> }[];
  extraServiceLineUpdates: {
    id: string;
    update: Partial<ExtraServiceLineSnapshot>;
  }[];
};

export const INSTALLATION_DAYS_AFTER_START = 7;

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

const describeItemSize = (
  item: ItemSnapshot,
  size: Parameters<typeof formatItemSize>[0],
): string => {
  if (item.product === 'RAILING') {
    return formatRailingSize({
      lengthCm: size.widthCm,
      heightCm: size.heightCm,
    });
  }

  const shape = parseItemShape(item.shape, size.widthCm, size.heightCm);

  return shape === null
    ? formatItemSize(size)
    : `${shapeKindLabel(shape.kind).toLowerCase()} ${formatItemSize(size)}`;
};

const planItem = (
  item: ItemSnapshot,
  grilles: GrillePrice[],
  shouldRefreshPrice: boolean,
): ItemSnapshot => {
  const hasDimensions = item.widthCm !== null && item.heightCm !== null;
  const size = {
    widthCm: item.widthCm as number,
    heightCm: item.heightCm as number,
    projectionCm: item.projectionCm ?? 0,
    projectionKind: item.projectionKind,
  };
  const isRailing = item.product === 'RAILING';
  const areaSquareMeters =
    hasDimensions && !isRailing ? computeItemAreaSquareMeters(size) : null;
  // A railing is priced by its length alone, so a missing height must not zero it
  const units = computeItemUnits({
    product: item.product,
    widthCm: hasDimensions || isRailing ? item.widthCm : null,
    areaSquareMeters,
  });
  const name = hasDimensions ? describeItemSize(item, size) : item.name;

  // A grille's per-m² price never prices a railing's metres, nor the reverse
  const entry =
    grilles.find(
      (grille) =>
        grille.id === item.designId &&
        (grille.product ?? 'GRILLE') === (item.product ?? 'GRILLE'),
    ) ?? null;
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
    lineTotal: multiplyOrNull(units, quantity, pricePerSquareMeter),
    lineCost: multiplyOrNull(units, quantity, costPerSquareMeter),
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

const planMasterSquareMeterParts = (
  master: MasterSnapshot,
  items: ItemSnapshot[],
  areaSquareMeters: number | null,
) => {
  const keptSquareMeterRate = master.keptRates.find(
    (rate) => rate.method === 'PER_SQUARE_METER',
  )?.rate;

  return planSquareMeterParts({
    catalog: master.workshop?.catalog ?? EMPTY_WORKSHOP_CATALOG,
    masterId: master.workshop?.masterId ?? '',
    items,
    orderAreaSquareMeters: areaSquareMeters,
    ruleRate: masterRuleRate(master.rules),
    kept: master.workshop?.kept ?? {
      legacyRate: keptSquareMeterRate ?? null,
      byPart: new Map(),
    },
  });
};

const sumTreatingNullAsZero = (values: (number | null)[]): number =>
  values.reduce<number>((sum, value) => sum + (value ?? 0), 0);

// The order's own materials are the cost of its «Другая» рисунки, shared by
// their м² (п.м. for a railing).
const withCustomMaterialCost = (
  items: ItemSnapshot[],
  cost: number | null,
  isListChanged: boolean,
): ItemSnapshot[] => {
  const unitsOf = (item: ItemSnapshot) =>
    item.designId === null ? computeItemUnits(item) : null;
  const totalUnits = sumTreatingNullAsZero(
    items.map((item) => {
      const units = unitsOf(item);

      return units === null ? null : units * (item.quantity ?? 1);
    }),
  );

  if (totalUnits <= 0) return items;

  // A cost typed by hand on a «Другая» item stays until the manager lists
  // its materials.
  if (cost === null && !isListChanged) return items;

  const costPerUnit = cost === null ? null : Math.round(cost / totalUnits);

  return items.map((item) => {
    const units = unitsOf(item);

    return units === null
      ? item
      : {
          ...item,
          costPerSquareMeter: costPerUnit,
          lineCost: multiplyOrNull(units, item.quantity ?? 1, costPerUnit),
        };
  });
};

export const planOrderRecalc = (input: RecalcInput): RecalcPlan => {
  const plannedItems = withCustomMaterialCost(
    input.items.map((item) =>
      planItem(
        item,
        input.grilles,
        input.refreshPriceItemIds.includes(item.id),
      ),
    ),
    input.customMaterialCost ?? null,
    input.recostCustomItems === true,
  );

  const hasLines =
    input.items.length + input.extraServiceLines.length > 0 ||
    input.linesRemoved === true;
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
  // A typed «Итого» is what is left after the discount, so the sum before it
  // is that plus the discount; the recalc's own write of the total gives back
  // the same sum.
  const subtotal = hasLines
    ? sumTreatingNullAsZero(
        [...plannedItems, ...plannedLines].map((line) => line.lineTotal),
      )
    : input.typedTotal !== undefined && input.typedTotal !== null
      ? input.typedTotal + (order.discount ?? 0)
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
  // Material by the composition and the purchase price, plus what the workers
  // really earned on this order.
  const costTotal = hasLines
    ? sumTreatingNullAsZero(
        [...plannedItems, ...plannedLines].map((line) => line.lineCost),
      ) + input.payTotal
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
          squareMeterParts: planMasterSquareMeterParts(
            input.master,
            hasLines ? plannedItems : [],
            areaSquareMeters,
          ),
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
