import { defineObject, FieldType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

const { telegramGroup } = IDS;

// One row per workspace: the group its orders are sent to. Only the app's
// routes read and write it.
export default defineObject({
  universalIdentifier: telegramGroup.object,
  nameSingular: 'telegramGroup',
  namePlural: 'telegramGroups',
  labelSingular: 'Telegram-группа',
  labelPlural: 'Telegram-группы',
  icon: 'IconBrandTelegram',
  labelIdentifierFieldMetadataUniversalIdentifier: telegramGroup.chatTitle,
  fields: [
    {
      universalIdentifier: telegramGroup.chatTitle,
      type: FieldType.TEXT,
      name: 'chatTitle',
      label: 'Группа',
      icon: 'IconUsersGroup',
      isNullable: true,
    },
    {
      universalIdentifier: telegramGroup.chatId,
      type: FieldType.TEXT,
      name: 'chatId',
      label: 'ID чата',
      icon: 'IconHash',
      isNullable: true,
    },
    {
      universalIdentifier: telegramGroup.linkCode,
      type: FieldType.TEXT,
      name: 'linkCode',
      label: 'Код привязки',
      icon: 'IconKey',
      isNullable: true,
    },
  ],
});
