import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it } from 'vitest';

import { loadRecalcInput } from 'src/recalc/load-recalc-input';

type Request = Record<string, { __args?: unknown }>;

const page = (nodes: Record<string, unknown>[]) => ({
  edges: nodes.map((node) => ({ node })),
});

const uzs = (amount: number) => ({
  amountMicros: amount * 1_000_000,
  currencyCode: 'UZS',
});

const fakeClient = (
  payments: Record<string, unknown>[],
  {
    order = { id: 'order-1', status: 'MEASURED' } as Record<string, unknown>,
    accruals = [] as Record<string, unknown>[],
    designs = [] as Record<string, unknown>[],
    norms = [] as Record<string, unknown>[],
    materials = [] as Record<string, unknown>[],
    refunds = [] as Record<string, unknown>[],
  } = {},
) => {
  const queries: Request[] = [];
  const client = {
    query: async (request: Request) => {
      queries.push(request);

      return {
        orders: page([order]),
        payAccruals: page(accruals),
        orderItems: page([]),
        orderExtraServices: page([]),
        designs: page(designs),
        extraServices: page([]),
        materialNorms: page(norms),
        materials: page(materials),
        orderPayments: page(payments),
        moneyEntries: page(refunds),
      };
    },
  } as unknown as CoreApiClient;

  return { client, queries };
};

const NO_REFRESH = {
  refreshPriceItemIds: [],
  refreshPriceExtraServiceLineIds: [],
};

