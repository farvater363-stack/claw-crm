import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { CLIENT_STATUS_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: IDS.person.clientStatus,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'clientStatus',
  label: 'Статус клиента',
  icon: 'IconUserCheck',
  isNullable: true,
  options: CLIENT_STATUS_OPTIONS,
});
