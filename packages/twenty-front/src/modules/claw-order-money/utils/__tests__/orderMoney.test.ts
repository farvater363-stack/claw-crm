import {
  buildOrderCancelInput,
  buildOrderMoneyQuestion,
  formatOrderMoneyAmount,
  getPaidAmountMicrosByOrderId,
  getPaidOrderIds,
  isOrderCancelWithoutMoneyAnswer,
  isOrderMoneyWorkspace,
  sumPaidAmountMicros,
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
    expect(
      buildOrderMoneyQuestion({
        action: 'delete',
        paidAmountMicros: 1_500_000_000,
        paidOrderCount: 1,
      }).title,
    ).toBe('У заказа есть оплата 1,500 сум — он будет отменён, а не удалён');
    expect(
      buildOrderMoneyQuestion({
        action: 'delete',
        paidAmountMicros: 1_500_000_000,
        paidOrderCount: 2,
      }).abortButtonText,
    ).toBe('Не удалять');
  });

  it('sends the answer with the cancel in one update', () => {
    expect(buildOrderCancelInput({ position: 2 }, 'REFUNDED')).toEqual({
      position: 2,
      status: 'CANCELLED',
      paidMoneyOnCancel: 'REFUNDED',
    });
  });
});
