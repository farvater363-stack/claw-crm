import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { person } = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS;
const ids = VIEW_PART_IDS.clients;

export default defineView({
  universalIdentifier: IDS.view.clients,
  name: 'Клиенты',
  objectUniversalIdentifier: person.universalIdentifier,
  type: ViewType.TABLE,
  icon: 'IconUsers',
  position: 10,
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
    {
      field: IDS.person.callBackAt,
      viewField: ids.fields.callBackAt,
      size: 130,
    },
    {
      field: IDS.person.ordersCount,
      viewField: ids.fields.ordersCount,
      size: 90,
    },
    {
      field: IDS.person.totalSpent,
      viewField: ids.fields.totalSpent,
      size: 140,
    },
    { field: IDS.person.owes, viewField: ids.fields.owes, size: 130 },
    {
      field: IDS.person.lastOrderAt,
      viewField: ids.fields.lastOrderAt,
      size: 140,
    },
    { field: IDS.person.source, viewField: ids.fields.source, size: 140 },
    { field: IDS.person.district, viewField: ids.fields.district, size: 160 },
    {
      field: IDS.person.lastCallNote,
      viewField: ids.fields.lastCallNote,
      size: 220,
    },
    {
      field: IDS.person.canMessage,
      viewField: ids.fields.canMessage,
      size: 120,
    },
  ]),
  sorts: [
    {
      universalIdentifier: ids.sortLastOrder,
      fieldMetadataUniversalIdentifier: IDS.person.lastOrderAt,
      direction: ViewSortDirection.DESC,
    },
  ],
});
