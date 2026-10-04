import { afterEach, describe, expect, it, vi } from 'vitest';

import { randomUuid } from 'src/utils/random-uuid';

// The shape the server accepts as a record id (isValidUuid in twenty-shared).
const SERVER_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUuid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('makes an id the server accepts, a new one each time', () => {
    const ids = Array.from({ length: 50 }, randomUuid);

    for (const id of ids) expect(id).toMatch(SERVER_UUID);
    expect(new Set(ids).size).toBe(50);
  });

  it('still makes one where the page has no crypto at all', () => {
    vi.stubGlobal('crypto', undefined);

    const ids = Array.from({ length: 50 }, randomUuid);

    for (const id of ids) expect(id).toMatch(SERVER_UUID);
    expect(new Set(ids).size).toBe(50);
  });
});
