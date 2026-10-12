import { describe, expect, it } from 'vitest';

import { isTemplateCurrent } from 'src/contract/contract-store';

describe('saving the contract template', () => {
  it('goes ahead while the opened version is the newest', () => {
    expect(
      isTemplateCurrent(
        { id: 'template', version: 3 },
        { id: 'template', version: 3 },
      ),
    ).toBe(true);
    expect(isTemplateCurrent({ id: null, version: 0 }, null)).toBe(true);
  });

  it('stops once someone else saved a newer version', () => {
    expect(
      isTemplateCurrent(
        { id: 'template', version: 3 },
        { id: 'template', version: 4 },
      ),
    ).toBe(false);
  });

  it('stops a first save when another first save already landed', () => {
    expect(
      isTemplateCurrent({ id: null, version: 0 }, { id: 'other', version: 1 }),
    ).toBe(false);
  });
});
