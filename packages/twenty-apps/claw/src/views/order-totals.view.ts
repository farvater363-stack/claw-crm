import { defineView, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { order } = IDS;
const { totalsFields } = VIEW_PART_IDS.orderRecordPage;

export default defineView({
  universalIdentifier: IDS.view.orderTotals,
  name: 'Итоги заказа',
  objectUniversalIdentifier: order.object,
  type: ViewType.FIELDS_WIDGET,
  fields: toKeyedViewFields(
    (['areaSquareMeters', 'total', 'prepayment', 'balance'] as const).map(
      (name) => ({ field: order[name], viewField: totalsFields[name] }),
    ),
  ),
});
