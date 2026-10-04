import { describe, expect, it } from 'vitest';

import { dropKey } from 'src/utils/drop-key';

describe('dropKey', () => {
  it('returns a copy without the key and leaves the original alone', () => {
    const original = { a: 1, b: 2 };

    expect(dropKey(original, 'a')).toEqual({ b: 2 });
    expect(original).toEqual({ a: 1, b: 2 });
  });

  it('copies as is when the key is not there', () => {
    expect(dropKey({ a: 1 }, 'b')).toEqual({ a: 1 });
  });
});
