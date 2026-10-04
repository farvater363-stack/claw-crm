import { describe, expect, it } from 'vitest';

import {
  materialUnitLabel,
  ORDER_MATERIAL_STATE_OPTIONS,
  STOCK_MOVEMENT_KIND_OPTIONS,
} from 'src/constants/select-options';

const idByValue = (
  options: ReadonlyArray<{ value: string; id?: string }>,
): Record<string, string | undefined> =>
  Object.fromEntries(options.map((option) => [option.value, option.id]));

// The server keeps a stored value only while its option id stays the same, and
// an id the SDK generates changes with the label.
describe('relabelled options keep the id of their first label', () => {
  it('pins the stock movement kinds', () => {
    expect(idByValue(STOCK_MOVEMENT_KIND_OPTIONS)).toEqual({
      RECEIPT: 'f3a49374-82bc-5de5-bdeb-b177c8a7dabd',
      STOCKTAKE: '39c60125-a523-58d9-a592-bf57d41ec9cd',
      WRITE_OFF: 'c4613eef-94a1-512e-87c6-deae83f82f51',
    });
  });

  it('pins the order material state that was relabelled, and only it', () => {
    expect(idByValue(ORDER_MATERIAL_STATE_OPTIONS)).toEqual({
      ENOUGH: undefined,
      SHORTAGE: undefined,
      NO_NORM: '7c5c1feb-5c5f-5d83-bfff-7985de022885',
    });
  });
});

describe('materialUnitLabel', () => {
  it('words a unit the way it is shown after a number', () => {
    expect(materialUnitLabel('METER')).toBe('м');
    expect(materialUnitLabel('SQUARE_METER')).toBe('м²');
    expect(materialUnitLabel('PIECE')).toBe('шт');
  });

  it('gives nothing for a unit that is missing or unknown', () => {
    expect(materialUnitLabel(null)).toBe('');
    expect(materialUnitLabel(undefined)).toBe('');
    expect(materialUnitLabel('BARREL')).toBe('');
  });
});
