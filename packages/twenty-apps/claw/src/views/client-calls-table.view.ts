import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { clientCall } = IDS;
const ids = VIEW_PART_IDS.clientCalls;

export default defineView({
  universalIdentifier: IDS.view.clientCallsTable,
  name: 'Звонки клиента',
  objectUniversalIdentifier: clientCall.object,
  type: ViewType.TABLE_WIDGET,
  fields: toKeyedViewFields([
    {
      field: clientCall.createdAt,
      viewField: ids.tableFields.createdAt,
      size: 150,
    },
    { field: clientCall.result, viewField: ids.tableFields.result, size: 130 },
    { field: clientCall.note, viewField: ids.tableFields.note, size: 260 },
    {
      field: clientCall.nextCallAt,
      viewField: ids.tableFields.nextCallAt,
      size: 130,
    },
    { field: clientCall.order, viewField: ids.tableFields.order, size: 110 },
    {
      field: clientCall.createdBy,
      viewField: ids.tableFields.createdBy,
      size: 150,
    },
  ]),
  filters: [
    {
      universalIdentifier: ids.tableFilter,
      fieldMetadataUniversalIdentifier: clientCall.person,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify({
        selectedRecordIds: [],
        isCurrentRecordSelected: true,
      }),
    },
  ],
  sorts: [
    {
      universalIdentifier: ids.tableSort,
      fieldMetadataUniversalIdentifier: clientCall.createdAt,
      direction: ViewSortDirection.DESC,
    },
  ],
});
