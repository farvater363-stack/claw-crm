import { describe, expect, it } from 'vitest';

import { isNameOnlyChange } from 'src/warehouse/is-name-only-change';

const updated = (...updatedFields: string[]) => ({
  properties: { updatedFields },
});

describe('isNameOnlyChange', () => {
  it('is true when every event of the batch changed only the name', () => {
    expect(isNameOnlyChange([updated('name'), updated('name')])).toBe(true);
  });

  it('is false when one event of the batch changed an amount', () => {
    expect(
      isNameOnlyChange([updated('name'), updated('quantityPerUnit')]),
    ).toBe(false);
  });

  it('is false when an event changed the name together with another field', () => {
    expect(isNameOnlyChange([updated('name', 'materialId')])).toBe(false);
  });

  it('is false when the changed fields are unknown', () => {
    expect(isNameOnlyChange([{ properties: {} }])).toBe(false);
    expect(isNameOnlyChange([])).toBe(false);
  });
});
