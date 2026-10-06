import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { SOURCE_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: IDS.person.source,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'source',
  label: 'Источник',
  icon: 'IconSpeakerphone',
  isNullable: true,
  options: SOURCE_OPTIONS,
});
