import { parseDecimalInput } from 'src/measurer-form/measurer-form';
import {
  designPart,
  kindPart,
  NO_KIND_LABEL,
  NO_KIND_PART,
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

// The kinds by name, each followed by its special grilles, then the special
// grilles with no kind, then «Вид не указан» last, as in the mockup.
export const buildRateRows = (
  catalog: WorkshopCatalog,
  masters: RateMaster[],
): RateRow[] => {
  const specialIds = new Set(
    catalog.rates.flatMap((rate) => (rate.designId === null ? [] : [rate.designId])),
  );
  const specials = catalog.designs
    .filter((design) => specialIds.has(design.id))
    .map((design) => ({ ...design, name: design.name || UNNAMED }))
    .sort(byName);
  const kinds = catalog.kinds
    .map((kind) => ({ ...kind, name: kind.name || UNNAMED }))
    .sort(byName);
  const kindIds = new Set(kinds.map((kind) => kind.id));

  const specialRow = (design: (typeof specials)[number]) =>
    rowOf({
      key: designPart(design.id),
      label: `«${design.name}»`,
      note: `особая решётка${
        design.grilleKindId !== null && kindIds.has(design.grilleKindId)
          ? `, ${kinds.find((kind) => kind.id === design.grilleKindId)?.name}`
          : ''
      }`,
      grilleKindId: null,
      designId: design.id,
      records: catalog.rates.filter((rate) => rate.designId === design.id),
      masters,
    });

  return [
    ...kinds.flatMap((kind) => [
      rowOf({
        key: kindPart(kind.id),
        label: kind.name,
        note: null,
        grilleKindId: kind.id,
        designId: null,
        records: catalog.rates.filter(
          (rate) => rate.designId === null && rate.grilleKindId === kind.id,
        ),
        masters,
      }),
      ...specials
        .filter((design) => design.grilleKindId === kind.id)
        .map(specialRow),
    ]),
    ...specials
      .filter(
        (design) => design.grilleKindId === null || !kindIds.has(design.grilleKindId),
      )
      .map(specialRow),
    rowOf({
      key: NO_KIND_PART,
      label: NO_KIND_LABEL,
      note: 'для решёток без вида',
      grilleKindId: null,
      designId: null,
      records: catalog.rates.filter(
        (rate) => rate.designId === null && rate.grilleKindId === null,
      ),
      masters,
    }),
  ];
};

export const ownRatesCount = (rows: RateRow[]): number =>
  rows.reduce(
    (sum, row) => sum + Object.values(row.byMaster).filter((cell) => cell.isOwn).length,
    0,
  );

export type FixItem =
  | { kind: 'design'; designId: string; name: string; text: string }
  | { kind: 'rate'; rowKey: string; name: string; text: string };

// What makes a grille paid by a fallback row: no kind, or a kind with no usual rate.
export const listFixes = (
  catalog: WorkshopCatalog,
  rows: RateRow[],
): FixItem[] => {
  const specialIds = new Set(
    catalog.rates.flatMap((rate) => (rate.designId === null ? [] : [rate.designId])),
  );
  const kindIds = new Set(catalog.kinds.map((kind) => kind.id));
  const noKindRate = rows.find((row) => row.key === NO_KIND_PART)?.usual.rate ?? null;
  const fallback =
    noKindRate === null
      ? 'ставки нет, платится по старой ставке мастера за м²'
      : 'платится по строке «Вид не указан»';

  return [
    ...rows
      .filter((row) => row.grilleKindId !== null && row.usual.rate === null)
      .map((row): FixItem => ({
        kind: 'rate',
        rowKey: row.key,
        name: row.label,
        text: `у вида нет обычной ставки, его решётки: ${fallback}`,
      })),
    ...catalog.designs
      .filter(
        (design) =>
          !specialIds.has(design.id) &&
          (design.grilleKindId === null || !kindIds.has(design.grilleKindId)),
      )
      .sort(byName)
      .map((design): FixItem => ({
        kind: 'design',
        designId: design.id,
        name: `«${design.name || UNNAMED}»`,
        text: `нет вида решётки, ${fallback}`,
      })),
  ];
};

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
