import { describe, expect, it } from 'vitest';

import {
  keptSquareMeterRates,
  NO_KEPT_RATES,
  planItemPayRows,
  planSquareMeterParts,
  resolveWorkshopRate,
  type WorkshopCatalog,
  type WorkshopRate,
} from 'src/payroll/workshop-pay';

const rate = (overrides: Partial<WorkshopRate>): WorkshopRate => ({
  id: `rate-${Math.random()}`,
  grilleKindId: null,
  designId: null,
  workerId: null,
  rate: 0,
  ...overrides,
});

const CATALOG: WorkshopCatalog = {
  kinds: [
    { id: 'forged', name: 'Кованая' },
    { id: 'welded', name: 'Сварная' },
  ],
  designs: [
    { id: 'vine', name: 'Лоза', grilleKindId: 'forged' },
    { id: 'romb', name: 'Ромб', grilleKindId: 'welded' },
    { id: 'sun', name: 'Солнце', grilleKindId: 'forged' },
    { id: 'loose', name: 'Без вида', grilleKindId: null },
  ],
  rates: [
    rate({ grilleKindId: 'forged', rate: 50_000 }),
    rate({ grilleKindId: 'forged', workerId: 'master-2', rate: 55_000 }),
    rate({ grilleKindId: 'welded', rate: 30_000 }),
    rate({ designId: 'sun', rate: 80_000 }),
    rate({ rate: 25_000 }),
  ],
};

describe('resolveWorkshopRate', () => {
  const resolve = (designId: string | null, masterId = 'master-1') =>
    resolveWorkshopRate({ catalog: CATALOG, designId, masterId, ruleRate: 20_000 });

  it('pays a grille by its kind, a master by his own cell first', () => {
    expect(resolve('vine')).toEqual({ part: 'kind:forged', label: 'Кованая', rate: 50_000 });
    expect(resolve('vine', 'master-2')?.rate).toBe(55_000);
  });

  it('pays a special grille by its own row, whatever its kind', () => {
    expect(resolve('sun', 'master-2')).toEqual({
      part: 'design:sun',
      label: '«Солнце»',
      rate: 80_000,
    });
  });

  it('pays a grille with no kind by «Вид не указан»', () => {
    expect(resolve('loose')).toEqual({ part: 'none', label: 'Вид не указан', rate: 25_000 });
    expect(resolve(null)?.part).toBe('none');
  });

  it("falls back to the master's old rule when the table has nothing", () => {
    expect(
      resolveWorkshopRate({
        catalog: { ...CATALOG, rates: [] },
        designId: 'vine',
        masterId: 'master-1',
        ruleRate: 20_000,
      }),
    ).toEqual({ part: 'rule', label: '', rate: 20_000 });
  });
});

describe('planSquareMeterParts', () => {
  const items = [
    { designId: 'vine', areaSquareMeters: 2.1, quantity: 1 },
    { designId: 'vine', areaSquareMeters: 1, quantity: 2 },
    { designId: 'romb', areaSquareMeters: 3, quantity: 1 },
    { designId: 'romb', areaSquareMeters: null, quantity: 1 },
  ];

  it('adds up the area of each row, a проём with no size adding none', () => {
    expect(
      planSquareMeterParts({
        catalog: CATALOG,
        masterId: 'master-1',
        items,
        orderAreaSquareMeters: 7.1,
        ruleRate: null,
        kept: NO_KEPT_RATES,
      }),
    ).toEqual([
      { part: 'kind:forged', label: 'Кованая', basis: 4.1, rate: 50_000 },
      { part: 'kind:welded', label: 'Сварная', basis: 3, rate: 30_000 },
    ]);
  });

  it('keeps the rate an installed order was paid at', () => {
    const kept = keptSquareMeterRates(
      [{ workerId: 'master-1', work: 'MASTER', method: 'PER_SQUARE_METER', rate: 45_000, part: 'kind:forged' }],
      'master-1',
    );

    expect(
      planSquareMeterParts({
        catalog: CATALOG,
        masterId: 'master-1',
        items,
        orderAreaSquareMeters: 7.1,
        ruleRate: null,
        kept,
      })?.map((part) => part.rate),
    ).toEqual([45_000, 30_000]);
  });

  it('keeps an order paid before the table on its one old line', () => {
    const kept = keptSquareMeterRates(
      [{ workerId: 'master-1', work: 'MASTER', method: 'PER_SQUARE_METER', rate: 40_000, part: null }],
      'master-1',
    );

    expect(
      planSquareMeterParts({
        catalog: CATALOG,
        masterId: 'master-1',
        items,
        orderAreaSquareMeters: 7.1,
        ruleRate: null,
        kept,
      }),
    ).toEqual([{ part: '', label: '', basis: 7.1, rate: 40_000 }]);
  });
});

describe('planItemPayRows', () => {
  it('shows each проём with its row, rate and sum', () => {
    expect(
      planItemPayRows({
        catalog: CATALOG,
        masterId: 'master-2',
        items: [
          { id: 'item-1', designId: 'vine', areaSquareMeters: 2.1, quantity: 1 },
          { id: 'item-2', designId: 'sun', areaSquareMeters: 1.5, quantity: 2 },
        ],
        ruleRate: null,
        kept: NO_KEPT_RATES,
      }),
    ).toEqual([
      {
        id: 'item-1',
        designName: 'Лоза',
        rowLabel: 'Кованая',
        areaSquareMeters: 2.1,
        rate: 55_000,
        amount: 115_500,
        isOwn: true,
      },
      {
        id: 'item-2',
        designName: 'Солнце',
        rowLabel: 'Кованая, особая решётка',
        areaSquareMeters: 3,
        rate: 80_000,
        amount: 240_000,
        isOwn: false,
      },
    ]);
  });

  it("drops «своя» from a kept rate that is no longer the master's own", () => {
    const kept = keptSquareMeterRates(
      [{ workerId: 'master-2', work: 'MASTER', method: 'PER_SQUARE_METER', rate: 52_000, part: 'kind:forged' }],
      'master-2',
    );
    const [row] = planItemPayRows({
      catalog: CATALOG,
      masterId: 'master-2',
      items: [{ id: 'item-1', designId: 'vine', areaSquareMeters: 2, quantity: 1 }],
      ruleRate: null,
      kept,
    });

    expect(row).toMatchObject({ rate: 52_000, amount: 104_000, isOwn: false });
  });
});
