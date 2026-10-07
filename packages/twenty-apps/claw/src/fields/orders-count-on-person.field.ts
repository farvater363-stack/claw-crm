import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: IDS.person.ordersCount,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.NUMBER,
  name: 'ordersCount',
  label: 'Заказов',
  icon: 'IconClipboardList',
  isNullable: true,
});
