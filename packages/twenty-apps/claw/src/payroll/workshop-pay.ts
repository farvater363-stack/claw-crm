import { roundTo } from 'src/pricing/round';

export type WorkshopRate = {
  id: string;
  grilleKindId: string | null;
  designId: string | null;
  workerId: string | null;
  rate: number;
};

export type WorkshopDesign = {
  id: string;
  name: string;
  grilleKindId: string | null;
};

export type WorkshopKind = { id: string; name: string };

export type WorkshopCatalog = {
  rates: WorkshopRate[];
  designs: WorkshopDesign[];
  kinds: WorkshopKind[];
};

export type WorkshopItem = {
  designId: string | null;
  areaSquareMeters: number | null;
  quantity: number | null;
};

// What a master is paid per m² on one order, one line per row of the table.
export type SquareMeterPart = {
  part: string;
  label: string;
  basis: number;
  rate: number;
};

// The rates already written on the order's lines. A line written before the
// table existed has no part: such an order keeps being paid the old way.
export type KeptSquareMeterRates = {
  legacyRate: number | null;
  byPart: Map<string, number>;
};

export const NO_KEPT_RATES: KeptSquareMeterRates = {
  legacyRate: null,
  byPart: new Map(),
};

export const EMPTY_WORKSHOP_CATALOG: WorkshopCatalog = {
  rates: [],
  designs: [],
  kinds: [],
};

export const NO_KIND_PART = 'none';
export const RULE_PART = 'rule';
export const NO_KIND_LABEL = 'Вид не указан';

export const kindPart = (kindId: string) => `kind:${kindId}`;
export const designPart = (designId: string) => `design:${designId}`;

// The row of the table a rate record sits in, named as the part of a line it pays.
export const rowKeyOf = (
  record: Pick<WorkshopRate, 'designId' | 'grilleKindId'>,
): string =>
  record.designId !== null
    ? designPart(record.designId)
    : record.grilleKindId !== null
      ? kindPart(record.grilleKindId)
      : NO_KIND_PART;

// A rate kept on an installed order counts as the master's own only while it
// still is his cell's rate.
export const isOwnRate = (
  catalog: WorkshopCatalog,
  masterId: string,
  part: string | null,
  paidRate: number,
): boolean =>
  part !== null &&
  catalog.rates.some(
    (rate) =>
      rate.workerId === masterId &&
      rowKeyOf(rate) === part &&
      rate.rate === paidRate,
  );

export type ResolvedRate = { part: string; label: string; rate: number };

const isSpecialRow = (rate: WorkshopRate) => rate.designId !== null;
const isNoKindRow = (rate: WorkshopRate) =>
  rate.designId === null && rate.grilleKindId === null;

// The master's own cell wins over the usual one of the same row.
export const findRowRate = (
  rates: WorkshopRate[],
  isRow: (rate: WorkshopRate) => boolean,
  masterId: string | null,
): number | null =>
  (masterId === null
    ? undefined
    : rates.find((rate) => isRow(rate) && rate.workerId === masterId)
  )?.rate ??
  rates.find((rate) => isRow(rate) && rate.workerId === null)?.rate ??
  null;

// A special grille first, then its kind, then «Вид не указан», then the
// master's own rule per m² from before the table.
export const resolveWorkshopRate = ({
  catalog,
  designId,
  masterId,
  ruleRate,
}: {
  catalog: WorkshopCatalog;
  designId: string | null;
  masterId: string;
  ruleRate: number | null;
}): ResolvedRate | null => {
  const design = catalog.designs.find((entry) => entry.id === designId);
  const kind = catalog.kinds.find((entry) => entry.id === design?.grilleKindId);

  if (design !== undefined) {
    const rate = findRowRate(
      catalog.rates,
      (row) => isSpecialRow(row) && row.designId === design.id,
      masterId,
    );

    if (rate !== null) {
      return { part: designPart(design.id), label: `«${design.name}»`, rate };
    }
  }

  if (kind !== undefined) {
    const rate = findRowRate(
      catalog.rates,
      (row) => !isSpecialRow(row) && row.grilleKindId === kind.id,
      masterId,
    );

    if (rate !== null) return { part: kindPart(kind.id), label: kind.name, rate };
  }

  const noKindRate = findRowRate(catalog.rates, isNoKindRow, masterId);

  if (noKindRate !== null) {
    return { part: NO_KIND_PART, label: NO_KIND_LABEL, rate: noKindRate };
  }

  return ruleRate === null ? null : { part: RULE_PART, label: '', rate: ruleRate };
};

