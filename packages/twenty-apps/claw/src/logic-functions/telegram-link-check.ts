import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createTelegramRouteDependencies } from 'src/telegram/telegram-route-dependencies';
import {
  checkTelegramLink,
  type TelegramLinkCheckAnswer,
} from 'src/telegram/telegram-routes';

const handler = async (): Promise<TelegramLinkCheckAnswer> =>
  checkTelegramLink(createTelegramRouteDependencies());

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.telegramLinkCheck,
  name: 'telegram-link-check',
  description: 'Links the group where /link with the workspace code was sent',
  timeoutSeconds: 20,
  httpRouteTriggerSettings: {
    path: '/telegram-link-check',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
  handler,
});
