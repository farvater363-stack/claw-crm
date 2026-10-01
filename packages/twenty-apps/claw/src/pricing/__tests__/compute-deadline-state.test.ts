import { describe, expect, it } from 'vitest';

import { computeDeadlineState } from 'src/pricing/compute-deadline-state';

describe('computeDeadlineState', () => {
  const today = '2026-10-01';

  it.each([
    ['PRODUCTION', null, null],
    ['PRODUCTION', '2026-10-05', 'ON_TIME'],
    ['PRODUCTION', '2026-10-01', 'DUE_TODAY'],
    ['QUALITY_CHECK', '2026-09-28', 'OVERDUE'],
    ['READY', '2026-09-28', null],
    ['INSTALLED', '2026-09-28', null],
    ['CLOSED', '2026-09-28', null],
    ['CANCELLED', '2026-09-28', null],
  ] as const)('%s with deadline %s is %s', (status, deadline, expected) => {
    expect(computeDeadlineState({ status, deadline, today })).toBe(expected);
  });
});
