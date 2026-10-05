import { describe, expect, it } from 'vitest';

import { buildPaymentInput } from 'src/payroll/payment-draft';

describe('buildPaymentInput', () => {
  const base = {
    kind: 'ADVANCE' as const,
    masterId: 'worker-1',
    masterName: 'Работник 1',
    paidOn: '2026-10-05',
    comment: '',
  };

  it('builds a named payment in UZS micros', () => {
    expect(buildPaymentInput({ ...base, amount: '100 000' })).toEqual({
      isValid: true,
      data: {
        name: 'Аванс · Работник 1',
        masterId: 'worker-1',
        paidOn: '2026-10-05',
        amount: { amountMicros: 100_000_000_000, currencyCode: 'UZS' },
        kind: 'ADVANCE',
        comment: null,
      },
    });
  });

  it.each(['', '0', '-5', '12,5', 'abc', '1000000001', '1 000 000 001'])(
    'rejects amount %s',
    (amount) => {
      expect(buildPaymentInput({ ...base, amount })).toEqual({
        isValid: false,
        error:
          'Сумма должна быть целым числом больше 0 и не больше 1 000 000 000',
      });
    },
  );

  it('requires a date', () => {
    expect(buildPaymentInput({ ...base, amount: '5000', paidOn: '' })).toEqual({
      isValid: false,
      error: 'Укажите дату',
    });
  });
});
