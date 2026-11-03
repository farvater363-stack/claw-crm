import { describe, expect, it } from 'vitest';

import {
  schemeProductName,
  toSchemeOpenings,
  withSchemeVisors,
} from 'src/order-sketch/order-sketch';

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
      number: 1,
      title: 'Проём 1',
      designName: 'Ромб',
      notes: null,
      quantity: 2,
      isRailing: false,
      shape: null,
      sketch: {
        widthCm: 140,
        heightCm: 150,
        projectionKind: 'BOTTOM',
        projectionCm: 30,
        projectionSide: null,
        sizeText: '140×150×30 снизу',
        sideText: null,
        unitsText: '2,97 м²',
      },
    });
  });

  it('says which side the вынос stands out from once it is known', () => {
    const [opening] = toSchemeOpenings([{ ...row, projectionSide: 'OUTSIDE' }]);

    expect(opening.sketch).toMatchObject({
      sizeText: '140×150×30 снизу',
      sideText: 'установка снаружи',
    });
  });

  it('keeps the measurer note, trimmed, and drops an empty one', () => {
    const [noted, blank] = toSchemeOpenings([
      { ...row, notes: '  ручка слева \n' },
      { ...row, id: 'item-2', notes: '   ' },
    ]);

    expect(noted.notes).toBe('ручка слева');
    expect(blank.notes).toBeNull();
  });

  it('describes a railing by its length in running metres', () => {
    const [opening] = toSchemeOpenings([
      { ...row, product: 'RAILING', widthCm: 450, heightCm: 90 },
    ]);

    expect(opening.isRailing).toBe(true);
    expect(opening.sketch).toMatchObject({
      projectionKind: 'NONE',
      sizeText: '450×90',
      unitsText: '4,5 п.м.',
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

  it('keeps the form numbers when a visor alone was проём 2', () => {
    const openings = toSchemeOpenings([
      { ...row, id: 'third', openingNumber: 3 },
      { ...row, id: 'first', openingNumber: 1 },
    ]);

    expect(openings.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'first', title: 'Проём 1' },
      { id: 'third', title: 'Проём 3' },
    ]);
  });

  it('numbers an item without a form number after the numbered ones', () => {
    const openings = toSchemeOpenings([
      { ...row, id: 'added-later', openingNumber: null },
      { ...row, id: 'third', openingNumber: 3 },
      { ...row, id: 'first', openingNumber: 1 },
    ]);

    expect(openings.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'first', title: 'Проём 1' },
      { id: 'third', title: 'Проём 3' },
      { id: 'added-later', title: 'Проём 4' },
    ]);
  });
});

describe('withSchemeVisors', () => {
  it('puts each козырёк with its проём and a козырёк alone in its own place', () => {
    const openings = withSchemeVisors(
      toSchemeOpenings([
        { ...row, id: 'first', openingNumber: 1 },
        { ...row, id: 'third', openingNumber: 3 },
      ]),
      [
        {
          id: 'over-first',
          name: 'Козырёк пластик',
          quantity: 2.4,
          orderItemId: 'first',
        },
        {
          id: 'alone',
          name: 'Козырёк металл',
          quantity: 1.5,
          orderItemId: null,
          openingNumber: 2,
        },
        {
          id: 'lost',
          name: 'Козырёк старый',
          quantity: 1,
          orderItemId: 'deleted-item',
        },
      ],
    );

    expect(
      openings.map((opening) => [opening.title, opening.visors ?? []]),
    ).toEqual([
      ['Проём 1', ['Козырёк пластик, 120 см']],
      ['Проём 2', ['Козырёк металл, 150 см']],
      ['Проём 3', []],
    ]);
    expect(schemeProductName(openings[1])).toBe('Только козырёк');
  });
});
