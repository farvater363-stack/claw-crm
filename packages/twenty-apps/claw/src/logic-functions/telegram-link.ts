import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createTelegramRouteDependencies } from 'src/telegram/telegram-route-dependencies';
import {
  getTelegramLink,
  type TelegramLinkAnswer,
} from 'src/telegram/telegram-routes';

const handler = async (): Promise<TelegramLinkAnswer> =>
  getTelegramLink(createTelegramRouteDependencies());

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.telegramLink,
  name: 'telegram-link',
  description: 'The Telegram group orders go to, or the code that links one',
  timeoutSeconds: 10,
  httpRouteTriggerSettings: {
    path: '/telegram-link',
    httpMethod: 'GET',
    isAuthRequired: true,
  },
  handler,
});
