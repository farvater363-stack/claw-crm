import { defineApplication, FieldType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { WEBSITE_IDS } from 'src/website/website-identifiers';

export default defineApplication({
  universalIdentifier: IDS.application.app,
  displayName: 'Claw CRM',
  description:
    'Заказы, замеры, цены, маржа и ЗП мастеров для производства решёток',
  applicationVariables: {
    WEBSITE_OFFER_PERCENT: {
      universalIdentifier: WEBSITE_IDS.offerPercentVariable,
      label: 'Скидка месяца на сайте, %',
      description:
        'Показывается на сайте и учитывается в расчёте. 0 — скидки нет. Действует до конца текущего месяца.',
      type: FieldType.NUMBER,
      value: 10,
    },
  },
});
