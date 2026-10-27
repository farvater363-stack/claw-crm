import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readScreenSnapshot,
  writeScreenSnapshot,
} from 'src/dashboard/screen-snapshot';

const storedItems = new Map<string, string>();

beforeEach(() => {
  storedItems.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storedItems.get(key) ?? null,
    setItem: (key: string, value: string) => storedItems.set(key, value),
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T09:00:00+05:00'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('screen snapshots', () => {
  it('gives back what the screen showed last today', () => {
    writeScreenSnapshot('today', { owed: 31 });

    expect(readScreenSnapshot('today')).toEqual({ owed: 31 });
    expect(readScreenSnapshot('analytics')).toBeNull();
  });

  it("drops yesterday's snapshot", () => {
    writeScreenSnapshot('today', { owed: 31 });
    vi.setSystemTime(new Date('2026-10-28T09:00:00+05:00'));

    expect(readScreenSnapshot('today')).toBeNull();
  });

  it('drops a snapshot of another version or a broken one', () => {
    storedItems.set(
      'claw:screen-snapshot:today',
      JSON.stringify({ version: 0, day: '2026-10-27', data: { owed: 31 } }),
    );
    storedItems.set('claw:screen-snapshot:analytics', '{not json');

    expect(readScreenSnapshot('today')).toBeNull();
    expect(readScreenSnapshot('analytics')).toBeNull();
  });

  it('keeps working when storage refuses a write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });

    expect(() => writeScreenSnapshot('today', { owed: 31 })).not.toThrow();
  });
});
