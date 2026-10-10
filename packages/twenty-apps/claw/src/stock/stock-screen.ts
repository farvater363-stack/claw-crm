import { parseDecimalInput } from 'src/measurer-form/measurer-form';
import { PLAIN_DECIMAL } from 'src/prices/prices-screen';
import { roundTo } from 'src/pricing/round';
import { formatQuantity } from 'src/ui/format';

export type StockMaterial = {
  id: string;
  name: string | null;
  unitLabel: string;
  onHand: number | null;
  reserved: number | null;
  toBuy: number | null;
  minimumStock: number | null;
  stockState: 'BUY' | 'LOW' | 'OK' | null;
  overrunPercent: number | null;
};

export type StockNeed = {
  materialId: string;
  orderId: string;
  orderName: string;
  quantity: number;
};

export type StockRow = {
  id: string;
  name: string;
  unitLabel: string;
  onHand: number;
  onHandText: string;
  reservedText: string;
  pill: { tone: 'danger' | 'warning' | 'success'; text: string };
  needs: StockNeed[];
  minimumStock: number;
  overuseNote: string | null;
  // «нужно 96 м + запас 50 м»
  needText: string;
  // How much of what is needed and kept in reserve lies on the shelf, 0 to 1
  level: number;
};

// Purchase prices by material id; empty for a role that does not see them
export type StockPrices = Record<
  string,
  { last: number | null; average: number | null }
>;

export type BuyLine = {
  id: string;
  name: string;
  quantity: number;
  unitLabel: string;
  lastPrice: number | null;
  sum: number | null;
};

export type BuyList = {
  lines: BuyLine[];
  // By the last purchase prices; null when none of the lines has one
  total: number | null;
  // Plain text for the supplier: names and amounts, no money
  copyText: string;
};

export type StockRecountEntry = {
  kind: 'STOCKTAKE';
  materialId: string;
  countedQuantity: number;
  date: string;
};

const QUANTITY_DECIMALS = 2;
const OVERUSE_NOTE_FROM_PERCENT = 5;
const STATE_ORDER = { BUY: 0, LOW: 1, OK: 2 } as const;

const stockLevel = ({
  onHand,
  reserved,
  minimumStock,
}: Pick<StockMaterial, 'onHand' | 'reserved' | 'minimumStock'>): number => {
  const wanted = (reserved ?? 0) + (minimumStock ?? 0);

  return wanted <= 0 ? 1 : Math.min(1, Math.max(0, (onHand ?? 0) / wanted));
};

export const buildBuyList = (
  materials: StockMaterial[],
  prices: StockPrices,
): BuyList => {
  const lines = materials
    .filter(
      (material) =>
        (material.stockState ?? 'OK') !== 'OK' && (material.toBuy ?? 0) > 0,
    )
    .sort(
      (left, right) =>
        STATE_ORDER[left.stockState ?? 'OK'] -
          STATE_ORDER[right.stockState ?? 'OK'] ||
        (left.name ?? '').localeCompare(right.name ?? '', 'ru', {
          numeric: true,
        }),
    )
    .map((material): BuyLine => {
      const quantity = material.toBuy ?? 0;
      const lastPrice = prices[material.id]?.last ?? null;

      return {
        id: material.id,
        name: material.name ?? '',
        quantity,
        unitLabel: material.unitLabel,
        lastPrice,
        sum: lastPrice === null ? null : Math.round(quantity * lastPrice),
      };
    });
  const sums = lines.flatMap((line) => (line.sum === null ? [] : [line.sum]));

  return {
    lines,
    total:
      sums.length === 0 ? null : sums.reduce((sum, value) => sum + value, 0),
    copyText: lines
      .map(
        (line) =>
          `${line.name} — ${formatQuantity(line.quantity, line.unitLabel)}`,
      )
      .join('\n'),
  };
};

// What lies on the shelf, by the average price it was bought at. Null when no
// material has a price.
export const stockValue = (
  materials: StockMaterial[],
  prices: StockPrices,
): number | null => {
  const values = materials.flatMap((material) => {
    const price = prices[material.id]?.average ?? prices[material.id]?.last;

    return price === null || price === undefined
      ? []
      : [Math.max(material.onHand ?? 0, 0) * price];
  });

  return values.length === 0
    ? null
    : Math.round(values.reduce((sum, value) => sum + value, 0));
};

