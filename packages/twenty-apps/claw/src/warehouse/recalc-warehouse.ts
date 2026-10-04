import { type CoreApiClient } from 'twenty-client-sdk/core';

import { applyWarehouseRecalcPlan } from 'src/warehouse/apply-warehouse-recalc-plan';
import { loadWarehouseRecalcInput } from 'src/warehouse/load-warehouse-recalc-input';
import { planWarehouseRecalc } from 'src/warehouse/plan-warehouse-recalc';

// ponytail: full recalc of every material on each change, fine for tens of materials and a few thousand movements;
// narrow it to the touched material if a run ever shows up as slow in the logic function logs.
// Overlapping runs can write values from an older read, and most of what a run writes does not retrigger it,
// so a run that wrote re-reads until nothing is left to write.
export const recalcWarehouse = async (client: CoreApiClient): Promise<void> => {
  for (let pass = 0; pass < 3; pass++) {
    const plan = planWarehouseRecalc(await loadWarehouseRecalcInput(client));

    if (Object.values(plan).every((updates) => updates.length === 0)) return;

    await applyWarehouseRecalcPlan(client, plan);
  }
};
