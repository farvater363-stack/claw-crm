import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { person } = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS;
const ids = VIEW_PART_IDS.clientsOwe;

export default defineView({
  universalIdentifier: IDS.view.clientsOwe,
  name: 'Должны',
  objectUniversalIdentifier: person.universalIdentifier,
  type: ViewType.TABLE,
  icon: 'IconCash',
  position: 11,
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
    { field: IDS.person.owes, viewField: ids.fields.owes, size: 130 },
    {
      field: IDS.person.totalSpent,
      viewField: ids.fields.totalSpent,
      size: 140,
    },
    {
      field: IDS.person.lastOrderAt,
      viewField: ids.fields.lastOrderAt,
      size: 140,
    },
  ]),
  filters: [
    {
      universalIdentifier: ids.filterOwes,
      fieldMetadataUniversalIdentifier: IDS.person.owes,
      operand: ViewFilterOperand.GREATER_THAN_OR_EQUAL,
      subFieldName: 'amountMicros',
      // Whole sums: «at least 1» is «more than 0».
      value: '1',
    },
  ],
  sorts: [
    {
      universalIdentifier: ids.sortOwes,
      fieldMetadataUniversalIdentifier: IDS.person.owes,
      direction: ViewSortDirection.DESC,
    },
  ],
});
