import { type CoreApiClient } from 'twenty-client-sdk/core';
import { expect, it, vi } from 'vitest';

import { syncOrderAccruals } from 'src/payroll/sync-order-accruals';
import { applyRecalcPlan } from 'src/recalc/apply-recalc-plan';
import { recalcOrder } from 'src/recalc/recalc-order';
import { syncOrderMaterials } from 'src/warehouse/sync-order-materials';

vi.mock('src/recalc/load-recalc-input', () => ({
  loadRecalcInput: vi.fn(async () => ({})),
}));
vi.mock('src/pricing/plan-order-recalc', () => ({
  planOrderRecalc: vi.fn(() => ({})),
}));
vi.mock('src/recalc/apply-recalc-plan', () => ({ applyRecalcPlan: vi.fn() }));
vi.mock('src/payroll/sync-order-accruals', () => ({
  syncOrderAccruals: vi.fn(),
}));
vi.mock('src/warehouse/sync-order-materials', () => ({
  syncOrderMaterials: vi.fn(),
}));
vi.mock('src/warehouse/recalc-warehouse', () => ({ recalcWarehouse: vi.fn() }));

const client = {} as CoreApiClient;

it('writes the pay lines after the totals are stored, even when the materials step fails', async () => {
  vi.mocked(syncOrderMaterials).mockRejectedValue(new Error('stock is down'));

  await expect(recalcOrder(client, 'order-1')).rejects.toThrow('stock is down');

  expect(syncOrderAccruals).toHaveBeenCalledWith(client, 'order-1');
  expect(vi.mocked(applyRecalcPlan).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(syncOrderAccruals).mock.invocationCallOrder[0],
  );
});
