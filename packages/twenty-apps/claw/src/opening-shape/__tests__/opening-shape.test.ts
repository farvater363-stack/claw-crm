import { describe, expect, it } from 'vitest';

import {
  buildShapeOutline,
  createShapeDraft,
  describeShape,
  outlineHeightCm,
  parseItemShape,
  parseStoredShape,
  sampleArc,
  type ShapeDraft,
  shapeDraftFromStored,
  toStoredShape,
} from 'src/opening-shape/opening-shape';

let sequence = 0;
const nextKey = () => `key-${sequence++}`;

const draftOf = (overrides: Partial<ShapeDraft>): ShapeDraft => ({
  ...createShapeDraft(nextKey),
  ...overrides,
});

describe('buildShapeOutline', () => {
  it('draws a rectangle from the width and the height, as before shapes', () => {
    expect(buildShapeOutline(draftOf({}), '140', '150')).toEqual({
      isValid: true,
      outline: {
        widthCm: 140,
        points: [
          { xCm: 0, heightCm: 150 },
          { xCm: 140, heightCm: 150 },
        ],
        arcRisesCm: [null],
      },
      errors: [],
    });
  });

  it('draws the ТЗ trapezoid: 200 wide, 155 on the left, 110 on the right', () => {
    const result = buildShapeOutline(
      draftOf({ kind: 'SLOPE', leftCm: '155', rightCm: '110' }),
      '200',
      '',
    );

    expect(result.outline?.points).toEqual([
      { xCm: 0, heightCm: 155 },
      { xCm: 200, heightCm: 110 },
    ]);
    expect(result.outline && outlineHeightCm(result.outline)).toBe(155);
  });

  it('bends a slope at the centre height, Себзор 29.09: 164 / 154 / 113 on 134', () => {
    const result = buildShapeOutline(
      draftOf({
        kind: 'SLOPE',
        leftCm: '164',
        centerCm: '154',
        rightCm: '113',
      }),
      '134',
      '',
    );

    expect(result.outline?.points).toEqual([
      { xCm: 0, heightCm: 164 },
      { xCm: 67, heightCm: 154 },
      { xCm: 134, heightCm: 113 },
    ]);
  });

  it('puts extra slope points in order, wherever they were typed', () => {
    const result = buildShapeOutline(
      draftOf({
        kind: 'SLOPE',
        leftCm: '100',
        rightCm: '100',
        slopePoints: [
          { key: 'b', xCm: '150', heightCm: '90' },
          { key: 'a', xCm: '50', heightCm: '120' },
        ],
      }),
      '200',
      '',
    );

    expect(result.outline?.points.map((point) => point.xCm)).toEqual([
      0, 50, 150, 200,
    ]);
  });

  it('asks for what is missing instead of drawing a guess', () => {
    expect(
      buildShapeOutline(draftOf({ kind: 'SLOPE', leftCm: '155' }), '200', '')
        .errors,
    ).toEqual(['укажите высоту справа больше 0']);
  });

  it('builds the Ломоносов arch: chord 123,5, rise 62, on the sill', () => {
    const result = buildShapeOutline(
      draftOf({ kind: 'ARCH', sideCm: '0', riseCm: '62' }),
      '123,5',
      '',
    );

    expect(result.isValid).toBe(true);
    expect(result.outline && outlineHeightCm(result.outline)).toBe(62);
  });

  it('adds the side walls under an arch to its height', () => {
    const result = buildShapeOutline(
      draftOf({ kind: 'ARCH', sideCm: '150', riseCm: '30' }),
      '120',
      '',
    );

    expect(result.outline && outlineHeightCm(result.outline)).toBe(180);
  });

  it('refuses an arch rise bigger than half the width', () => {
    expect(
      buildShapeOutline(
        draftOf({ kind: 'ARCH', sideCm: '0', riseCm: '70' }),
        '120',
        '',
      ).errors,
    ).toEqual([
      'стрела 70 см больше половины ширины 120 см. У полукруга стрела равна половине ширины',
    ]);
  });

  it('draws one step: 155 for the first 120 cm, then 110', () => {
    const result = buildShapeOutline(
      draftOf({
        kind: 'STEP',
        leftCm: '155',
        rightCm: '110',
        steps: [{ key: 's1', xCm: '120', heightCm: '' }],
      }),
      '200',
      '',
    );

    expect(result.outline?.points).toEqual([
      { xCm: 0, heightCm: 155 },
      { xCm: 120, heightCm: 155 },
      { xCm: 120, heightCm: 110 },
      { xCm: 200, heightCm: 110 },
    ]);
  });

  it('needs the height between two steps and steps left to right', () => {
    expect(
      buildShapeOutline(
        draftOf({
          kind: 'STEP',
          leftCm: '155',
          rightCm: '110',
          steps: [
            { key: 's1', xCm: '120', heightCm: '' },
            { key: 's2', xCm: '100', heightCm: '' },
          ],
        }),
        '200',
        '',
      ).errors,
    ).toEqual([
      'Ступень 1: укажите высоту после ступени',
      'Ступень 2: должна быть правее ступени 1',
    ]);
  });

  it('names the point outside the width, as in the mockup', () => {
    const result = buildShapeOutline(
      draftOf({
        kind: 'CUSTOM',
        points: [
          {
            key: 'a',
            xCm: '0',
            heightCm: '155',
            isArcToNext: false,
            arcRiseCm: '',
          },
          {
            key: 'b',
            xCm: '120',
            heightCm: '155',
            isArcToNext: false,
            arcRiseCm: '',
          },
          {
            key: 'c',
            xCm: '120',
            heightCm: '110',
            isArcToNext: false,
            arcRiseCm: '',
          },
          {
            key: 'd',
            xCm: '230',
            heightCm: '110',
            isArcToNext: false,
            arcRiseCm: '',
          },
        ],
      }),
      '200',
      '',
    );

    expect(result.errors).toEqual([
      'Точка D: 230 см от края, а ширина 200 см. Проверьте ширину или точку D',
    ]);
  });

  it('draws an arc piece between two custom points', () => {
    const result = buildShapeOutline(
      draftOf({
        kind: 'CUSTOM',
        points: [
          {
            key: 'a',
            xCm: '0',
            heightCm: '100',
            isArcToNext: true,
            arcRiseCm: '20',
          },
          {
            key: 'b',
            xCm: '100',
            heightCm: '100',
            isArcToNext: false,
            arcRiseCm: '',
          },
        ],
      }),
      '100',
      '',
    );

    expect(result.outline?.arcRisesCm).toEqual([20]);
    expect(result.outline && outlineHeightCm(result.outline)).toBe(120);
  });

  it('wants the custom points to start and end at the edges', () => {
    expect(
      buildShapeOutline(
        draftOf({
          kind: 'CUSTOM',
          points: [
            {
              key: 'a',
              xCm: '10',
              heightCm: '100',
              isArcToNext: false,
              arcRiseCm: '',
            },
            {
              key: 'b',
              xCm: '90',
              heightCm: '100',
              isArcToNext: false,
              arcRiseCm: '',
            },
          ],
        }),
        '100',
        '',
      ).errors,
    ).toEqual([
      'Точка A: первая точка стоит у левого края, от края 0',
      'Точка B: последняя точка стоит у правого края, от края 100 (ширина)',
    ]);
  });
});

