import { describe, expect, it, vi } from 'vitest';

import onOrderUpdated from 'src/logic-functions/on-order-updated';
import { recalcOrder } from 'src/recalc/recalc-order';

vi.mock('src/recalc/create-recalc-client', () => ({
  createRecalcClient: vi.fn(() => ({ mutation: vi.fn() })),
}));
vi.mock('src/recalc/recalc-order', () => ({ recalcOrder: vi.fn() }));
vi.mock('src/clients/sync-order-client', () => ({ syncOrderClient: vi.fn() }));

const ORDER = {
  status: 'PRODUCTION',
  installedAt: null,
  readyAt: null,
  measuredAt: null,
  name: '№1001',
  number: 1001,
  clientPhone: null,
  clientFullName: null,
  clientId: null,
  cancelReason: null,
  productionStartDate: '2026-10-20',
  installationDeadline: '2026-10-27',
  total: null,
};

const runWith = async (updatedFields: string[]) => {
  vi.mocked(recalcOrder).mockClear();

  await onOrderUpdated.config.handler(
    {
      recordId: 'order-1',
      properties: { before: ORDER, after: ORDER, updatedFields },
    } as never,
    {} as never,
  );

  return vi.mocked(recalcOrder).mock.calls[0]?.[2];
};

describe('on-order-updated trigger', () => {
  // Recalcs of one order run unlocked, so a late one can write sums computed
  // before a payment existed; watching the sums makes that write recalc again.
  it('recalculates again when the paid sum or the balance changes', () => {
    expect(
      onOrderUpdated.config.databaseEventTriggerSettings?.updatedFields,
    ).toEqual(expect.arrayContaining(['prepaid', 'paid', 'balance']));
  });

  it('stops early when only the sums the recalc writes came back', async () => {
    expect(
      await runWith(['prepaid', 'paid', 'balance', 'margin', 'updatedBy']),
    ).toMatchObject({
      stopIfUnchanged: true,
    });
  });

  it('runs in full when a person changed anything else with them', async () => {
    expect(await runWith(['paid', 'masterId'])).toMatchObject({
      stopIfUnchanged: false,
    });
  });
});
