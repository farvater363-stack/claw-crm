import {
  buildOrderCancelFields,
  buildOrderCancelInput,
  buildOrderMoneyQuestion,
  formatOrderMoneyAmount,
  formatRefundAmountInput,
  getDefaultRefundWallet,
  getPaidAmountMicrosByOrderId,
  getPaidOrderIds,
  getRefundDefaults,
  hasOrderRefundFields,
  isOrderCancelWithoutMoneyAnswer,
  isOrderMoneyWorkspace,
  parseRefundAmountMicros,
  sumPaidAmountMicros,
  withOrderPaid,
} from '@/claw-order-money/utils/orderMoney';

const CLAW_OBJECTS = [
  {
    nameSingular: 'order',
    fields: [{ name: 'status' }, { name: 'paidMoneyOnCancel' }],
  },
  { nameSingular: 'orderPayment', fields: [{ name: 'amount' }] },
];

describe('isOrderMoneyWorkspace', () => {
  it('is true only for the order object of a Claw CRM workspace', () => {
    expect(isOrderMoneyWorkspace(CLAW_OBJECTS, 'order')).toBe(true);
    expect(isOrderMoneyWorkspace(CLAW_OBJECTS, 'orderPayment')).toBe(false);
  });

  it('is false for an order object without the money answer or payments', () => {
    expect(
      isOrderMoneyWorkspace(
        [{ nameSingular: 'order', fields: [{ name: 'status' }] }],
        'order',
      ),
    ).toBe(false);
    expect(isOrderMoneyWorkspace([CLAW_OBJECTS[0]], 'order')).toBe(false);
  });
});

describe('isOrderCancelWithoutMoneyAnswer', () => {
  it('asks when an order goes to CANCELLED without an answer', () => {
    expect(
      isOrderCancelWithoutMoneyAnswer('order', {
        status: 'CANCELLED',
        position: 3,
      }),
    ).toBe(true);
  });

  it('does not ask for other statuses, other objects or an answered cancel', () => {
    expect(
      isOrderCancelWithoutMoneyAnswer('order', { status: 'PRODUCTION' }),
    ).toBe(false);
    expect(
      isOrderCancelWithoutMoneyAnswer('opportunity', { status: 'CANCELLED' }),
    ).toBe(false);
    expect(
      isOrderCancelWithoutMoneyAnswer('order', {
        status: 'CANCELLED',
        paidMoneyOnCancel: 'KEPT',
      }),
    ).toBe(false);
  });
});

describe('order payments', () => {
  const paidByOrderId = getPaidAmountMicrosByOrderId([
    { orderId: 'a', amount: { amountMicros: 1_000_000_000_000 } },
    { orderId: 'a', amount: { amountMicros: '2600000000000' } },
    { orderId: 'b', amount: { amountMicros: 0 } },
    { orderId: 'c', amount: null },
    { orderId: null, amount: { amountMicros: 5_000_000 } },
  ]);

  it('sums each order’s payments', () => {
    expect(paidByOrderId).toEqual({ a: 3_600_000_000_000, b: 0, c: 0 });
  });

  it('keeps only the orders with money paid, in the given order', () => {
    expect(getPaidOrderIds(['d', 'c', 'b', 'a'], paidByOrderId)).toEqual(['a']);
  });

  it('adds up the paid sum of several orders', () => {
    expect(sumPaidAmountMicros(['a', 'b', 'x'], paidByOrderId)).toBe(
      3_600_000_000_000,
    );
  });
});

describe('order money question', () => {
  it('formats сум with thousands separators', () => {
    expect(formatOrderMoneyAmount(3_600_000_000_000)).toBe('3,600,000 сум');
  });

  it('asks about the money of a cancelled order', () => {
    expect(
      buildOrderMoneyQuestion({
        action: 'cancel',
        paidAmountMicros: 3_600_000_000_000,
        paidOrderCount: 1,
      }),
    ).toEqual({
      title: 'Клиент заплатил 3,600,000 сум',
      subtitle: 'Что с деньгами?',
      abortButtonText: 'Не отменять',
    });
  });

  it('explains that paid orders are cancelled instead of deleted', () => {
    const question = buildOrderMoneyQuestion({
      action: 'delete',
      paidAmountMicros: 1_500_000_000,
      paidOrderCount: 1,
    });

    expect(question.title).toBe('У заказа есть оплата 1,500 сум');
    expect(question.subtitle).toContain('будет отменён, а не удалён');
    expect(
      buildOrderMoneyQuestion({
        action: 'delete',
        paidAmountMicros: 1_500_000_000,
        paidOrderCount: 2,
      }).abortButtonText,
    ).toBe('Не удалять');
  });

  it('sends the answer with the cancel in one update', () => {
    expect(
      buildOrderCancelInput({ position: 2 }, { paidMoneyOnCancel: 'REFUNDED' }),
    ).toEqual({
      position: 2,
      status: 'CANCELLED',
      paidMoneyOnCancel: 'REFUNDED',
    });
  });
});

