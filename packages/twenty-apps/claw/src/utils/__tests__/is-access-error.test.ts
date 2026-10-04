import { describe, expect, it } from 'vitest';

import { isAccessError } from 'src/utils/is-access-error';

describe('isAccessError', () => {
  it.each([
    new Error('Forbidden: no permission to read this field'),
    new Error('Cannot query field "cost" on type "Design"'),
    'PERMISSION_DENIED',
  ])('takes %s for a refused read', (error) => {
    expect(isAccessError(error)).toBe(true);
  });

  it.each([new Error('Failed to fetch'), 'timeout', null])(
    'does not take %s for one',
    (error) => {
      expect(isAccessError(error)).toBe(false);
    },
  );
});
