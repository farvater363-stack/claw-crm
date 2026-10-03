import { describe, expect, it } from 'vitest';

import { deterministicUuid } from 'src/utils/deterministic-uuid';

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('deterministicUuid', () => {
  it('returns the same uuid for the same key', () => {
    expect(deterministicUuid('writeoff:line-1')).toBe(
      deterministicUuid('writeoff:line-1'),
    );
  });

  it('returns different uuids for different keys', () => {
    expect(deterministicUuid('writeoff:line-1')).not.toBe(
      deterministicUuid('fact:line-1'),
    );
  });

  it('looks like a version 5 uuid', () => {
    expect(deterministicUuid('orderMaterial:order-1:material-1')).toMatch(
      UUID_V5,
    );
  });
});
