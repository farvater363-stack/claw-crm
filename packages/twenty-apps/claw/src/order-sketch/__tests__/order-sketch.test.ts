import { describe, expect, it } from 'vitest';

import { toSchemeOpenings } from 'src/order-sketch/order-sketch';

const row = {
  id: 'item-1',
  widthCm: 140,
  heightCm: 150,
  projectionCm: 30,
  projectionKind: 'BOTTOM',
  quantity: 2,
  designName: 'Ромб',
};

describe('toSchemeOpenings', () => {
  it('numbers the openings and describes each one as the form did', () => {
    const [opening] = toSchemeOpenings([row]);

    expect(opening).toEqual({
      id: 'item-1',
      title: 'Проём 1',
      designName: 'Ромб',
      quantity: 2,
      sketch: {
        widthCm: 140,
        heightCm: 150,
        projectionKind: 'BOTTOM',
        projectionCm: 30,
        sizeText: '140×150×30 снизу',
        areaSquareMeters: 2.97,
      },
    });
  });

  it('draws an item saved before the вынос kind existed as both ways', () => {
    const [opening] = toSchemeOpenings([
      { ...row, projectionKind: null, quantity: null },
    ]);

    expect(opening.quantity).toBe(1);
    expect(opening.sketch?.projectionKind).toBe('BOTTOM_AND_TOP');
    expect(opening.sketch?.sizeText).toBe('140×150×30');
  });

  it('leaves out the drawing while the sizes are missing', () => {
    const [, second] = toSchemeOpenings([row, { ...row, widthCm: null }]);

    expect(second.title).toBe('Проём 2');
    expect(second.sketch).toBeNull();
  });
});
