import { describe, expect, it } from 'vitest';

import {
  buildPriceSections,
  parseOptionalMoney,
  parsePositiveNumber,
} from 'src/prices/prices-screen';

const plain = (value: string | null) => value?.replace(/\s/g, ' ') ?? null;

const materials = [{ id: 'profile', name: 'Профиль', unitLabel: 'м' }];

describe('buildPriceSections', () => {
  it('sorts grilles by name and words the price with its unit', () => {
    const { grilles } = buildPriceSections({
      grilles: [
        {
          id: 'b',
          name: 'Хайтек',
          metal: 'PROFILE',
          price: 150_000,
          photoUrl: null,
        },
        {
          id: 'a',
          name: 'Волна',
          metal: 'PROFILE',
          price: 100_000,
          photoUrl: null,
        },
      ],
      services: [],
      norms: [],
      materials: [],
    });

    expect(grilles.map((row) => row.name)).toEqual(['Волна', 'Хайтек']);
    expect(plain(grilles[0].priceText)).toBe('100 000 сум за м²');
  });

  it('splits services into visors and services', () => {
    const sections = buildPriceSections({
      grilles: [],
      services: [
        {
          id: 'v',
          name: 'Козырёк 50',
          kind: 'VISOR',
          unit: 'PER_RUNNING_METER',
          price: 80_000,
        },
        {
          id: 's',
          name: 'Доставка',
          kind: 'SERVICE',
          unit: 'FIXED',
          price: 40_000,
        },
      ],
      norms: [],
      materials: [],
    });

    expect(sections.visors.map((row) => row.id)).toEqual(['v']);
    expect(plain(sections.visors[0].priceText)).toBe('80 000 сум за п.м.');
    expect(plain(sections.services[0].priceText)).toBe('40 000 сум за заказ');
  });

  it('warns about a missing price', () => {
    const { grilles } = buildPriceSections({
      grilles: [
        { id: 'a', name: 'Волна', metal: null, price: null, photoUrl: null },
      ],
      services: [],
      norms: [],
      materials: [],
    });

    expect(grilles[0].warnings).toEqual(['Укажите цену']);
    expect(grilles[0].priceText).toBeNull();
  });

  it('warns about a missing composition only when the warehouse has materials', () => {
    const grille = {
      id: 'a',
      name: 'Волна',
      metal: null,
      price: 100_000,
      photoUrl: null,
    };

    expect(
      buildPriceSections({
        grilles: [grille],
        services: [],
        norms: [],
        materials: [],
      }).grilles[0].warnings,
    ).toEqual([]);
    expect(
      buildPriceSections({
        grilles: [grille],
        services: [],
        norms: [],
        materials,
      }).grilles[0].warnings,
    ).toEqual(['Не указано, из чего делается']);
  });

  it('does not ask a plain service for a composition', () => {
    const sections = buildPriceSections({
      grilles: [],
      services: [
        {
          id: 's',
          name: 'Доставка',
          kind: 'SERVICE',
          unit: 'FIXED',
          price: 40_000,
        },
      ],
      norms: [],
      materials,
    });

    expect(sections.services[0].warnings).toEqual([]);
  });

  it('lists the composition with material names and units', () => {
    const { grilles } = buildPriceSections({
      grilles: [
        { id: 'a', name: 'Волна', metal: null, price: 100_000, photoUrl: null },
      ],
      services: [],
      norms: [
        {
          id: 'n1',
          designId: 'a',
          extraServiceId: null,
          materialId: 'profile',
          quantityPerUnit: 4.5,
        },
        {
          id: 'n2',
          designId: 'a',
          extraServiceId: null,
          materialId: 'gone',
          quantityPerUnit: 1,
        },
      ],
      materials,
    });

    expect(grilles[0].composition).toEqual([
      {
        normId: 'n1',
        materialId: 'profile',
        materialName: 'Профиль',
        quantity: 4.5,
        unitLabel: 'м',
      },
    ]);
  });
});

describe('input checks', () => {
  it.each([
    ['5,5', 5.5],
    ['5.5', 5.5],
    [' 12 ', 12],
  ])('reads the quantity %j with a comma or a dot', (raw, value) => {
    expect(parsePositiveNumber(raw)).toEqual({ ok: true, value });
  });

  it.each(['0', '-2', '-0', '+2', 'abc', '1e3', '0x10', '1,2,3', ''])(
    'rejects the quantity %j',
    (raw) => {
      expect(parsePositiveNumber(raw)).toEqual({
        ok: false,
        error: 'Введите число больше нуля',
      });
    },
  );

  it('treats an empty price as no price', () => {
    expect(parseOptionalMoney('')).toEqual({ ok: true, value: null });
    expect(parseOptionalMoney('  ')).toEqual({ ok: true, value: null });
  });

  it.each([
    ['250000', 250_000],
    ['250 000', 250_000],
    ['250.000', 250_000],
    ['250,000', 250_000],
    ['1.250.000', 1_250_000],
    ['1 250 000', 1_250_000],
    ['1 250 000', 1_250_000],
    ['0', 0],
  ])('reads the price %j as a whole sum', (raw, value) => {
    expect(parseOptionalMoney(raw)).toEqual({ ok: true, value });
  });

  it.each(['0,4', '1,5', '250,5', '250.00', '-5', '-1', 'abc', '1e3', '0x10'])(
    'rejects the price %j instead of rounding or guessing',
    (raw) => {
      expect(parseOptionalMoney(raw)).toEqual({
        ok: false,
        error: 'Введите цену целым числом, без минуса',
      });
    },
  );
});
