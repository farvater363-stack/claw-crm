import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const ids = VIEW_PART_IDS.warehouse;
const { material } = IDS;

// BUY and LOW are exactly the materials with toBuy > 0, and views have no strict «greater than».
export default defineView({
  universalIdentifier: IDS.view.warehousePurchasePlan,
  name: 'План закупок',
  objectUniversalIdentifier: material.object,
  type: ViewType.TABLE,
  icon: 'IconShoppingCart',
  position: 1,
  fields: toKeyedViewFields([
    { field: material.name, viewField: ids.purchasePlanFields.name, size: 200 },
    { field: material.unit, viewField: ids.purchasePlanFields.unit, size: 70 },
    { field: material.toBuy, viewField: ids.purchasePlanFields.toBuy },
    { field: material.onHand, viewField: ids.purchasePlanFields.onHand },
    { field: material.reserved, viewField: ids.purchasePlanFields.reserved },
    {
      field: material.stockState,
      viewField: ids.purchasePlanFields.stockState,
      size: 160,
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
