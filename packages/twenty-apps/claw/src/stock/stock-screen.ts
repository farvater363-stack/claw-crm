import { parseDecimalInput } from 'src/measurer-form/measurer-form';
import {
  PLAIN_DECIMAL,
  parseOptionalMoney,
  parsePositiveNumber,
} from 'src/prices/prices-screen';
import { roundTo } from 'src/pricing/round';
import { formatDayMonth, formatQuantity } from 'src/ui/format';

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
  onHandText: string;
  reservedText: string;
  pill: { tone: 'danger' | 'warning' | 'success'; text: string };
  needs: StockNeed[];
  minimumStock: number;
  overuseNote: string | null;
};

export type StockReceipt = {
  kind: 'RECEIPT';
  materialId: string;
  quantity: number;
  unitPrice: number | null;
  date: string;
};

export type StockRecountEntry = {
  kind: 'STOCKTAKE';
  materialId: string;
  countedQuantity: number;
  date: string;
};

// One entry of «Последнее». A recount carries the counted amount, a
// write-off a negative one.
export type StockMovementLine = {
  id: string;
  kind: 'RECEIPT' | 'STOCKTAKE' | 'WRITE_OFF';
  quantity: number;
  date: string | null;
  orderName: string | null;
};

const QUANTITY_DECIMALS = 2;
const OVERUSE_NOTE_FROM_PERCENT = 5;
const STATE_ORDER = { BUY: 0, LOW: 1, OK: 2 } as const;

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

export const buildReceipt = ({
  materialId,
  quantity,
  unitPrice,
  today,
}: {
  materialId: string;
  quantity: string;
  unitPrice: string;
  today: string;
}): { ok: true; data: StockReceipt } | { ok: false; error: string } => {
  const parsedQuantity = parsePositiveNumber(quantity);
  // Checked after rounding: «0,001» is above zero as typed and nothing as stored.
  const roundedQuantity = parsedQuantity.ok
    ? roundTo(parsedQuantity.value, QUANTITY_DECIMALS)
    : 0;
  const parsedPrice = parseOptionalMoney(unitPrice);

  if (roundedQuantity <= 0) {
    return { ok: false, error: 'Введите, сколько купили: число больше нуля' };
  }

  if (!parsedPrice.ok) return { ok: false, error: parsedPrice.error };

  return {
    ok: true,
    data: {
      kind: 'RECEIPT',
      materialId,
      quantity: roundedQuantity,
      unitPrice: parsedPrice.value,
      date: today,
    },
  };
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
    const trimmed = raw.trim();

    if (trimmed === '') continue;

    const countedQuantity = PLAIN_DECIMAL.test(trimmed)
      ? parseDecimalInput(trimmed)
      : null;

    if (countedQuantity === null) {
      errors[materialId] = 'Введите число, ноль или больше';
    } else {
      data.push({
        kind: 'STOCKTAKE',
        materialId,
        countedQuantity: roundTo(countedQuantity, QUANTITY_DECIMALS),
        date: today,
      });
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
): { ok: true; value: number } | { ok: false; error: string } => {
  const trimmed = raw.trim();

  if (trimmed === '') return { ok: true, value: 0 };

  const value = PLAIN_DECIMAL.test(trimmed) ? parseDecimalInput(trimmed) : null;

  return value === null
    ? { ok: false, error: 'Введите число, ноль или больше' }
    : { ok: true, value: roundTo(value, QUANTITY_DECIMALS) };
};

export const movementText = (
  movement: StockMovementLine,
  unitLabel: string,
): string =>
  [
    ...(movement.date === null ? [] : [formatDayMonth(movement.date)]),
    movement.kind === 'RECEIPT'
      ? 'купил'
      : movement.kind === 'STOCKTAKE'
        ? 'пересчёт'
        : `ушло на ${movement.orderName ?? 'заказ'}`,
    formatQuantity(Math.abs(movement.quantity), unitLabel),
  ].join(' ');
