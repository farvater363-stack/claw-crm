import { describe, expect, it } from 'vitest';

import { paymentFix, paymentName } from 'src/payments/payment-name';

// ru-RU groups thousands with a no-break space; compare with plain spaces.
const plain = (value: string) => value.replace(/\s/g, ' ');

describe('paymentName', () => {
  it('reads as date, method and amount', () => {
    expect(
      plain(
        paymentName({ paidOn: '2026-10-05', method: 'CASH', amount: 500_000 }),
      ),
    ).toBe('5 октября Наличные 500 000 сум');
    expect(
      plain(
        paymentName({
          paidOn: '2026-11-12',
          method: 'TRANSFER',
          amount: 1_250_000,
        }),
      ),
    ).toBe('12 ноября Перевод 1 250 000 сум');
  });
});

describe('paymentFix', () => {
  const today = '2026-10-06';
  const payment = {
    name: '',
    paidOn: '2026-10-05',
    method: 'CARD',
    amount: 300_000,
  };

  it('names a new payment', () => {
    const fix = paymentFix(payment, today);

    expect(Object.keys(fix)).toEqual(['name']);
    expect(plain(fix.name ?? '')).toBe('5 октября Карта 300 000 сум');
  });

  it('dates a payment typed without a date, and names it by that date', () => {
    const fix = paymentFix({ ...payment, paidOn: null }, today);

    expect(fix.paidOn).toBe('2026-10-06');
    expect(plain(fix.name ?? '')).toBe('6 октября Карта 300 000 сум');
  });

  it('changes nothing when the name is already right', () => {
    const name = paymentName({
      paidOn: '2026-10-05',
      method: 'CARD',
      amount: 300_000,
    });

    expect(paymentFix({ ...payment, name }, today)).toEqual({});
  });

  it('counts a missing amount as zero', () => {
    expect(
      plain(paymentFix({ ...payment, amount: null }, today).name ?? ''),
    ).toBe('5 октября Карта 0 сум');
  });

  it('leaves the name alone when the method is unknown', () => {
    expect(paymentFix({ ...payment, method: null }, today)).toEqual({});
    expect(paymentFix({ ...payment, method: 'BARTER' }, today)).toEqual({});
  });
});
