import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { CANCEL_REASON_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: IDS.person.refusalReason,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'refusalReason',
  label: 'Причина отказа',
  icon: 'IconCircleX',
  isNullable: true,
  options: CANCEL_REASON_OPTIONS,
});
