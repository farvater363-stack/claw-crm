import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

// Only clients who agreed to messages go into a mailing list.
export default defineField({
  universalIdentifier: IDS.person.canMessage,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.BOOLEAN,
  name: 'canMessage',
  label: 'Можно писать',
  icon: 'IconMessageCheck',
  defaultValue: false,
});
