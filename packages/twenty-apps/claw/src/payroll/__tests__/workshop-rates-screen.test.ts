import { describe, expect, it } from 'vitest';

import { type WorkshopCatalog } from 'src/payroll/workshop-pay';
import {
  buildRateRows,
  hasUnpaidCell,
  legacyKindRates,
  ownRatesCount,
  parseRaisePercent,
  planBulkRate,
  planCopyColumn,
  planRaise,
  raisedRate,
  USUAL_COLUMN,
} from 'src/payroll/workshop-rates-screen';

const masters = [
  { id: 'avaz', name: 'Авазбек' },
  { id: 'mirza', name: 'Мирзарахмон' },
];

const catalog: WorkshopCatalog = {
  kinds: [{ id: 'rod', name: 'Прут' }],
  designs: [
    { id: 'm5', name: 'М-05', grilleKindId: 'rod' },
    { id: 'm3', name: 'М-03', grilleKindId: null },
    { id: 'm10', name: 'М-10', grilleKindId: null },
  ],
  rates: [
    { id: 'r1', grilleKindId: null, designId: 'm3', workerId: null, rate: 30_000 },
    { id: 'r2', grilleKindId: null, designId: 'm3', workerId: 'avaz', rate: 35_000 },
    { id: 'r3', grilleKindId: null, designId: 'm5', workerId: 'mirza', rate: 40_000 },
    { id: 'old', grilleKindId: 'rod', designId: null, workerId: null, rate: 25_000 },
  ],
};

const rows = buildRateRows(catalog, masters);
const rates = (row: (typeof rows)[number]) => [
  row.usual.rate,
  row.byMaster.avaz.rate,
  row.byMaster.mirza.rate,
];

describe('buildRateRows', () => {
  it('has one row per grille, by name, whether it has a rate or not', () => {
    expect(rows.map((row) => row.label)).toEqual(['М-03', 'М-05', 'М-10']);
    expect(rows.every((row) => row.designId !== null)).toBe(true);
  });

  it('fills a master\'s cell with the usual rate unless he has his own', () => {
    expect(rates(rows[0])).toEqual([30_000, 35_000, 30_000]);
    expect(rows[0].byMaster.avaz.isOwn).toBe(true);
    expect(rows[0].byMaster.mirza.isOwn).toBe(false);
    expect(ownRatesCount(rows)).toBe(2);
  });

  it('marks a grille some master would be paid nothing for', () => {
    expect(rows.map(hasUnpaidCell)).toEqual([false, true, true]);
  });

  it('names the rates left from when they went by kind', () => {
    expect(legacyKindRates(catalog).map((rate) => rate.id)).toEqual(['old']);
  });
});

describe('setting rates in bulk', () => {
  it('puts one usual rate on every chosen grille, skipping one that already has it', () => {
    const writes = planBulkRate(rows, USUAL_COLUMN, 30_000);

    expect(
      writes.map(({ row, workerId, recordId, rate }) => [row.label, workerId, recordId, rate]),
    ).toEqual([
      ['М-05', null, null, 30_000],
      ['М-10', null, null, 30_000],
    ]);
  });

  it('gives one master his own rate on every chosen grille, over the record he has', () => {
    const writes = planBulkRate(rows.slice(0, 2), 'avaz', 45_000);

    expect(writes.map(({ row, recordId, workerId }) => [row.label, recordId, workerId])).toEqual([
      ['М-03', 'r2', 'avaz'],
      ['М-05', null, 'avaz'],
    ]);
  });

  it('copies a master\'s column: his own rates over, and the usual rate where he follows it', () => {
    const plan = planCopyColumn(rows, 'avaz', 'mirza');

    // Авазбек has his own on М-03 only; on М-05 he follows the usual, so Мирзарахмон's own goes.
    expect(plan.writes.map(({ row, workerId, rate }) => [row.label, workerId, rate])).toEqual([
      ['М-03', 'mirza', 35_000],
    ]);
    expect(plan.removeIds).toEqual(['r3']);
  });

  it('raises the chosen rows, the masters\' own rates only when asked', () => {
    expect(planRaise(rows, 10, false).map(({ recordId, rate }) => [recordId, rate])).toEqual([
      ['r1', 33_000],
    ]);
    expect(planRaise(rows, 10, true).map(({ recordId, rate }) => [recordId, rate])).toEqual([
      ['r1', 33_000],
      ['r2', 38_500],
      ['r3', 44_000],
    ]);
  });
});

describe('raising', () => {
  it('reads a percent from 1 to 100 and rounds a raised rate to hundreds', () => {
    expect(parseRaisePercent('10 %')).toEqual({ ok: true, value: 10 });
    expect(parseRaisePercent('0').ok).toBe(false);
    expect(raisedRate(33_333, 10)).toBe(36_700);
  });
});
