import { parseDecimalInput } from 'src/measurer-form/measurer-form';
import {
  designPart,
  type WorkshopCatalog,
  type WorkshopRate,
} from 'src/payroll/workshop-pay';
import { PLAIN_DECIMAL } from 'src/prices/prices-screen';

export type RateCell = {
  // The record behind the cell; none for a master's cell that follows the usual rate
  record: WorkshopRate | null;
  // What is paid: the master's own rate, or else the usual one
  rate: number | null;
  isOwn: boolean;
};

export type RateRow = {
  key: string;
  label: string;
  note: string | null;
  grilleKindId: string | null;
  designId: string | null;
  usual: RateCell;
  byMaster: Record<string, RateCell>;
};

export type RateMaster = { id: string; name: string };

const byName = (left: { name: string }, right: { name: string }) =>
  left.name.localeCompare(right.name, 'ru', { numeric: true });

const UNNAMED = 'Без названия';

const rowOf = ({
  key,
  label,
  note,
  grilleKindId,
  designId,
  records,
  masters,
}: Omit<RateRow, 'usual' | 'byMaster'> & {
  records: WorkshopRate[];
  masters: RateMaster[];
}): RateRow => {
  const usualRecord = records.find((record) => record.workerId === null) ?? null;
  const usualRate = usualRecord?.rate ?? null;

  return {
    key,
    label,
    note,
    grilleKindId,
    designId,
    usual: { record: usualRecord, rate: usualRate, isOwn: false },
    byMaster: Object.fromEntries(
      masters.map((master) => {
        const own = records.find((record) => record.workerId === master.id);

        return [
          master.id,
          own === undefined
            ? { record: null, rate: usualRate, isOwn: false }
            : { record: own, rate: own.rate, isOwn: true },
        ];
      }),
    ),
  };
};

// One row per grille of «Цены», by name: a rate is set on the grille itself.
export const buildRateRows = (
  catalog: WorkshopCatalog,
  masters: RateMaster[],
): RateRow[] =>
  catalog.designs
    .map((design) => ({ ...design, name: design.name || UNNAMED }))
    .sort(byName)
    .map((design) =>
      rowOf({
        key: designPart(design.id),
        label: design.name,
        note: null,
        grilleKindId: null,
        designId: design.id,
        records: catalog.rates.filter((rate) => rate.designId === design.id),
        masters,
      }),
    );

export const ownRatesCount = (rows: RateRow[]): number =>
  rows.reduce(
    (sum, row) => sum + Object.values(row.byMaster).filter((cell) => cell.isOwn).length,
    0,
  );

// A grille some master would be paid nothing for: no usual rate, and not every master has his own.
export const hasUnpaidCell = (row: RateRow): boolean =>
  row.usual.rate === null &&
  (Object.keys(row.byMaster).length === 0 ||
    Object.values(row.byMaster).some((cell) => cell.rate === null));

// Rates set before a rate was put on the grille itself: by kind, or for
// «Вид не указан». They still pay a grille that has no row rate of its own, so
// the screen names them until they are removed.
export const legacyKindRates = (catalog: WorkshopCatalog): WorkshopRate[] =>
  catalog.rates.filter((rate) => rate.designId === null);

export const USUAL_COLUMN = 'usual';

// One cell to write: the record it already has, or none for a new one.
export type CellWrite = {
  row: RateRow;
  workerId: string | null;
  recordId: string | null;
  rate: number;
};

const cellOf = (row: RateRow, workerId: string | null): RateCell | undefined =>
  workerId === null ? row.usual : row.byMaster[workerId];

// One rate for a whole column of the chosen grilles. A cell that already holds
// it as its own is left alone.
export const planBulkRate = (
  rows: RateRow[],
  column: string,
  rate: number,
): CellWrite[] => {
  const workerId = column === USUAL_COLUMN ? null : column;

  return rows.flatMap((row) => {
    const record = cellOf(row, workerId)?.record ?? null;

    return record !== null && record.rate === rate
      ? []
      : [{ row, workerId, recordId: record?.id ?? null, rate }];
  });
};

// Makes one master's column the same as another's: his own rates are copied,
// and where he follows the usual rate the other one follows it too.
export const planCopyColumn = (
  rows: RateRow[],
  fromMasterId: string,
  toMasterId: string,
): { writes: CellWrite[]; removeIds: string[] } => {
  const writes: CellWrite[] = [];
  const removeIds: string[] = [];

  for (const row of rows) {
    const source = row.byMaster[fromMasterId];
    const target = row.byMaster[toMasterId];

    if (source === undefined || target === undefined) continue;

    if (source.isOwn && source.rate !== null) {
      if (!target.isOwn || target.rate !== source.rate) {
        writes.push({
          row,
          workerId: toMasterId,
          recordId: target.record?.id ?? null,
          rate: source.rate,
        });
      }
    } else if (target.record !== null) {
      removeIds.push(target.record.id);
    }
  }

  return { writes, removeIds };
};

export const planRaise = (
  rows: RateRow[],
  percent: number,
  raiseOwn: boolean,
): CellWrite[] =>
  rows.flatMap((row) =>
    [row.usual, ...(raiseOwn ? Object.values(row.byMaster) : [])].flatMap(
      ({ record }) =>
        record === null
          ? []
          : [
              {
                row,
                workerId: record.workerId,
                recordId: record.id,
                rate: raisedRate(record.rate, percent),
              },
            ],
    ),
  );

export const parseRaisePercent = (
  raw: string,
): { ok: true; value: number } | { ok: false; error: string } => {
  const trimmed = raw.replace('%', '').trim();
  const value = PLAIN_DECIMAL.test(trimmed) ? parseDecimalInput(trimmed) : null;

  return value !== null && value > 0 && value <= 100
    ? { ok: true, value }
    : { ok: false, error: 'Введите процент от 1 до 100' };
};

// To whole hundreds of сум, as rates are agreed.
export const raisedRate = (rate: number, percent: number): number =>
  Math.round((rate * (1 + percent / 100)) / 100) * 100;

export const rateRecordName = (row: Pick<RateRow, 'label'>, masterName: string | null): string =>
  `${row.label} · ${masterName ?? 'обычная'}`;