describe('loadRecalcInput', () => {
  it('costs a grille by its composition and the purchase prices', async () => {
    const { client } = fakeClient([], {
      designs: [{ id: 'grille-1', pricePerSquareMeter: uzs(450_000) }],
      norms: [
        { designId: 'grille-1', materialId: 'rod', quantityPerUnit: 9.5 },
        { designId: 'grille-1', materialId: 'paint', quantityPerUnit: 0.25 },
        { designId: 'grille-2', materialId: 'rod', quantityPerUnit: 100 },
      ],
      materials: [
        // The average wins over the last price.
        { id: 'rod', averagePrice: uzs(9_000), lastPurchasePrice: uzs(9_900) },
        { id: 'paint', averagePrice: null, lastPurchasePrice: uzs(60_000) },
      ],
    });

    const input = await loadRecalcInput(client, 'order-1', NO_REFRESH);

    expect(input?.grilles).toEqual([
      {
        id: 'grille-1',
        product: 'GRILLE',
        pricePerSquareMeter: 450_000,
        costPerSquareMeter: 100_500,
      },
    ]);
  });

  it('sums the pay lines of the order', async () => {
    const { client } = fakeClient([], {
      accruals: [{ amount: uzs(248_000) }, { amount: uzs(155_000) }],
    });

    expect(
      (await loadRecalcInput(client, 'order-1', NO_REFRESH))?.payTotal,
    ).toBe(403_000);
  });

  it('sums the payments of this order only', async () => {
    const { client, queries } = fakeClient([
      { amount: uzs(500_000) },
      { amount: uzs(200_000) },
      { amount: null },
    ]);

    const input = await loadRecalcInput(client, 'order-1', NO_REFRESH);

    expect(input?.paymentsTotal).toBe(700_000);
    expect(queries[0].orderPayments.__args).toMatchObject({
      filter: { orderId: { eq: 'order-1' } },
    });
  });

  describe('refunds', () => {
    const paidWith = async (
      order: Record<string, unknown>,
      refunds: Record<string, unknown>[],
    ) => {
      const { client, queries } = fakeClient(
        [{ amount: uzs(500_000) }, { amount: uzs(300_000) }],
        { order, refunds },
      );
      const input = await loadRecalcInput(client, 'order-1', NO_REFRESH);

      return { paid: input?.paymentsTotal, queries };
    };

    it('still counts the refund of the current cancel as paid', async () => {
      expect(
        (
          await paidWith({ id: 'order-1', status: 'CANCELLED' }, [
            { id: 'order-1', amount: uzs(800_000) },
          ])
        ).paid,
      ).toBe(800_000);
    });

    it('counts off a refund of a cancel the order was taken back from', async () => {
      const { paid, queries } = await paidWith(
        { id: 'order-1', status: 'PRODUCTION', refundEntryId: 'refund-2' },
        [{ id: 'order-1', amount: uzs(600_000) }],
      );

      expect(paid).toBe(200_000);
      expect(queries[0].moneyEntries.__args).toMatchObject({
        filter: { orderId: { eq: 'order-1' }, kind: { eq: 'REFUND' } },
      });
    });

    it('never counts below nothing', async () => {
      expect(
        (
          await paidWith(
            { id: 'order-1', status: 'PRODUCTION', refundEntryId: 'refund-3' },
            [
              { id: 'order-1', amount: uzs(800_000) },
              { id: 'refund-2', amount: uzs(300_000) },
            ],
          )
        ).paid,
      ).toBe(0);
    });
  });

  it('counts no payments as zero', async () => {
    const { client } = fakeClient([]);

    expect(
      (await loadRecalcInput(client, 'order-1', NO_REFRESH))?.paymentsTotal,
    ).toBe(0);
  });

  it('counts an amount that is not a number as zero', async () => {
    const { client } = fakeClient([
      { amount: uzs(500_000) },
      { amount: { amountMicros: 'много', currencyCode: 'UZS' } },
      { amount: { currencyCode: 'UZS' } },
    ]);

    expect(
      (await loadRecalcInput(client, 'order-1', NO_REFRESH))?.paymentsTotal,
    ).toBe(500_000);
  });

  describe('the prepayment', () => {
    const PAYMENTS = [
      { amount: uzs(300_000), paidOn: '2026-10-01' },
      { amount: uzs(200_000), paidOn: '2026-10-05' },
      { amount: uzs(100_000), paidOn: '2026-10-06' },
    ];

    const prepaymentWith = async (productionStartDate: string | null) => {
      const { client } = fakeClient(PAYMENTS, {
        order: { id: 'order-1', status: 'IN_PRODUCTION', productionStartDate },
      });

      return (await loadRecalcInput(client, 'order-1', NO_REFRESH))
        ?.prepaymentsTotal;
    };

    it('counts the payments made before and on the day production starts', async () => {
      expect(await prepaymentWith('2026-10-05')).toBe(500_000);
    });

    it('leaves out the payments made after production starts', async () => {
      expect(await prepaymentWith('2026-10-02')).toBe(300_000);
      expect(await prepaymentWith('2026-09-30')).toBe(0);
    });

    it('counts every payment while the order has not gone to production', async () => {
      expect(await prepaymentWith(null)).toBe(600_000);
    });

    it('reads the start date of a timestamp the same as a day', async () => {
      expect(await prepaymentWith('2026-10-05T00:00:00.000Z')).toBe(500_000);
    });
  });

  describe('the rates kept on the lines of the master', () => {
    const keptRatesOf = async (status: string) => {
      const { client } = fakeClient([], {
        order: {
          id: 'order-1',
          status,
          masterId: 'worker-3',
          master: { penaltyPercentPerDay: 0 },
        },
        accruals: [
          {
            workerId: 'worker-3',
            work: 'MASTER',
            method: 'PER_SQUARE_METER',
            rate: 25_000,
          },
        ],
      });

      return (await loadRecalcInput(client, 'order-1', NO_REFRESH))?.master
        ?.keptRates;
    };

    it('hold for an installed order', async () => {
      expect(await keptRatesOf('INSTALLED')).toEqual([
        { method: 'PER_SQUARE_METER', rate: 25_000 },
      ]);
    });

    it.each(['QUALITY_CHECK', 'CANCELLED'])(
      'are dropped when the order is %s, as its lines are about to be removed',
      async (status) => {
        expect(await keptRatesOf(status)).toEqual([]);
      },
    );
  });
});
