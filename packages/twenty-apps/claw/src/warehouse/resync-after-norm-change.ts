import { type CoreApiClient } from 'twenty-client-sdk/core';

import { RESERVING_STATUSES } from 'src/constants/order-status-sets';
import { recalcOrder } from 'src/recalc/recalc-order';
import { resyncOrdersHoldingMaterial } from 'src/warehouse/resync-orders-holding-material';

type NormSide =
  | {
      orderId?: string | null;
      designId?: string | null;
      extraServiceId?: string | null;
    }
  | null
  | undefined;

type NormEvent = { properties: { before?: NormSide; after?: NormSide } };

// A «Другая» рисунок's material changes that one order's cost and stock in
// any status, so it is recalculated first; the measured orders are re-planned
// for the catalogue compositions as before.
export const resyncAfterNormChange = async (
  client: CoreApiClient,
  events: NormEvent[],
): Promise<void> => {
  const orderIds = new Set(
    events.flatMap(({ properties }) =>
      [properties.before?.orderId, properties.after?.orderId].filter(
        (orderId): orderId is string =>
          typeof orderId === 'string' && orderId !== '',
      ),
    ),
  );

  for (const orderId of orderIds) {
    try {
      await recalcOrder(client, orderId, { recostCustomItems: true });
    } catch (error) {
      console.error(`resync-after-norm-change: order ${orderId} failed`, error);
    }
  }

  // Rows of one order only touch that order, already recalculated with the
  // warehouse; re-planning every measured order for them would spend the
  // request budget on each quantity typed.
  const isOrderRowsOnly = events.every(({ properties }) =>
    [properties.before, properties.after].every(
      (side) =>
        side === null ||
        side === undefined ||
        (Boolean(side.orderId) && !side.designId && !side.extraServiceId),
    ),
  );

  if (isOrderRowsOnly && orderIds.size > 0) return;

  await resyncOrdersHoldingMaterial(client, RESERVING_STATUSES, orderIds);
};
