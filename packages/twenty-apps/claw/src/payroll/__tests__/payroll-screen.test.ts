import { describe, expect, it } from 'vitest';

import { type PayMethod, type WorkerCategory } from 'src/constants/select-options';
import { type PayRule, type PayWork } from 'src/payroll/pay-rules';
import { type PayrollRow } from 'src/payroll/compute-monthly-payroll';
import {
  buildPayRule,
  buildStatement,
  owedLine,
  payrollTotals,
  signedWhole,
  totalsSentence,
  buildWorker,
  canPayInMonth,
  carrySentence,
  earnedHeading,
  listMonthOrders,
  parsePenaltyPercent,
  payRuleLabel,
  payRuleSuffix,
  payRuleValue,
  payRuleValueLabel,
  paymentText,
  payWorksOf,
  rowTitle,
  skippedNote,
  storedAttempts,
  summarizeEarned,
  withCategory,
} from 'src/payroll/payroll-screen';
import { type AccrualLine } from 'src/payroll/plan-order-accruals';

// toLocaleString groups thousands with a no-break space
const plain = (value: string) => value.replace(/\s/g, ' ');

const line = (overrides: Partial<AccrualLine> = {}): AccrualLine => ({
  id: 'line',
  workerId: 'worker-3',
  orderId: 'order-1031',
  earnedOn: '2026-10-10',
  method: 'PER_SQUARE_METER',
  work: 'MASTER',
  basis: 12.4,
  rate: 25_000,
  amount: 310_000,
  name: '№1031 · Мастер · 12,4 м² × 25,000',
  ...overrides,
});

const rule = (overrides: Partial<PayRule> = {}): PayRule => ({
  id: 'rule',
  workerId: 'worker-3',
  method: 'PER_SQUARE_METER',
  work: 'MASTER',
  amount: 25_000,
  percent: null,
  ...overrides,
});

describe('pay rule words', () => {
  it('offers for each method only the works it may pay for', () => {
    expect(payWorksOf('FIXED')).toEqual([null]);
    expect(payWorksOf('PER_SQUARE_METER')).toEqual(['MASTER', 'INSTALLER', 'MEASURER']);
    expect(payWorksOf('PER_ORDER')).toEqual(['MASTER', 'INSTALLER', 'MEASURER']);
    expect(payWorksOf('PERCENT_OF_SALES')).toEqual(['SALES']);
    expect(payWorksOf('PER_MEASUREMENT')).toEqual(['MEASURER']);
  });

  it('names a rule on the row, the unit beside its number and the number in its field', () => {
    expect(payRuleLabel(rule())).toBe('Мастер · за м²');
    expect(payRuleLabel(rule({ method: 'FIXED', work: null }))).toBe('Фикса');
    expect(payRuleLabel(rule({ method: 'PERCENT_OF_SALES', work: 'SALES' }))).toBe('Продажник · % от продаж');
    expect(payRuleSuffix('PER_SQUARE_METER')).toBe('сум за м²');
    expect(payRuleSuffix('FIXED')).toBe('сум в месяц');
    expect(payRuleSuffix('PERCENT_OF_SALES')).toBe('% от продаж');
    expect(payRuleValueLabel('PER_ORDER')).toBe('Сумма');
    expect(payRuleValueLabel('PERCENT_OF_SALES')).toBe('Процент');
    expect(payRuleValue(rule())).toBe('25,000');
    expect(payRuleValue(rule({ method: 'PERCENT_OF_SALES', amount: null, percent: 2.5 }))).toBe('2,5');
  });
});

describe('row texts', () => {
  it.each<[string, WorkerCategory[], string]>([
    ['Работник 3', ['MASTER'], 'Работник 3 · Мастер'],
    ['Работник 2', ['INSTALLER', 'SALES'], 'Работник 2 · Установщик, Продажник'],
    ['Работник 3', [], 'Работник 3'],
    ['', ['MASTER'], 'Без имени · Мастер'],
  ])('titles «%s» with %o', (workerName, categories, title) => {
    expect(rowTitle({ workerName, categories })).toBe(title);
  });

  it('ticks and unticks a category, keeping the order of the options', () => {
    expect(withCategory(['SALES'], 'MASTER', true)).toEqual(['MASTER', 'SALES']);
    expect(withCategory(['MASTER', 'SALES'], 'MASTER', false)).toEqual(['SALES']);
  });

  it('words the month, the carry and a payment', () => {
    expect(plain(earnedHeading(1_305_000))).toBe('За месяц начислено 1,305,000');
    expect(plain(carrySentence({ carriedOver: 235_000, paidThisMonth: 300_000 }))).toBe(
      'С прошлого месяца 235,000 · выплачено 300,000',
    );
    expect(
      plain(paymentText({ id: 'p', masterId: 'worker-3', paidOn: '2026-10-05', amount: 300_000, kind: 'ADVANCE', comment: null })),
    ).toBe('5 октября аванс 300,000');
  });
});

