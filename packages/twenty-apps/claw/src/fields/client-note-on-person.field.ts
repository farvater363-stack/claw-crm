import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: IDS.person.clientNote,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'clientNote',
  label: 'Заметка',
  icon: 'IconNote',
  isNullable: true,
});
