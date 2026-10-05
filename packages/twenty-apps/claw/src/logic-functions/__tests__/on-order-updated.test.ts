import { describe, expect, it } from 'vitest';

import onOrderUpdated from 'src/logic-functions/on-order-updated';

describe('on-order-updated trigger', () => {
  // Recalcs of one order run unlocked, so a late one can write sums computed
  // before a payment existed; watching the sums makes that write recalc again.
  it('recalculates again when the paid sum or the balance changes', () => {
    expect(
      onOrderUpdated.config.databaseEventTriggerSettings?.updatedFields,
    ).toEqual(expect.arrayContaining(['paid', 'balance']));
  });
});