describe('refund details', () => {
  it('is asked only once the order object has the refund fields', () => {
    expect(hasOrderRefundFields(CLAW_OBJECTS)).toBe(false);
    expect(
      hasOrderRefundFields([
        {
          nameSingular: 'order',
          fields: [{ name: 'refundAmount' }, { name: 'refundWallet' }],
        },
      ]),
    ).toBe(true);
    expect(
      hasOrderRefundFields([
        { nameSingular: 'order', fields: [{ name: 'refundAmount' }] },
      ]),
    ).toBe(false);
  });

  it('suggests the wallet most of the money came into', () => {
    expect(
      getDefaultRefundWallet([
        { method: 'CASH', amount: { amountMicros: 1_000 } },
        { method: 'TRANSFER', amount: { amountMicros: 700 } },
        { method: 'TRANSFER', amount: { amountMicros: '700' } },
      ]),
    ).toBe('ACCOUNT');
    expect(
      getDefaultRefundWallet([
        { method: 'CARD', amount: { amountMicros: 1_000 } },
        { method: null, amount: { amountMicros: 600 } },
        { method: 'CASH', amount: { amountMicros: 600 } },
      ]),
    ).toBe('CASH');
    expect(
      getDefaultRefundWallet([
        { method: 'CARD', amount: { amountMicros: 1_000 } },
      ]),
    ).toBe('CARD');
    expect(
      getDefaultRefundWallet([
        { method: 'CRYPTO', amount: { amountMicros: 1_000 } },
      ]),
    ).toBe('ACCOUNT');
  });

  it('asks the amount and wallet only about a single paid order', () => {
    const payments = [
      { orderId: 'a', method: 'CARD', amount: { amountMicros: 5_000 } },
      { orderId: 'b', method: 'CASH', amount: { amountMicros: 9_000 } },
    ];

    expect(
      getRefundDefaults({
        hasRefundFields: true,
        paidRecordIds: ['a'],
        paidAmountMicros: 5_000,
        payments,
      }),
    ).toEqual({ paidAmountMicros: 5_000, wallet: 'CARD' });
    expect(
      getRefundDefaults({
        hasRefundFields: true,
        paidRecordIds: ['a', 'b'],
        paidAmountMicros: 14_000,
        payments,
      }),
    ).toBeNull();
    expect(
      getRefundDefaults({
        hasRefundFields: false,
        paidRecordIds: ['a'],
        paidAmountMicros: 5_000,
        payments,
      }),
    ).toBeNull();
  });

  it('accepts an amount above zero and up to what was paid', () => {
    const paid = 3_600_000_000_000;

    expect(formatRefundAmountInput(paid)).toBe('3,600,000');
    expect(parseRefundAmountMicros('3,600,000', paid)).toBe(paid);
    expect(parseRefundAmountMicros('1 500 000 сум', paid)).toBe(
      1_500_000_000_000,
    );
    expect(parseRefundAmountMicros('2500.5', paid)).toBe(2_500_500_000);
    expect(parseRefundAmountMicros('3,600,001', paid)).toBeNull();
    expect(parseRefundAmountMicros('0', paid)).toBeNull();
    expect(parseRefundAmountMicros('', paid)).toBeNull();
    expect(parseRefundAmountMicros('abc', paid)).toBeNull();
  });

  it('sends the amount and wallet of a single order’s refund', () => {
    expect(
      buildOrderCancelInput(
        {},
        buildOrderCancelFields({
          answer: {
            paidMoneyOnCancel: 'REFUNDED',
            refund: { amountMicros: 1_000_000_000, wallet: 'CARD' },
          },
          hasRefundFields: true,
        }),
      ),
    ).toEqual({
      status: 'CANCELLED',
      paidMoneyOnCancel: 'REFUNDED',
      refundAmount: { amountMicros: 1_000_000_000, currencyCode: 'UZS' },
      refundWallet: 'CARD',
    });
  });

  it('leaves the refund of several orders to the server', () => {
    expect(
      buildOrderCancelFields({
        answer: { paidMoneyOnCancel: 'REFUNDED', refund: null },
        hasRefundFields: true,
      }),
    ).toEqual({
      paidMoneyOnCancel: 'REFUNDED',
      refundAmount: null,
      refundWallet: null,
    });
  });

  it('sends no refund fields when money is kept or the fields do not exist', () => {
    expect(
      buildOrderCancelFields({
        answer: { paidMoneyOnCancel: 'KEPT' },
        hasRefundFields: true,
      }),
    ).toEqual({ paidMoneyOnCancel: 'KEPT' });
    expect(
      buildOrderCancelFields({
        answer: { paidMoneyOnCancel: 'REFUNDED', refund: null },
        hasRefundFields: false,
      }),
    ).toEqual({ paidMoneyOnCancel: 'REFUNDED' });
  });
});

describe('withOrderPaid', () => {
  it('takes the order paid when a refund lowered it', () => {
    expect(
      withOrderPaid({ a: 662_025_000_000, b: 100_000_000 }, [
        { id: 'a', paid: { amountMicros: 162_025_000_000 } },
        { id: 'b', paid: null },
      ]),
    ).toEqual({ a: 162_025_000_000, b: 100_000_000 });
  });

  it('ignores orders with no payments loaded', () => {
    expect(withOrderPaid({}, [{ id: 'a', paid: { amountMicros: 5 } }])).toEqual(
      {},
    );
  });
});
