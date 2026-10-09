import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { sha256Hex } from 'src/contract/contract-pdf';

describe('the check code hash', () => {
  it.each(['', 'abc', 'Договор подряда № 1012', 'x'.repeat(1000)])(
    'matches SHA-256 for %#',
    async (text) => {
      expect(await sha256Hex(text)).toBe(
        createHash('sha256').update(text).digest('hex'),
      );
    },
  );
});
