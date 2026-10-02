import { type CoreApiClient } from 'twenty-client-sdk/core';

import { applyWarehouseRecalcPlan } from 'src/warehouse/apply-warehouse-recalc-plan';
import { loadWarehouseRecalcInput } from 'src/warehouse/load-warehouse-recalc-input';
import { planWarehouseRecalc } from 'src/warehouse/plan-warehouse-recalc';

// ponytail: full recalc of every material on each change, fine for tens of materials and a few thousand movements;
// narrow it to the touched material if a run ever shows up as slow in the logic function logs.
// Two overlapping runs can briefly write values from an older read; the next event or the nightly run corrects them.
export const recalcWarehouse = async (client: CoreApiClient): Promise<void> => {
  const input = await loadWarehouseRecalcInput(client);

  await applyWarehouseRecalcPlan(client, planWarehouseRecalc(input));
};
