import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it, vi } from 'vitest';

import {
  createPurchaseLine,
  moveSupplierPayments,
} from 'src/stock/load-stock-books';

const fakeClient = () => {
  const mutation = vi.fn().mockResolvedValue({});

  return { client: { mutation } as unknown as CoreApiClient, mutation };
};

const PURCHASE = { id: 'purchase-1', date: '2026-10-08' };
const LINE = { key: 'a', materialId: 'profile', quantity: 90 };

const sentData = (mutation: ReturnType<typeof vi.fn>) =>
  mutation.mock.calls[0][0].createStockMovement.__args.data;

describe('createPurchaseLine', () => {
  it('writes the price of a line', async () => {
    const { client, mutation } = fakeClient();

    await createPurchaseLine(
      client,
      'line-1',
      PURCHASE,
      { ...LINE, unitPrice: 22_000 },
      true,
    );

    expect(sentData(mutation)).toMatchObject({
      id: 'line-1',
      unitPrice: { amountMicros: 22_000_000_000, currencyCode: 'UZS' },
    });
  });

  it('clears a price taken out of the line', async () => {
    const { client, mutation } = fakeClient();

    await createPurchaseLine(
      client,
      'line-1',
      PURCHASE,
      { ...LINE, unitPrice: null },
      true,
    );

    expect(sentData(mutation).unitPrice).toEqual({
      amountMicros: null,
      currencyCode: 'UZS',
    });
  });

  it('sends no price for a role that may not write it', async () => {
    const { client, mutation } = fakeClient();

    await createPurchaseLine(
      client,
      'line-1',
      PURCHASE,
      { ...LINE, unitPrice: null },
      false,
    );

    expect(sentData(mutation)).not.toHaveProperty('unitPrice');
  });
});

describe('moveSupplierPayments', () => {
  it('moves the payments of a purchase to its new supplier', async () => {
    const { client, mutation } = fakeClient();

    await moveSupplierPayments(client, ['payment-1'], {
      id: 'glass',
      name: 'Стекло',
    });

    expect(mutation).toHaveBeenCalledWith({
      updateMoneyEntries: {
        __args: {
          filter: { id: { in: ['payment-1'] } },
          data: { supplierId: 'glass', name: 'Оплата поставщику · Стекло' },
        },
        id: true,
      },
    });
  });

  it('sends nothing for a purchase with no payments', async () => {
    const { client, mutation } = fakeClient();

    await moveSupplierPayments(client, [], { id: 'glass', name: 'Стекло' });

    expect(mutation).not.toHaveBeenCalled();
  });
});
