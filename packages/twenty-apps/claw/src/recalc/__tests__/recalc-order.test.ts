import { type CoreApiClient } from 'twenty-client-sdk/core';
import { expect, it, vi } from 'vitest';

import { syncOrderAccruals } from 'src/payroll/sync-order-accruals';
import { applyRecalcPlan } from 'src/recalc/apply-recalc-plan';
import { recalcOrder } from 'src/recalc/recalc-order';
import { syncOrderMaterials } from 'src/warehouse/sync-order-materials';

const { CATALOG } = vi.hoisted(() => ({
  CATALOG: { grilles: [], norms: [] },
}));

vi.mock('src/recalc/load-recalc-input', () => ({
  loadRecalcInput: vi.fn(async () => ({ demandCatalog: CATALOG })),
}));
vi.mock('src/pricing/plan-order-recalc', () => ({
  planOrderRecalc: vi.fn(() => ({})),
  isEmptyRecalcPlan: vi.fn(() => true),
}));
vi.mock('src/recalc/apply-recalc-plan', () => ({ applyRecalcPlan: vi.fn() }));
vi.mock('src/payroll/sync-order-accruals', () => ({
  syncOrderAccruals: vi.fn(),
}));
vi.mock('src/warehouse/sync-order-materials', () => ({
  syncOrderMaterials: vi.fn(),
}));
vi.mock('src/warehouse/recalc-warehouse', () => ({ recalcWarehouse: vi.fn() }));
vi.mock('src/contract/sync-contract-state', () => ({
  syncContractState: vi.fn(),
}));

const client = {} as CoreApiClient;

it('writes the pay lines after the totals are stored, even when the materials step fails', async () => {
  vi.mocked(syncOrderMaterials).mockRejectedValue(new Error('stock is down'));

  await expect(recalcOrder(client, 'order-1')).rejects.toThrow('stock is down');

  expect(syncOrderAccruals).toHaveBeenCalledWith(client, 'order-1');
  expect(vi.mocked(applyRecalcPlan).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(syncOrderAccruals).mock.invocationCallOrder[0],
  );
});

it('stores the totals again once the pay lines have changed', async () => {
  vi.mocked(applyRecalcPlan).mockClear();
  vi.mocked(syncOrderMaterials).mockResolvedValue(false);
  vi.mocked(syncOrderAccruals).mockResolvedValueOnce(true);

  await recalcOrder(client, 'order-1');

  expect(applyRecalcPlan).toHaveBeenCalledTimes(2);

  vi.mocked(applyRecalcPlan).mockClear();
  vi.mocked(syncOrderAccruals).mockResolvedValueOnce(false);

  await recalcOrder(client, 'order-1');

  expect(applyRecalcPlan).toHaveBeenCalledTimes(1);
});

it('stops after planning when its own sums came back unchanged', async () => {
  vi.mocked(applyRecalcPlan).mockClear();
  vi.mocked(syncOrderAccruals).mockClear();
  vi.mocked(syncOrderMaterials).mockClear();

  await recalcOrder(client, 'order-1', { stopIfUnchanged: true });

  expect(applyRecalcPlan).not.toHaveBeenCalled();
  expect(syncOrderAccruals).not.toHaveBeenCalled();
  expect(syncOrderMaterials).not.toHaveBeenCalled();
});

it('hands the grilles and norms it read to the materials step', async () => {
  vi.mocked(syncOrderMaterials).mockClear();
  vi.mocked(syncOrderMaterials).mockResolvedValue(false);
  vi.mocked(syncOrderAccruals).mockResolvedValueOnce(false);

  await recalcOrder(client, 'order-1');

  expect(syncOrderMaterials).toHaveBeenCalledWith(client, 'order-1', {
    entersWrittenOff: undefined,
    catalog: CATALOG,
  });
});