export const buildStockRows = (
  materials: StockMaterial[],
  needs: StockNeed[],
): StockRow[] =>
  materials
    .map((material) => {
      const state = material.stockState ?? 'OK';
      const toBuy = material.toBuy ?? 0;

      return {
        state,
        row: {
          id: material.id,
          name: material.name ?? '',
          unitLabel: material.unitLabel,
          onHand: material.onHand ?? 0,
          onHandText: formatQuantity(material.onHand ?? 0, material.unitLabel),
          reservedText: formatQuantity(
            material.reserved ?? 0,
            material.unitLabel,
          ),
          pill:
            state === 'OK'
              ? { tone: 'success' as const, text: 'Хватает' }
              : {
                  tone:
                    state === 'BUY'
                      ? ('danger' as const)
                      : ('warning' as const),
                  text: `Купить ${formatQuantity(toBuy, material.unitLabel)}`,
                },
          needs: needs.filter((need) => need.materialId === material.id),
          minimumStock: material.minimumStock ?? 0,
          needText: [
            `нужно ${formatQuantity(material.reserved ?? 0, material.unitLabel)}`,
            ...((material.minimumStock ?? 0) > 0
              ? [
                  `запас ${formatQuantity(material.minimumStock ?? 0, material.unitLabel)}`,
                ]
              : []),
          ].join(' + '),
          level: stockLevel(material),
          overuseNote:
            material.overrunPercent !== null &&
            material.overrunPercent >= OVERUSE_NOTE_FROM_PERCENT
              ? `С прошлого пересчёта ушло на ${formatQuantity(material.overrunPercent, '%')} больше, чем по составу`
              : null,
        },
      };
    })
    .sort(
      (left, right) =>
        STATE_ORDER[left.state] - STATE_ORDER[right.state] ||
        left.row.name.localeCompare(right.row.name, 'ru', { numeric: true }),
    )
    .map(({ row }) => row);

// An amount that may be zero: a counted stock, a minimum to keep.
export const parseStockAmount = (
  raw: string,
): { ok: true; value: number } | { ok: false; error: string } => {
  const trimmed = raw.trim();
  // Number() alone would also take «1e3», «0x10» and a signed value.
  const value = PLAIN_DECIMAL.test(trimmed) ? parseDecimalInput(trimmed) : null;

  return value === null
    ? { ok: false, error: 'Введите число, ноль или больше' }
    : { ok: true, value: roundTo(value, QUANTITY_DECIMALS) };
};

export const buildRecount = (
  typed: Record<string, string>,
  today: string,
):
  | { ok: true; data: StockRecountEntry[] }
  | { ok: false; errors: Record<string, string> } => {
  const errors: Record<string, string> = {};
  const data: StockRecountEntry[] = [];

  for (const [materialId, raw] of Object.entries(typed)) {
    if (raw.trim() === '') continue;

    const counted = parseStockAmount(raw);

    if (counted.ok) {
      data.push({
        kind: 'STOCKTAKE',
        materialId,
        countedQuantity: counted.value,
        date: today,
      });
    } else {
      errors[materialId] = counted.error;
    }
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, data };
};

const MATERIALS_WORD: Partial<Record<Intl.LDMLPluralRule, string>> = {
  one: 'материал',
  few: 'материала',
};

export const recountSummary = (
  typed: Record<string, string>,
): string | null => {
  const count = Object.values(typed).filter((raw) => raw.trim() !== '').length;

  return count === 0
    ? null
    : `Изменится ${count} ${MATERIALS_WORD[new Intl.PluralRules('ru').select(count)] ?? 'материалов'}`;
};

export const parseMinimumStock = (
  raw: string,
): { ok: true; value: number } | { ok: false; error: string } =>
  raw.trim() === '' ? { ok: true, value: 0 } : parseStockAmount(raw);

// What deleting a material takes with it, said before it is deleted. The
// history stays: past purchases and write-offs keep their amounts and money.
export const materialRemovalNotes = (
  row: Pick<StockRow, 'onHand' | 'onHandText' | 'needs'>,
  usedIn: string[],
): string[] => [
  ...(row.onHand > 0 ? [`На складе ещё ${row.onHandText}.`] : []),
  ...(usedIn.length > 0 ? [`Уберётся из состава: ${usedIn.join(', ')}.`] : []),
  ...(row.needs.length > 0
    ? [
        `Снимется резерв на заказы: ${[
          ...new Set(row.needs.map((need) => need.orderName)),
        ].join(', ')}.`,
      ]
    : []),
  'История приходов и расходов останется.',
];
