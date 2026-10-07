import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

// `address` is a reserved metadata name, as on the order.
export default defineField({
  universalIdentifier: IDS.person.address,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'addressLine',
  label: 'Адрес',
  icon: 'IconHome',
  isNullable: true,
});
