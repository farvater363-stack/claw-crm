import { describe, expect, it } from 'vitest';

import {
  computeOrderMaterialDemand,
  type DemandItem,
  type DemandNorm,
  type DemandPriceListRow,
} from 'src/warehouse/compute-order-material-demand';

const row: DemandPriceListRow = {
  id: 'row-wave',
  name: 'Волна / профиль',
  designId: 'design-wave',
  metal: 'PROFILE',
  metalSize: null,
};

const item = (overrides: Partial<DemandItem> = {}): DemandItem => ({
  name: '100×150',
  designId: 'design-wave',
  metal: 'PROFILE',
  metalSize: 'SIZE_15_15',
  areaSquareMeters: 1.5,
  quantity: 2,
  ...overrides,
});

const norm = (overrides: Partial<DemandNorm> = {}): DemandNorm => ({
  priceListItemId: 'row-wave',
  extraServiceId: null,
  materialId: 'profile',
  quantityPerUnit: 5.5,
  ...overrides,
});

describe('computeOrderMaterialDemand', () => {
  it('multiplies item area, quantity and the per-m² norm', () => {
    const demand = computeOrderMaterialDemand({
      items: [item()],
      extraServiceLines: [],
      priceList: [row],
      norms: [norm(), norm({ materialId: 'paint', quantityPerUnit: 0.25 })],
    });

    expect(Object.fromEntries(demand.quantityByMaterialId)).toEqual({
      profile: 16.5,
      paint: 0.75,
    });
    expect(demand.missingNorms).toBeNull();
  });

  it('sums the same material across items and extra services', () => {
    const demand = computeOrderMaterialDemand({
      items: [item(), item({ areaSquareMeters: 1, quantity: 1 })],
      extraServiceLines: [{ extraServiceId: 'visor', quantity: 3 }],
      priceList: [row],
      norms: [
        norm(),
        norm({
          priceListItemId: null,
          extraServiceId: 'visor',
          quantityPerUnit: 2,
        }),
      ],
    });

    expect(demand.quantityByMaterialId.get('profile')).toBe(28);
  });

  it('names items without a price list row or without norms, once each', () => {
    const demand = computeOrderMaterialDemand({
      items: [item(), item(), item({ name: '90×90', metal: 'ROD' })],
      extraServiceLines: [{ extraServiceId: 'delivery', quantity: 1 }],
      priceList: [row],
      norms: [],
    });

    expect(demand.quantityByMaterialId.size).toBe(0);
    expect(demand.missingNorms).toBe(
      'Нет нормы: Волна / профиль; Нет строки прайса: 90×90',
    );
  });

  it('skips items without an area and ignores malformed norms', () => {
    const demand = computeOrderMaterialDemand({
      items: [item({ areaSquareMeters: null })],
      extraServiceLines: [{ extraServiceId: 'visor', quantity: 2 }],
      priceList: [row],
      norms: [
        norm({
          priceListItemId: null,
          extraServiceId: 'visor',
          materialId: null,
        }),
        norm({ extraServiceId: 'visor' }),
      ],
    });

    expect(demand.quantityByMaterialId.size).toBe(0);
    expect(demand.missingNorms).toBeNull();
  });
});
