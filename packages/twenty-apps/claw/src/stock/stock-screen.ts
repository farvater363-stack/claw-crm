import { parseDecimalInput } from 'src/measurer-form/measurer-form';
import { parseOptionalMoney } from 'src/prices/prices-screen';
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
  onHandText: string;
  reservedText: string;
  pill: { tone: 'danger' | 'warning' | 'success'; text: string };
  needs: StockNeed[];
  minimumStock: number;
  overuseNote: string | null;
};

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
}):
  | {
      ok: true;
      data: {
        kind: 'RECEIPT';
        materialId: string;
        quantity: number;
        unitPrice: number | null;
        date: string;
      };
    }
  | { ok: false; error: string } => {
  const parsedQuantity = parseDecimalInput(quantity);
  const parsedPrice = parseOptionalMoney(unitPrice);

  if (parsedQuantity === null || parsedQuantity <= 0) {
    return { ok: false, error: 'Введите, сколько купили: число больше нуля' };
  }

  if (!parsedPrice.ok) return { ok: false, error: parsedPrice.error };

  return {
    ok: true,
    data: {
      kind: 'RECEIPT',
      materialId,
      quantity: parsedQuantity,
      unitPrice: parsedPrice.value,
      date: today,
    },
  };
};

export const buildRecount = (
  typed: Record<string, string>,
  today: string,
):
  | {
      ok: true;
      data: {
        kind: 'STOCKTAKE';
        materialId: string;
        countedQuantity: number;
        date: string;
      }[];
    }
  | { ok: false; errors: Record<string, string> } => {
  const errors: Record<string, string> = {};
  const data: {
    kind: 'STOCKTAKE';
    materialId: string;
    countedQuantity: number;
    date: string;
  }[] = [];

  for (const [materialId, raw] of Object.entries(typed)) {
    if (raw.trim() === '') continue;

    const countedQuantity = parseDecimalInput(raw);

    if (countedQuantity === null || countedQuantity < 0) {
      errors[materialId] = 'Введите число, ноль или больше';
    } else {
      data.push({
        kind: 'STOCKTAKE',
        materialId,
        countedQuantity,
        date: today,
      });
    }
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, data };
};
