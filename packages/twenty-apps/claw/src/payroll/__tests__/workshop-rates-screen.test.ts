import { describe, expect, it } from 'vitest';

import { type WorkshopCatalog } from 'src/payroll/workshop-pay';
import {
  buildRateRows,
  listFixes,
  ownRatesCount,
  parseRaisePercent,
  raisedRate,
} from 'src/payroll/workshop-rates-screen';

const CATALOG: WorkshopCatalog = {
  kinds: [
    { id: 'welded', name: 'Сварная' },
    { id: 'forged', name: 'Кованая' },
    { id: 'cast', name: 'Литая' },
  ],
  designs: [
    { id: 'sun', name: 'Солнце', grilleKindId: 'forged' },
    { id: 'vine', name: 'Лоза', grilleKindId: 'forged' },
    { id: 'loose', name: 'Волна', grilleKindId: null },
  ],
  rates: [
    { id: 'r1', grilleKindId: 'forged', designId: null, workerId: null, rate: 50_000 },
    { id: 'r2', grilleKindId: 'forged', designId: null, workerId: 'master-2', rate: 55_000 },
    { id: 'r3', grilleKindId: 'welded', designId: null, workerId: null, rate: 30_000 },
    { id: 'r4', grilleKindId: null, designId: 'sun', workerId: null, rate: 80_000 },
  ],
};
const MASTERS = [
  { id: 'master-1', name: 'Мастер 1' },
  { id: 'master-2', name: 'Мастер 2' },
];

describe('buildRateRows', () => {
  const rows = buildRateRows(CATALOG, MASTERS);

  it('lists the kinds by name, each followed by its special grilles, «Вид не указан» last', () => {
    expect(rows.map((row) => row.label)).toEqual([
      'Кованая',
      '«Солнце»',
      'Литая',
      'Сварная',
      'Вид не указан',
    ]);
    expect(rows[1].note).toBe('особая решётка, Кованая');
  });

  it("fills a master's cell with the usual rate unless he has his own", () => {
    expect(rows[0].usual.rate).toBe(50_000);
    expect(rows[0].byMaster['master-1']).toEqual({ record: null, rate: 50_000, isOwn: false });
    expect(rows[0].byMaster['master-2']).toMatchObject({ rate: 55_000, isOwn: true });
    expect(ownRatesCount(rows)).toBe(1);
  });
});

describe('listFixes', () => {
  it('names the kinds with no usual rate and the grilles with no kind', () => {
    expect(listFixes(CATALOG, buildRateRows(CATALOG, MASTERS))).toEqual([
      {
        kind: 'rate',
        rowKey: 'kind:cast',
        name: 'Литая',
        text: 'у вида нет обычной ставки, его решётки: ставки нет, платится по старой ставке мастера за м²',
      },
      {
        kind: 'design',
        designId: 'loose',
        name: '«Волна»',
        text: 'нет вида решётки, ставки нет, платится по старой ставке мастера за м²',
      },
    ]);
  });
});

describe('raising every rate', () => {
  it('takes a percent from 1 to 100', () => {
    expect(parseRaisePercent('10%')).toEqual({ ok: true, value: 10 });
    expect(parseRaisePercent('7,5')).toEqual({ ok: true, value: 7.5 });
    expect(parseRaisePercent('0').ok).toBe(false);
    expect(parseRaisePercent('много').ok).toBe(false);
  });

  it('rounds the new rate to whole hundreds', () => {
    expect(raisedRate(55_000, 7.5)).toBe(59_100);
    expect(raisedRate(30_000, 10)).toBe(33_000);
  });
});
