import { describe, expect, it } from 'vitest';

import {
  computeOrderMaterialDemand,
  type DemandItem,
  type DemandNorm,
} from 'src/warehouse/compute-order-material-demand';

const item = (overrides: Partial<DemandItem> = {}): DemandItem => ({
  name: '100×150',
  designId: 'grille-1',
  areaSquareMeters: 1.5,
  quantity: 2,
  ...overrides,
});

const norm = (overrides: Partial<DemandNorm> = {}): DemandNorm => ({
  designId: 'grille-1',
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
      grilles: [{ id: 'grille-1', name: 'Волна' }],
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
      grilles: [{ id: 'grille-1', name: 'Волна' }],
      norms: [
        norm(),
        norm({
          designId: null,
          extraServiceId: 'visor',
          quantityPerUnit: 2,
        }),
      ],
    });

    expect(demand.quantityByMaterialId.get('profile')).toBe(28);
  });

  it('names each grille without a composition once', () => {
    const demand = computeOrderMaterialDemand({
      items: [item(), item(), item({ designId: 'grille-2' })],
      extraServiceLines: [{ extraServiceId: 'delivery', quantity: 1 }],
      grilles: [{ id: 'grille-1', name: 'Волна' }],
      norms: [],
    });

    expect(demand.quantityByMaterialId.size).toBe(0);
    expect(demand.missingNorms).toBe(
      'Не указано, из чего делается: Волна, решётка',
    );
  });

  it('skips items without an area and ignores malformed norms', () => {
    const demand = computeOrderMaterialDemand({
      items: [item({ areaSquareMeters: null })],
      extraServiceLines: [{ extraServiceId: 'visor', quantity: 2 }],
      grilles: [{ id: 'grille-1', name: 'Волна' }],
      norms: [
        norm({
          designId: null,
          extraServiceId: 'visor',
          materialId: null,
        }),
        norm({ extraServiceId: 'visor' }),
      ],
    });

    expect(demand.quantityByMaterialId.size).toBe(0);
    expect(demand.missingNorms).toBeNull();
  });

  it('multiplies area and quantity by each material of the grille', () => {
    const demand = computeOrderMaterialDemand({
      items: [item({ designId: 'grille-1', areaSquareMeters: 2, quantity: 3 })],
      extraServiceLines: [],
      grilles: [{ id: 'grille-1', name: 'Волна' }],
      norms: [
        norm({
          designId: 'grille-1',
          materialId: 'profile',
          quantityPerUnit: 4,
        }),
      ],
    });

    expect(demand.quantityByMaterialId.get('profile')).toBe(24);
    expect(demand.missingNorms).toBeNull();
  });

  it('reports a grille with no composition by name', () => {
    const demand = computeOrderMaterialDemand({
      items: [item({ designId: 'grille-1', areaSquareMeters: 2 })],
      extraServiceLines: [],
      grilles: [{ id: 'grille-1', name: 'Волна' }],
      norms: [],
    });

    expect(demand.missingNorms).toBe('Не указано, из чего делается: Волна');
  });

  it('skips a position without a grille', () => {
    const demand = computeOrderMaterialDemand({
      items: [item({ designId: null, areaSquareMeters: 2 })],
      extraServiceLines: [],
      grilles: [],
      norms: [],
    });

    expect(demand.quantityByMaterialId.size).toBe(0);
    expect(demand.missingNorms).toBeNull();
  });
});