describe('summarizeEarned', () => {
  it('groups the month by rule: the area, the rate and the sum; then the bonus and the penalty', () => {
    const lines = [
      line({ id: 'a' }),
      line({ id: 'b', orderId: 'order-1027', basis: 9.8, amount: 245_000 }),
      line({ id: 'c', method: 'BONUS', basis: 1, rate: 100_000, amount: 100_000 }),
      line({ id: 'd', method: 'PENALTY', basis: 1, rate: 12_000, amount: -12_000 }),
    ];

    expect(summarizeEarned(lines).map(plain)).toEqual([
      'Мастер, за м²: 22,2 м² × 25,000 = 555,000',
      'Премия 100,000',
      'Штраф −12,000',
    ]);
  });

  it('words every other method, in the order of the methods', () => {
    const lines = [
      line({ id: 'm', method: 'PER_MEASUREMENT', work: 'MEASURER', basis: 1, rate: 50_000, amount: 50_000 }),
      line({ id: 's', method: 'PERCENT_OF_SALES', work: 'SALES', basis: 1_410_000, rate: 3, amount: 42_300 }),
      line({ id: 'o1', method: 'PER_ORDER', work: 'INSTALLER', basis: 1, rate: 100_000, amount: 100_000 }),
      line({ id: 'o2', method: 'PER_ORDER', work: 'INSTALLER', basis: 1, rate: 100_000, amount: 100_000 }),
      line({ id: 'f', method: 'FIXED', work: null, orderId: null, basis: 1, rate: 2_000_000, amount: 2_000_000 }),
    ];

    expect(summarizeEarned(lines).map(plain)).toEqual([
      'Фикса 2,000,000',
      'Установщик, за заказ: 2 × 100,000 = 200,000',
      'Продажник, % от продаж: 3 % от 1,410,000 = 42,300',
      'Замерщик, за замер: 1 × 50,000 = 50,000',
    ]);
  });

  it('keeps lines written at different rates apart', () => {
    expect(summarizeEarned([line({ id: 'a' }), line({ id: 'b', rate: 20_000, amount: 248_000 })])).toHaveLength(2);
  });
});

describe('listMonthOrders', () => {
  it('lists each order once, by number, with its area when a per-m² line has one', () => {
    const lines = [
      line({ id: 'a' }),
      line({ id: 'bonus', method: 'BONUS', basis: 1, name: '№1031 · Мастер · премия 100,000' }),
      line({ id: 'b', orderId: 'order-1027', method: 'PER_ORDER', basis: 1, name: '№1027 · Мастер · за заказ 100,000' }),
      line({ id: 'f', orderId: null, method: 'FIXED', work: null, name: 'Фикса · Октябрь 2026' }),
    ];

    expect(listMonthOrders(lines).map(({ orderId, text }) => [orderId, plain(text)])).toEqual([
      ['order-1027', '№1027'],
      ['order-1031', '№1031 12,4 м²'],
    ]);
  });
});

