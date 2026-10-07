import { describe, expect, it } from 'vitest';

import {
  type CallBack,
  callBackAfterCall,
  type ClientOrder,
  computeClientSummary,
  planCallBackOnOrderChange,
} from 'src/clients/client-summary';

const order = (overrides: Partial<ClientOrder>): ClientOrder => ({
  status: 'NEW',
  total: 3_000_000,
  balance: 0,
  createdAt: '2026-09-01T09:00:00.000Z',
  installedAt: null,
  cancelReason: null,
  ...overrides,
});

const NO_CALL: CallBack = { at: null, reason: null };
const TODAY = '2026-10-06';

describe('computeClientSummary', () => {
  it('reads a client with no orders as new with nothing bought', () => {
    expect(computeClientSummary([])).toEqual({
      clientStatus: 'NEW',
      ordersCount: 0,
      totalSpent: 0,
      owes: 0,
      quoted: null,
      firstOrderAt: null,
      lastOrderAt: null,
      lastInstalledAt: null,
      refusalReason: null,
    });
  });

  it('counts a second sale as a repeat client and adds up what they bought', () => {
    const summary = computeClientSummary([
      order({
        status: 'INSTALLED',
        createdAt: '2026-03-02T08:00:00.000Z',
        installedAt: '2026-03-20',
      }),
      order({
        status: 'INSTALLED',
        total: 2_500_000,
        createdAt: '2026-09-10T08:00:00.000Z',
        installedAt: '2026-09-25',
      }),
      order({ status: 'CANCELLED', total: 9_000_000 }),
    ]);

    expect(summary).toMatchObject({
      clientStatus: 'REPEAT',
      ordersCount: 3,
      totalSpent: 5_500_000,
      quoted: null,
      firstOrderAt: '2026-03-02',
      lastOrderAt: '2026-09-10',
      lastInstalledAt: '2026-09-25',
    });
  });

  it('counts only what a client still owes on orders they bought', () => {
    const summary = computeClientSummary([
      order({ status: 'PRODUCTION', balance: 2_000_000 }),
      order({ status: 'MEASURED', balance: 3_000_000 }),
    ]);

    expect(summary.clientStatus).toBe('BOUGHT');
    expect(summary.owes).toBe(2_000_000);
  });

  it('shows the price a measured client is still thinking about', () => {
    const summary = computeClientSummary([
      order({ status: 'MEASURED', total: 4_200_000 }),
    ]);

    expect(summary.clientStatus).toBe('THINKING');
    expect(summary.quoted).toBe(4_200_000);
    expect(summary.totalSpent).toBe(0);
  });

  it('keeps why a client refused when all their orders were cancelled', () => {
    const summary = computeClientSummary([
      order({
        status: 'CANCELLED',
        cancelReason: 'CHANGED_MIND',
        createdAt: '2026-08-01T08:00:00.000Z',
      }),
      order({
        status: 'CANCELLED',
        cancelReason: 'TOO_EXPENSIVE',
        createdAt: '2026-09-01T08:00:00.000Z',
      }),
    ]);

    expect(summary.clientStatus).toBe('REFUSED');
    expect(summary.refusalReason).toBe('TOO_EXPENSIVE');
  });

  it('dates an order by the Tashkent day it came in', () => {
    const summary = computeClientSummary([
      order({ createdAt: '2026-10-05T20:30:00.000Z' }),
    ]);

    expect(summary.lastOrderAt).toBe('2026-10-06');
  });
});

describe('planCallBackOnOrderChange', () => {
  const change = (
    overrides: Partial<Parameters<typeof planCallBackOnOrderChange>[0]>,
  ) =>
    planCallBackOnOrderChange({
      status: 'NEW',
      previousStatus: null,
      cancelReason: null,
      previousCancelReason: null,
      current: NO_CALL,
      today: TODAY,
      ...overrides,
    });

  it('asks to call three days after a measurement', () => {
    expect(
      change({ status: 'MEASURED', previousStatus: 'MEASUREMENT_SCHEDULED' }),
    ).toEqual({ at: '2026-10-09', reason: 'AFTER_MEASUREMENT' });
  });

  it('asks how it went a week after installation', () => {
    expect(
      change({ status: 'INSTALLED', previousStatus: 'QUALITY_CHECK' }),
    ).toEqual({ at: '2026-10-13', reason: 'AFTER_INSTALLATION' });
  });

  it('tries again the next day when the client could not be reached', () => {
    expect(
      change({
        status: 'CANCELLED',
        previousStatus: 'MEASURED',
        cancelReason: 'UNREACHABLE',
      }),
    ).toEqual({ at: '2026-10-07', reason: 'UNREACHABLE' });
  });

  it('drops the wait for a decision once the client buys or refuses', () => {
    const current: CallBack = { at: '2026-10-08', reason: 'AFTER_MEASUREMENT' };

    expect(
      change({ status: 'PRODUCTION', previousStatus: 'MEASURED', current }),
    ).toEqual(NO_CALL);
    expect(
      change({
        status: 'CANCELLED',
        previousStatus: 'MEASURED',
        cancelReason: 'TOO_EXPENSIVE',
        current,
      }),
    ).toEqual(NO_CALL);
  });

  it('keeps a call the manager planned for sooner', () => {
    expect(
      change({
        status: 'MEASURED',
        previousStatus: 'MEASUREMENT_SCHEDULED',
        current: { at: '2026-10-07', reason: 'AGREED' },
      }),
    ).toBeNull();
  });

  it('leaves the call alone when nothing about the order step changed', () => {
    expect(
      change({ status: 'MEASURED', previousStatus: 'MEASURED' }),
    ).toBeNull();
    expect(change({ status: 'PRODUCTION', previousStatus: 'NEW' })).toBeNull();
  });
});

describe('callBackAfterCall', () => {
  it('plans the next call the manager chose', () => {
    expect(
      callBackAfterCall({ result: 'REACHED', nextCallAt: '2026-10-10' }),
    ).toEqual({ at: '2026-10-10', reason: 'AGREED' });
    expect(
      callBackAfterCall({ result: 'NO_ANSWER', nextCallAt: '2026-10-07' }),
    ).toEqual({ at: '2026-10-07', reason: 'UNREACHABLE' });
  });

  it('takes the client off the list when no next call is set', () => {
    expect(callBackAfterCall({ result: 'REFUSED', nextCallAt: null })).toEqual(
      NO_CALL,
    );
  });
});
