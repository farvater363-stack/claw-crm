import { type CoreApiClient } from 'twenty-client-sdk/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyWarehouseRecalcPlan } from 'src/warehouse/apply-warehouse-recalc-plan';
import { loadWarehouseRecalcInput } from 'src/warehouse/load-warehouse-recalc-input';
import {
  type WarehouseMaterial,
  type WarehouseRecalcInput,
} from 'src/warehouse/plan-warehouse-recalc';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';

vi.mock('src/warehouse/load-warehouse-recalc-input');
vi.mock('src/warehouse/apply-warehouse-recalc-plan');

const material = (
  overrides: Partial<WarehouseMaterial> = {},
): WarehouseMaterial => ({
  id: 'material-1',
  name: 'Профиль 20×20',
  unit: 'METER',
  safetyPercent: 10,
  minimumStock: 0,
  onHand: null,
  reserved: null,
  available: null,
  toBuy: null,
  stockState: null,
  lastPurchasePrice: null,
  overrunPercent: null,
  ...overrides,
});

const input = (materialRecord: WarehouseMaterial): WarehouseRecalcInput => ({
  materials: [materialRecord],
  norms: [],
  movements: [
    {
      id: 'movement-1',
      name: 'Приход · Профиль 20×20 · +100 м',
      kind: 'RECEIPT',
      materialId: 'material-1',
      quantity: 100,
      countedQuantity: null,
      unitPrice: null,
      date: '2026-10-01',
      createdAt: '2026-10-01T05:00:00.000Z',
    },
  ],
  lines: [],
  orders: [],
});

const stale = input(material());
const settled = input(
  material({
    onHand: 100,
    reserved: 0,
    available: 100,
    toBuy: 0,
    stockState: 'OK',
  }),
);

const client = {} as CoreApiClient;

describe('recalcWarehouse', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('re-reads after writing and stops once nothing is left to write', async () => {
    vi.mocked(loadWarehouseRecalcInput)
      .mockResolvedValueOnce(stale)
      .mockResolvedValueOnce(settled);

    await recalcWarehouse(client);

    expect(loadWarehouseRecalcInput).toHaveBeenCalledTimes(2);
    expect(applyWarehouseRecalcPlan).toHaveBeenCalledTimes(1);
  });

  it('stops after 3 writing passes when the data never settles', async () => {
    vi.mocked(loadWarehouseRecalcInput).mockResolvedValue(stale);

    await recalcWarehouse(client);

    expect(applyWarehouseRecalcPlan).toHaveBeenCalledTimes(3);
  });
});