describe('buildPayRule', () => {
  const base = { id: 'new', workerId: 'worker-3', existing: [] as PayRule[] };

  it.each<[PayMethod, PayWork | null, string, Pick<PayRule, 'amount' | 'percent'>]>([
    ['PER_SQUARE_METER', 'MASTER', '25,000', { amount: 25_000, percent: null }],
    ['FIXED', null, '2000000', { amount: 2_000_000, percent: null }],
    ['PERCENT_OF_SALES', 'SALES', '2,5', { amount: null, percent: 2.5 }],
  ])('builds %s for %s from «%s»', (method, work, value, numbers) => {
    expect(buildPayRule({ ...base, method, work, value })).toEqual({
      ok: true,
      rule: { id: 'new', workerId: 'worker-3', method, work, ...numbers },
    });
  });

  it.each<[PayMethod, PayWork | null, string, string]>([
    ['PER_MEASUREMENT', 'MASTER', '50000', 'Выберите, за что платим'],
    ['FIXED', 'MASTER', '50000', 'Выберите, за что платим'],
    ['PER_SQUARE_METER', 'MASTER', '', 'Введите сумму целым числом больше нуля'],
    ['PER_SQUARE_METER', 'MASTER', '0', 'Введите сумму целым числом больше нуля'],
    ['PER_SQUARE_METER', 'MASTER', '12,5', 'Введите сумму целым числом больше нуля'],
    ['PERCENT_OF_SALES', 'SALES', '0', 'Введите процент больше 0 и не больше 100'],
    ['PERCENT_OF_SALES', 'SALES', '101', 'Введите процент больше 0 и не больше 100'],
    ['PERCENT_OF_SALES', 'SALES', 'три', 'Введите процент больше 0 и не больше 100'],
  ])('refuses %s for %s with «%s»', (method, work, value, error) => {
    expect(buildPayRule({ ...base, method, work, value })).toEqual({ ok: false, error });
  });

  it('refuses a second rule of the same method and work, but lets a rule change its own amount', () => {
    const input = { ...base, method: 'PER_SQUARE_METER' as const, work: 'MASTER' as const, value: '30000', existing: [rule()] };

    expect(buildPayRule(input)).toEqual({ ok: false, error: 'Такое правило уже есть' });
    expect(buildPayRule({ ...input, id: 'rule' })).toMatchObject({ ok: true, rule: { id: 'rule', amount: 30_000 } });
  });

  it('lets another worker have a rule of the same method and work', () => {
    expect(
      buildPayRule({ ...base, method: 'PER_SQUARE_METER', work: 'MASTER', value: '30000', existing: [rule({ workerId: 'worker-2' })] }),
    ).toMatchObject({ ok: true });
  });
});

describe('buildWorker and parsePenaltyPercent', () => {
  it('takes a first name, an optional last name and at least one category', () => {
    expect(buildWorker({ firstName: ' Азиз ', lastName: ' Рахимов ', categories: ['INSTALLER'] })).toEqual({
      ok: true,
      data: { fullName: { firstName: 'Азиз', lastName: 'Рахимов' }, categories: ['INSTALLER'] },
    });
    expect(buildWorker({ firstName: 'Азиз', lastName: '', categories: ['INSTALLER'] })).toEqual({
      ok: true,
      data: { fullName: { firstName: 'Азиз', lastName: '' }, categories: ['INSTALLER'] },
    });
    expect(buildWorker({ firstName: ' ', lastName: 'Рахимов', categories: ['INSTALLER'] })).toEqual({
      ok: false,
      error: 'Введите имя',
    });
    expect(buildWorker({ firstName: 'Азиз', lastName: '', categories: [] })).toEqual({
      ok: false,
      error: 'Отметьте, кем работает',
    });
  });

  it.each([
    ['5', 5],
    ['2,5', 2.5],
    ['0', 0],
  ])('reads the penalty «%s»', (raw, value) => {
    expect(parsePenaltyPercent(raw)).toEqual({ ok: true, value });
  });

  it.each(['', '-1', '101', 'пять'])('refuses the penalty «%s»', (raw) => {
    expect(parsePenaltyPercent(raw)).toEqual({ ok: false, error: 'Введите число от 0 до 100' });
  });
});

describe('skippedNote', () => {
  it('says nothing while every record is counted', () => {
    expect(skippedNote({ payments: 0, accruals: 0 })).toBeNull();
  });

  it('counts the payments and the lines left out of the sums', () => {
    expect(skippedNote({ payments: 2, accruals: 0 })).toBe(
      'Не учтено выплат без даты, суммы или работника: 2 — исправьте в списке «Выплаты»',
    );
    expect(skippedNote({ payments: 1, accruals: 3 })).toBe(
      'Не учтено выплат без даты, суммы или работника: 1 — исправьте в списке «Выплаты». Не учтено начислений без даты, суммы или работника: 3',
    );
  });
});

describe('canPayInMonth', () => {
  it.each([
    ['2026-09', '2026-10', false],
    ['2026-10', '2026-10', true],
    ['2026-11', '2026-10', true],
    ['2025-12', '2026-01', false],
    ['2027-01', '2026-12', true],
  ])('shown %s while it is %s: %s', (shownMonth, currentMonth, expected) => {
    expect(canPayInMonth(shownMonth, currentMonth)).toBe(expected);
  });
});

