import { defineView, ViewSortDirection, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { allOrdersFields } = VIEW_PART_IDS;
const fieldNames = Object.keys(
  allOrdersFields,
) as (keyof typeof allOrdersFields)[];

// Money and people near the left; everything else stays reachable from the view's field menu.
export default defineView({
  universalIdentifier: IDS.view.allOrders,
  name: 'Все заказы',
  objectUniversalIdentifier: IDS.order.object,
  type: ViewType.TABLE,
  icon: 'IconList',
  position: 1,
  fields: toKeyedViewFields(
    fieldNames.map((name) => ({
      field: IDS.order[name],
      viewField: allOrdersFields[name],
    })),
  ),
  sorts: [
    {
      universalIdentifier: VIEW_PART_IDS.allOrdersSortNumber,
      fieldMetadataUniversalIdentifier: IDS.order.number,
      direction: ViewSortDirection.DESC,
    },
  ],
});
