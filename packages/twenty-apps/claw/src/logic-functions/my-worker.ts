import { defineLogicFunction } from 'twenty-sdk/define';
import { type LogicFunctionExecutionContext } from 'twenty-sdk/logic-function';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { findWorkerIdByLogin } from 'src/recalc/find-worker-by-login';

// A measurer cannot read workers, so Новый замер asks here for the caller's
// own one. The caller comes from the token, never from the request.
export const handler = async (
  _payload: unknown,
  context: LogicFunctionExecutionContext,
): Promise<{ workerId: string | null }> => ({
  workerId:
    context.workspaceMemberId === null
      ? null
      : await findWorkerIdByLogin(
          createRecalcClient(),
          context.workspaceMemberId,
        ),
});

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.myWorker,
  name: 'my-worker',
  description: 'The worker whose «Логин» is the caller, or null',
  timeoutSeconds: 10,
  httpRouteTriggerSettings: {
    path: '/my-worker',
    httpMethod: 'GET',
    isAuthRequired: true,
  },
  handler,
});
