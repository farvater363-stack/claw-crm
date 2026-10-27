import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createTelegramRouteDependencies } from 'src/telegram/telegram-route-dependencies';
import {
  sendOrderToTelegram,
  type TelegramSendAnswer,
} from 'src/telegram/telegram-routes';

// Run as the application: Цех may not read the client's phone, which the
// installers in the group need.
const handler = async (
  payload: RoutePayload<{ orderId?: unknown }>,
): Promise<TelegramSendAnswer> => {
  const orderId = payload.body?.orderId;

  if (typeof orderId !== 'string' || orderId === '') {
    throw new Error('orderId is required');
  }

  return sendOrderToTelegram(createTelegramRouteDependencies(), orderId);
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.telegramSend,
  name: 'telegram-send',
  description: 'Posts an order, its entrance photos and its point to the group',
  timeoutSeconds: 60,
  httpRouteTriggerSettings: {
    path: '/telegram-send',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
  handler,
});