// Pay per m² cannot be counted without the order's area, so null stands for
// "unknown": the order then shows no pay and the master gets no line.
export const planSquareMeterParts = ({
  catalog,
  masterId,
  items,
  orderAreaSquareMeters,
  ruleRate,
  kept,
}: {
  catalog: WorkshopCatalog;
  masterId: string;
  items: WorkshopItem[];
  orderAreaSquareMeters: number | null;
  ruleRate: number | null;
  kept: KeptSquareMeterRates;
}): SquareMeterPart[] | null => {
  if (kept.legacyRate !== null) {
    return orderAreaSquareMeters === null
      ? null
      : [
          {
            part: '',
            label: '',
            basis: orderAreaSquareMeters,
            rate: kept.legacyRate,
          },
        ];
  }

  // An order saved before it had lines has only its stored area.
  if (items.length === 0) {
    const rate = kept.byPart.get(RULE_PART) ?? ruleRate;

    if (rate === null) return [];
    if (orderAreaSquareMeters === null) return null;

    return [
      { part: RULE_PART, label: '', basis: orderAreaSquareMeters, rate },
    ];
  }

  const parts = new Map<string, SquareMeterPart>();

  for (const item of items) {
    const resolved = resolveWorkshopRate({
      catalog,
      designId: item.designId,
      masterId,
      ruleRate,
    });

    // A проём with no size yet adds no area, as it adds none to the order's.
    if (resolved === null || item.areaSquareMeters === null) continue;

    const area = item.areaSquareMeters * (item.quantity ?? 1);
    const known = parts.get(resolved.part);

    parts.set(resolved.part, {
      part: resolved.part,
      label: resolved.label,
      basis: (known?.basis ?? 0) + area,
      rate: kept.byPart.get(resolved.part) ?? resolved.rate,
    });
  }

  return [...parts.values()].map((part) => ({
    ...part,
    basis: roundTo(part.basis, 2),
  }));
};

// Each part is rounded by itself, as each accrual line is.
export const squareMeterPartsPay = (parts: SquareMeterPart[]): number =>
  parts.reduce((sum, { basis, rate }) => {
    const amount = Math.round(basis * rate);

    // A NaN never equals itself, so the recalc would rewrite the pay on every run.
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

export const keptSquareMeterRates = (
  lines: {
    workerId?: string | null;
    work?: string | null;
    method?: string | null;
    rate?: number | null;
    part?: string | null;
  }[],
  masterId: string,
): KeptSquareMeterRates => {
  const own = lines.filter(
    (line) =>
      line.workerId === masterId &&
      line.work === 'MASTER' &&
      line.method === 'PER_SQUARE_METER',
  );
  const legacy = own.find((line) => !line.part);

  return {
    legacyRate: legacy === undefined ? null : (legacy.rate ?? 0),
    byPart: new Map(
      own.flatMap((line) => (line.part ? [[line.part, line.rate ?? 0]] : [])),
    ),
  };
};

export type ItemPayRow = {
  id: string;
  designName: string | null;
  // «Кованая», «Кованая, особая решётка», «Вид не указан»
  rowLabel: string;
  areaSquareMeters: number | null;
  rate: number | null;
  amount: number | null;
  isOwn: boolean;
};

// The order page shows each проём: its area at the rate its row pays this
// master, the rate kept on the order's line when there is one.
export const planItemPayRows = ({
  catalog,
  masterId,
  items,
  ruleRate,
  kept,
}: {
  catalog: WorkshopCatalog;
  masterId: string;
  items: (WorkshopItem & { id: string })[];
  ruleRate: number | null;
  kept: KeptSquareMeterRates;
}): ItemPayRow[] =>
  items.map((item) => {
    const design = catalog.designs.find((entry) => entry.id === item.designId);
    const kind = catalog.kinds.find((entry) => entry.id === design?.grilleKindId);
    const resolved = resolveWorkshopRate({
      catalog,
      designId: item.designId,
      masterId,
      ruleRate,
    });
    const rate =
      kept.legacyRate ??
      (resolved === null ? null : (kept.byPart.get(resolved.part) ?? resolved.rate));
    const area =
      item.areaSquareMeters === null
        ? null
        : roundTo(item.areaSquareMeters * (item.quantity ?? 1), 2);
    const isSpecial = resolved?.part.startsWith('design:') ?? false;

    return {
      id: item.id,
      designName: design?.name ?? null,
      rowLabel:
        kept.legacyRate !== null || resolved?.part === RULE_PART
          ? 'старая ставка мастера'
          : [kind?.name ?? NO_KIND_LABEL, isSpecial ? 'особая решётка' : null]
              .filter(Boolean)
              .join(', '),
      areaSquareMeters: area,
      rate,
      amount: area === null || rate === null ? null : Math.round(area * rate),
      isOwn:
        kept.legacyRate === null &&
        resolved !== null &&
        rate !== null &&
        isOwnRate(catalog, masterId, resolved.part, rate),
    };
  });
