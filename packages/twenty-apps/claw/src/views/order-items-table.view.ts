import { defineView, ViewFilterOperand, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { orderItem } = IDS;
const ids = VIEW_PART_IDS.orderRecordPage;
const fieldNames = Object.keys(
  ids.itemsTableFields,
) as (keyof typeof ids.itemsTableFields)[];

// Cost columns are listed for admins; field permissions drop them for everyone else.
export default defineView({
  universalIdentifier: IDS.view.orderItemsTable,
  name: 'Проёмы заказа',
  objectUniversalIdentifier: orderItem.object,
  type: ViewType.TABLE_WIDGET,
  fields: toKeyedViewFields(
    fieldNames.map((name) => ({
      field: orderItem[name],
      viewField: ids.itemsTableFields[name],
    })),
  ),
  filters: [
    {
      universalIdentifier: ids.itemsTableFilter,
      fieldMetadataUniversalIdentifier: orderItem.order,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify({
        selectedRecordIds: [],
        isCurrentRecordSelected: true,
      }),
    },
  ],
});
