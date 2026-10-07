import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  ViewFilterOperand,
  ViewType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { person } = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS;
const ids = VIEW_PART_IDS.clientsCanMessage;

// The list a mailing is exported from: only clients who agreed to messages.
export default defineView({
  universalIdentifier: IDS.view.clientsCanMessage,
  name: 'Можно писать',
  objectUniversalIdentifier: person.universalIdentifier,
  type: ViewType.TABLE,
  icon: 'IconMessageCheck',
  position: 12,
  fields: toKeyedViewFields([
    {
      field: person.fields.name.universalIdentifier,
      viewField: ids.fields.name,
      size: 200,
    },
    {
      field: person.fields.phones.universalIdentifier,
      viewField: ids.fields.phones,
      size: 160,
    },
    {
      field: IDS.person.clientStatus,
      viewField: ids.fields.clientStatus,
      size: 120,
    },
    { field: IDS.person.source, viewField: ids.fields.source, size: 140 },
    { field: IDS.person.district, viewField: ids.fields.district, size: 160 },
    {
      field: IDS.person.lastOrderAt,
      viewField: ids.fields.lastOrderAt,
      size: 140,
    },
    {
      field: IDS.person.totalSpent,
      viewField: ids.fields.totalSpent,
      size: 140,
    },
  ]),
  filters: [
    {
      universalIdentifier: ids.filterCanMessage,
      fieldMetadataUniversalIdentifier: IDS.person.canMessage,
      operand: ViewFilterOperand.IS,
      value: 'true',
    },
  ],
});
