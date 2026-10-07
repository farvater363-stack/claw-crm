import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { CALL_BACK_REASON_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: IDS.person.callBackReason,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'callBackReason',
  label: 'Почему перезвонить',
  icon: 'IconPhoneCall',
  isNullable: true,
  options: CALL_BACK_REASON_OPTIONS,
});
