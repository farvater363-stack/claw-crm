import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const ids = VIEW_PART_IDS.ownerDashboard;
const { material } = IDS;

// BUY and LOW are exactly the materials with toBuy > 0.
export default defineView({
  universalIdentifier: IDS.view.dashboardPurchasePlan,
  name: 'Купить',
  objectUniversalIdentifier: material.object,
  type: ViewType.TABLE_WIDGET,
  fields: toKeyedViewFields([
    { field: material.name, viewField: ids.purchasePlanFields.name, size: 220 },
    { field: material.unit, viewField: ids.purchasePlanFields.unit, size: 70 },
    {
      field: material.toBuy,
      viewField: ids.purchasePlanFields.toBuy,
      size: 110,
    },
    {
      field: material.onHand,
      viewField: ids.purchasePlanFields.onHand,
      size: 120,
      isVisible: false,
    },
    {
      field: material.reserved,
      viewField: ids.purchasePlanFields.reserved,
      size: 170,
      isVisible: false,
    },
  ]),
  filters: [
    {
      universalIdentifier: ids.purchasePlanFilterState,
      fieldMetadataUniversalIdentifier: material.stockState,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify(['BUY', 'LOW']),
    },
  ],
  sorts: [
    {
      universalIdentifier: ids.purchasePlanSortState,
      fieldMetadataUniversalIdentifier: material.stockState,
      direction: ViewSortDirection.ASC,
    },
  ],
});
