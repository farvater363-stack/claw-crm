import { defineApplication } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: IDS.application.app,
  displayName: 'Claw CRM',
  description:
    'Заказы, замеры, цены, маржа и ЗП работников для производства решёток',
});
