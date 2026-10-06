import { describe, expect, it } from 'vitest';

import {
  buildPriceSections,
  grilleKind,
  grilleKindOptions,
  metalOfKind,
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
          name: 'Ромб',
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

    expect(grilles.map((row) => row.name)).toEqual(['Волна', 'Ромб']);
    expect(plain(grilles[0].priceText)).toBe('100,000 сум за м²');
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
    expect(plain(sections.visors[0].priceText)).toBe('80,000 сум за п.м.');
    expect(plain(sections.services[0].priceText)).toBe('40,000 сум за заказ');
  });

  it('costs a grille by its composition, for the owner only', () => {
    const input = {
      grilles: [
        { id: 'a', name: 'Волна', metal: null, price: 450_000, photoUrl: null },
      ],
      services: [],
      norms: [
        {
          id: 'n1',
          designId: 'a',
          extraServiceId: null,
          materialId: 'rod',
          quantityPerUnit: 9.5,
        },
        {
          id: 'n2',
          designId: 'a',
          extraServiceId: null,
          materialId: 'paint',
          quantityPerUnit: 0.25,
        },
      ],
      materials: [
        { id: 'rod', name: 'Прут', unitLabel: 'м', unitPrice: 9_000 },
        { id: 'paint', name: 'Краска', unitLabel: 'л', unitPrice: null },
      ],
    };

    const [owner] = buildPriceSections({ ...input, canSeeCosts: true }).grilles;

    expect(owner.composition.map((line) => line.lineCost)).toEqual([
      85_500,
      null,
    ]);
    expect(plain(owner.costText)).toBe(
      'Материал 85,500 сум · остаётся 364,500 сум',
    );
    expect(owner.warnings).toEqual(['Нет цены закупки']);

    const [manager] = buildPriceSections(input).grilles;

    expect(manager.costText).toBeNull();
    expect(manager.warnings).toEqual([]);
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
    ).toEqual(['Не указаны материалы']);
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
        unitPrice: null,
        lineCost: null,
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

  it.each([
    '0,4',
    '1,5',
    '250,5',
    '250.00',
    '-5',
    '-1',
    'abc',
    '1e3',
    '0x10',
    '0.250',
    '000.250',
    '1.250,000',
    '1,250.000',
  ])('rejects the price %j instead of rounding or guessing', (raw) => {
    expect(parseOptionalMoney(raw)).toEqual({
      ok: false,
      error: 'Введите цену целым числом, без минуса',
    });
  });

  it('rejects a price too long to be a number', () => {
    expect(parseOptionalMoney('9'.repeat(400))).toEqual({
      ok: false,
      error: 'Введите цену целым числом, без минуса',
    });
  });
});

describe('the kind of a grille', () => {
  it('is what was typed, or the name of the old metal', () => {
    expect(grilleKind({ workshopKind: ' Труба ', metal: 'ROD' })).toBe('Труба');
    expect(grilleKind({ workshopKind: null, metal: 'ROD' })).toBe('Прут');
    expect(grilleKind({ workshopKind: '', metal: null })).toBeNull();
  });

  it('offers the three first kinds and every kind typed since, once each', () => {
    expect(
      grilleKindOptions([
        { workshopKind: 'Труба' },
        { workshopKind: 'Прут' },
        { workshopKind: null },
        { workshopKind: 'Труба' },
      ]),
    ).toEqual(['Арматура', 'Профиль', 'Прут', 'Труба']);
  });

  it('keeps the old metal for one of the three first kinds only', () => {
    expect(metalOfKind('Профиль')).toBe('PROFILE');
    expect(metalOfKind('Труба')).toBeNull();
  });
});
