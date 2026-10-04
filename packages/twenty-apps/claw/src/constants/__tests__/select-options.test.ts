import { describe, expect, it } from 'vitest';

import { materialUnitLabel } from 'src/constants/select-options';

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
