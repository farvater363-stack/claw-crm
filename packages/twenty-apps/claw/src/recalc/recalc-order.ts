import { type CoreApiClient } from 'twenty-client-sdk/core';

import { planOrderRecalc } from 'src/pricing/plan-order-recalc';
import { applyRecalcPlan } from 'src/recalc/apply-recalc-plan';
import { loadRecalcInput } from 'src/recalc/load-recalc-input';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';
import { syncOrderMaterials } from 'src/warehouse/sync-order-materials';

export const recalcOrder = async (
  client: CoreApiClient,
  orderId: string,
  options: {
    refreshPriceItemIds?: string[];
    refreshPriceExtraServiceLineIds?: string[];
    isEnteringWrittenOff?: boolean;
  } = {},
): Promise<void> => {
  const input = await loadRecalcInput(client, orderId, {
    refreshPriceItemIds: options.refreshPriceItemIds ?? [],
    refreshPriceExtraServiceLineIds:
      options.refreshPriceExtraServiceLineIds ?? [],
  });

  if (input === null) {
    return;
  }

  await applyRecalcPlan(client, orderId, planOrderRecalc(input));

  if (
    await syncOrderMaterials(client, orderId, {
      isEnteringWrittenOff: options.isEnteringWrittenOff,
    })
  ) {
    await recalcWarehouse(client);
  }
};
