import {
  defineField,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { money } from 'src/objects/money-field';

export default defineField({
  ...money(IDS.person.owes, 'owes', 'Должен'),
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
});
