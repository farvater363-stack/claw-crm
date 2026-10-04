import { describe, expect, it } from 'vitest';

import { changesNoCompositionField } from 'src/warehouse/changes-no-composition-field';

const updated = (...updatedFields: string[]) => ({
  properties: { updatedFields },
});

describe('changesNoCompositionField', () => {
  it('is true for the rename the recalc writes, which also stamps who updated the row', () => {
    expect(changesNoCompositionField([updated('name', 'updatedBy')])).toBe(
      true,
    );
  });

  it('is true when every event of the batch changed only the name', () => {
    expect(changesNoCompositionField([updated('name'), updated('name')])).toBe(
      true,
    );
  });

  it.each([
    'materialId',
    'designId',
    'extraServiceId',
    'quantityPerUnit',
    'material',
    'design',
    'extraService',
  ])('is false when %s changed next to other fields', (field) => {
    expect(
      changesNoCompositionField([updated('name', field, 'updatedBy')]),
    ).toBe(false);
  });

  it('is false when a batch mixes a rename with an amount edit', () => {
    expect(
      changesNoCompositionField([
        updated('name', 'updatedBy'),
        updated('quantityPerUnit', 'updatedBy'),
      ]),
    ).toBe(false);
  });

  it('is false when an event does not say what changed', () => {
    expect(
      changesNoCompositionField([updated('name'), { properties: {} }]),
    ).toBe(false);
  });

  it('is false for an empty batch', () => {
    expect(changesNoCompositionField([])).toBe(false);
  });
});
