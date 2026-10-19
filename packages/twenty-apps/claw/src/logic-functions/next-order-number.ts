import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { assignOrderNumber } from 'src/recalc/assign-order-number';
import { createRecalcClient } from 'src/recalc/create-recalc-client';

// A measurer may read only their own orders, so the number a new order will
// get is looked up as the application, which sees all of them.
const handler = async (): Promise<{ name: string }> => {
  const { name } = await assignOrderNumber(createRecalcClient());

  return { name };
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.nextOrderNumber,
  name: 'next-order-number',
  description: 'The number the next new order will most likely get',
  timeoutSeconds: 10,
  httpRouteTriggerSettings: {
    path: '/next-order-number',
    httpMethod: 'GET',
    isAuthRequired: true,
  },
  handler,
});
