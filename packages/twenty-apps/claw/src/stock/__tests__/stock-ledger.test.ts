import { describe, expect, it } from 'vitest';

import {
  buildStockMonthReport,
  type LedgerMovement,
  summarizePurchases,
  summarizeSuppliers,
  valueStockMovements,
} from 'src/stock/stock-ledger';

let sequence = 0;

const movement = (overrides: Partial<LedgerMovement>): LedgerMovement => {
  sequence += 1;

  return {
    id: `movement-${sequence}`,
    kind: 'RECEIPT',
    materialId: 'profile',
    quantity: 0,
    countedQuantity: null,
    unitPrice: null,
    date: '2026-10-01',
    createdAt: `2026-10-01T05:00:${String(sequence).padStart(2, '0')}.000Z`,
    orderId: null,
    purchaseId: null,
    comment: null,
    ...overrides,
  };
};

describe('valueStockMovements', () => {
  it('values a purchase at its price and what leaves at the average', () => {
    const valued = valueStockMovements([
      movement({ quantity: 100, unitPrice: 20_000 }),
      movement({ quantity: 100, unitPrice: 30_000, date: '2026-10-02' }),
      movement({
        kind: 'WRITE_OFF',
        quantity: -50,
        date: '2026-10-03',
        orderId: 'order-1',
      }),
      movement({ kind: 'SCRAP', quantity: -2, date: '2026-10-04' }),
    ]);

    expect(valued.map((line) => line.value)).toEqual([
      2_000_000, 3_000_000, -1_250_000, -50_000,
    ]);
  });

  it('turns a recount into the difference at the average price', () => {
    const valued = valueStockMovements([
      movement({ quantity: 10, unitPrice: 5_000 }),
      movement({ kind: 'STOCKTAKE', countedQuantity: 8, date: '2026-10-05' }),
    ]);

    expect(valued[1]).toMatchObject({ quantity: -2, value: -10_000 });
  });

  it('leaves the value empty until the material has a price', () => {
    const valued = valueStockMovements([
      movement({ quantity: 10 }),
      movement({ kind: 'WASTE', quantity: -1, date: '2026-10-02' }),
    ]);

    expect(valued.map((line) => line.value)).toEqual([null, null]);
  });

  it('walks by date, not by the order of typing', () => {
    const valued = valueStockMovements([
      movement({ kind: 'WASTE', quantity: -10, date: '2026-10-09' }),
      movement({ quantity: 10, unitPrice: 1_000, date: '2026-10-01' }),
    ]);

    expect(valued.map((line) => line.value)).toEqual([10_000, -10_000]);
  });
});

describe('buildStockMonthReport', () => {
  const valued = valueStockMovements([
    movement({ quantity: 100, unitPrice: 10_000, date: '2026-09-10' }),
    movement({
      quantity: 50,
      unitPrice: 10_000,
      date: '2026-10-02',
      purchaseId: 'purchase-1',
    }),
    movement({
      kind: 'WRITE_OFF',
      quantity: -40,
      date: '2026-10-03',
      orderId: 'order-1',
    }),
    movement({
      kind: 'ORDER_EXTRA',
      quantity: -2,
      date: '2026-10-04',
      orderId: 'order-1',
    }),
    movement({ kind: 'SCRAP', quantity: -3, date: '2026-10-05' }),
    movement({ kind: 'STOCKTAKE', countedQuantity: 100, date: '2026-10-20' }),
    movement({ kind: 'WASTE', quantity: -1, date: '2026-11-01' }),
  ]);

  it('adds up to the closing value', () => {
    const report = buildStockMonthReport(valued, '2026-10');

    expect(report).toMatchObject({
      opening: 1_000_000,
      received: 500_000,
      receiptCount: 1,
      toOrders: 420_000,
      overuse: 20_000,
      orderCount: 1,
      scrap: 30_000,
      recount: -50_000,
      losses: 80_000,
      closing: 1_000_000,
      hasUnpriced: false,
    });
    expect(
      report.opening +
        report.received -
        report.toOrders -
        report.scrap -
        report.waste -
        report.otherOut -
        report.workshopUse -
        report.returned +
        report.recount,
    ).toBe(report.closing);
  });

  it('lists each material by quantity', () => {
    expect(buildStockMonthReport(valued, '2026-10').materials).toEqual([
      {
        materialId: 'profile',
        opening: 100,
        received: 50,
        toOrders: 42,
        lost: 8,
        other: 0,
        closing: 100,
      },
    ]);
  });
});

describe('summarizePurchases and summarizeSuppliers', () => {
  const valued = valueStockMovements([
    movement({
      quantity: 10,
      unitPrice: 100_000,
      date: '2026-10-01',
      purchaseId: 'old',
    }),
    movement({
      quantity: 5,
      unitPrice: 100_000,
      date: '2026-10-05',
      purchaseId: 'new',
    }),
  ]);
  const purchases = [
    {
      id: 'old',
      date: '2026-10-01',
      createdAt: '2026-10-01T05:00:00.000Z',
      supplierId: 'metal',
      comment: null,
    },
    {
      id: 'new',
      date: '2026-10-05',
      createdAt: '2026-10-05T05:00:00.000Z',
      supplierId: 'metal',
      comment: null,
    },
  ];
  const suppliers = [{ id: 'metal', name: 'Ташкент Металл' }];
  const payments = [
    {
      id: 'at-purchase',
      amount: 400_000,
      date: '2026-10-01',
      supplierId: 'metal',
      purchaseId: 'old',
    },
    {
      id: 'later',
      amount: 800_000,
      date: '2026-10-07',
      supplierId: 'metal',
      purchaseId: null,
    },
  ];

  it('pays the oldest purchase off first with a later payment', () => {
    const summaries = summarizePurchases({
      purchases,
      suppliers,
      valued,
      payments,
    });

    expect(
      summaries.map(({ id, total, paid, debt }) => ({ id, total, paid, debt })),
    ).toEqual([
      { id: 'new', total: 500_000, paid: 200_000, debt: 300_000 },
      { id: 'old', total: 1_000_000, paid: 1_000_000, debt: 0 },
    ]);
    expect(summaries[0].supplierName).toBe('Ташкент Металл');
  });

  it('counts what is still owed to each supplier', () => {
    const summaries = summarizePurchases({
      purchases,
      suppliers,
      valued,
      payments,
    });

    expect(
      summarizeSuppliers({ suppliers, purchases: summaries, payments }),
    ).toEqual([
      {
        id: 'metal',
        name: 'Ташкент Металл',
        purchaseCount: 2,
        purchased: 1_500_000,
        paid: 1_200_000,
        debt: 300_000,
      },
    ]);
  });
});
