import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { DISTRICT_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: IDS.person.district,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'district',
  label: 'Район',
  icon: 'IconMapPin',
  isNullable: true,
  options: DISTRICT_OPTIONS,
});