describe('sampleArc', () => {
  it('runs over the top of a half circle, ends included', () => {
    const points = sampleArc(
      { xCm: 0, heightCm: 0 },
      { xCm: 100, heightCm: 0 },
      50,
    );
    const top = points[points.length / 2 - 0.5 * (points.length % 2)];

    expect(points[0].xCm).toBeCloseTo(0);
    expect(points[points.length - 1].xCm).toBeCloseTo(100);
    expect(Math.max(...points.map((point) => point.heightCm))).toBeCloseTo(50);
    expect(top.heightCm).toBeGreaterThan(0);
  });

  it('bulges above the sill even for a horseshoe taller than half the width', () => {
    const points = sampleArc(
      { xCm: 0, heightCm: 0 },
      { xCm: 100, heightCm: 0 },
      80,
    );

    expect(Math.max(...points.map((point) => point.heightCm))).toBeCloseTo(80);
    expect(Math.min(...points.map((point) => point.heightCm))).toBeLessThan(0);
  });
});

describe('stored shapes', () => {
  it('saves a rectangle as no shape at all', () => {
    const draft = draftOf({});
    const result = buildShapeOutline(draft, '100', '100');

    expect(result.outline && toStoredShape(draft, result.outline)).toBeNull();
  });

  it('reopens a saved shape with the numbers that were typed', () => {
    const draft = draftOf({
      kind: 'SLOPE',
      leftCm: '164',
      centerCm: '154',
      rightCm: '113',
    });
    const result = buildShapeOutline(draft, '134', '');
    const stored =
      result.outline === null ? null : toStoredShape(draft, result.outline);
    const reopened = parseStoredShape(JSON.parse(JSON.stringify(stored)));

    expect(reopened?.kind).toBe('SLOPE');
    expect(
      reopened === null ? null : shapeDraftFromStored(reopened, nextKey),
    ).toMatchObject({ kind: 'SLOPE', leftCm: '164', centerCm: '154' });
    expect(describeShape(reopened)).toBe('скос 164 / 154 / 113');
  });

  it('reads an unreadable value as a plain rectangle', () => {
    expect(parseStoredShape(null)).toBeNull();
    expect(parseStoredShape('not json')).toBeNull();
    expect(
      parseStoredShape({ kind: 'SLOPE', outline: { widthCm: 1 } }),
    ).toBeNull();
  });

  it('describes an arch and a step the way the sheet reads', () => {
    const arch = buildShapeOutline(
      draftOf({ kind: 'ARCH', sideCm: '0', riseCm: '62' }),
      '124',
      '',
    );
    const step = buildShapeOutline(
      draftOf({
        kind: 'STEP',
        leftCm: '155',
        rightCm: '110',
        steps: [{ key: 's', xCm: '120', heightCm: '' }],
      }),
      '200',
      '',
    );

    expect(
      describeShape({
        version: 1,
        kind: 'ARCH',
        outline: arch.outline!,
        draft: createShapeDraft(nextKey),
      }),
    ).toBe('арка, стрела 62');
    expect(
      describeShape({
        version: 1,
        kind: 'STEP',
        outline: step.outline!,
        draft: createShapeDraft(nextKey),
      }),
    ).toBe('ступень 155 / 110');
  });
});

describe('parseItemShape', () => {
  const draft = draftOf({ kind: 'ARCH', sideCm: '0', riseCm: '62' });
  const stored = toStoredShape(
    draft,
    buildShapeOutline(draft, '124', '').outline!,
  );

  it('keeps the shape while the item has its sizes', () => {
    expect(parseItemShape(stored, 124, 62)?.kind).toBe('ARCH');
  });

  it('draws a rectangle once the sizes were changed elsewhere', () => {
    expect(parseItemShape(stored, 140, 62)).toBeNull();
  });
});

describe('arcs that would bulge past the sides', () => {
  it('refuses a custom arc taller than half its chord', () => {
    expect(
      buildShapeOutline(
        draftOf({
          kind: 'CUSTOM',
          points: [
            {
              key: 'a',
              xCm: '0',
              heightCm: '100',
              isArcToNext: true,
              arcRiseCm: '60',
            },
            {
              key: 'b',
              xCm: '100',
              heightCm: '100',
              isArcToNext: false,
              arcRiseCm: '',
            },
          ],
        }),
        '100',
        '',
      ).errors,
    ).toEqual([
      'Дуга A → B: стрела 60 см больше половины расстояния между точками',
    ]);
  });
});