describe('storedAttempts', () => {
  it('names no attempt whose record is not stored', () => {
    expect(storedAttempts({ 'worker-2:pay': 'id-1', add: 'id-2' }, ['other'])).toEqual([]);
    expect(storedAttempts({}, ['id-1'])).toEqual([]);
  });

  it('names the attempts whose record was read back', () => {
    expect(storedAttempts({ 'worker-2:pay': 'id-1', 'worker-2:rule': 'id-2', add: 'id-3' }, ['id-1', 'id-3'])).toEqual([
      'worker-2:pay',
      'add',
    ]);
  });

  it('names one row attempt and leaves the same form of another row open', () => {
    expect(storedAttempts({ 'worker-2:pay': 'id-1', 'worker-1:pay': 'id-2' }, ['id-2'])).toEqual(['worker-1:pay']);
  });
});

describe('the month as a statement', () => {
  const row = (overrides: Partial<PayrollRow> = {}): PayrollRow => ({
    workerId: 'worker-3',
    workerName: 'Рустам',
    categories: ['MASTER'],
    isActive: true,
    earned: 708_000,
    carriedOver: 400_000,
    paidThisMonth: 500_000,
    owed: 608_000,
    lines: [
      line({ id: 'b', earnedOn: '2026-10-12', basis: 11.5, rate: 40_000, amount: 460_000, name: '№1045 · Мастер' }),
      line({ id: 'a', earnedOn: '2026-10-04', basis: 6.2, rate: 40_000, amount: 248_000, name: '№1042 · Мастер' }),
    ],
    payments: [{ id: 'p', masterId: 'worker-3', paidOn: '2026-10-05', amount: 500_000, kind: 'ADVANCE', comment: null }],
    ...overrides,
  });

  it('lists what came over, each order by its day and each payment, adding up to what is owed', () => {
    const statement = buildStatement(row());

    expect(statement.map(({ text, amount }) => [plain(text), amount])).toEqual([
      ['С прошлого месяца', 400_000],
      ['№1042 · 6,2 м² × 40,000', 248_000],
      ['№1045 · 11,5 м² × 40,000', 460_000],
      ['5 октября · аванс', -500_000],
    ]);
    expect(statement.reduce((sum, { amount }) => sum + amount, 0)).toBe(row().owed);
    expect(statement[1].orderId).toBe('order-1031');
  });

  it('words a fixed pay, a percent and a penalty', () => {
    const statement = buildStatement(
      row({
        carriedOver: 0,
        payments: [],
        lines: [
          line({ id: 'f', orderId: null, method: 'FIXED', work: null, amount: 3_000_000, name: 'Фикса' }),
          line({ id: 's', method: 'PERCENT_OF_SALES', work: 'SALES', basis: 14_200_000, rate: 2, amount: 284_000, name: '№1045 · Продажи' }),
          line({ id: 'x', method: 'PENALTY', amount: -20_000, name: '№1045 · Штраф' }),
        ],
      }),
    );

    expect(statement.map(({ text }) => plain(text))).toEqual([
      'Фикса',
      '№1045 · 2 % от 14,200,000',
      '№1045 · штраф',
    ]);
  });

  it('does not let one worker paid ahead shrink what the others are owed', () => {
    const totals = payrollTotals([
      row({ earned: 0, carriedOver: 0, paidThisMonth: 10_000, owed: -10_000 }),
      row({ earned: 442_500, carriedOver: 0, paidThisMonth: 0, owed: 442_500 }),
    ]);

    expect(totals.owed).toBe(442_500);
    expect(plain(owedLine(-10_000).label + ' ' + owedLine(-10_000).amount)).toBe('Выплачено вперёд 10,000 сум');
    expect(owedLine(928_000).label).toBe('К выплате');
  });

  it('signs a sum the way a ledger does', () => {
    expect(signedWhole(248_000)).toBe('+248,000');
    expect(signedWhole(-500_000)).toBe('−500,000');
  });

  it('totals the month for everybody', () => {
    const totals = payrollTotals([row(), row({ earned: 442_500, carriedOver: 0, paidThisMonth: 0, owed: 442_500 })]);

    expect(totals).toMatchObject({ owed: 1_050_500, paid: 500_000, earned: 1_150_500, carriedOver: 400_000 });
    expect(totals.paidShare).toBeCloseTo(500_000 / 1_550_500);
    expect(plain(totalsSentence(totals))).toBe(
      'Выплачено 500,000 из 1,550,500 · начислено за месяц 1,150,500 · с прошлого 400,000',
    );
  });
});
