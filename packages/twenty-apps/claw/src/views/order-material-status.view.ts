import { defineView, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { order } = IDS;
const { materialStatusFields } = VIEW_PART_IDS.orderRecordPage;

export default defineView({
  universalIdentifier: IDS.view.orderMaterialStatus,
  name: 'Материал заказа',
  objectUniversalIdentifier: order.object,
  type: ViewType.FIELDS_WIDGET,
  fields: toKeyedViewFields(
    (['materialState', 'materialNote', 'missingNorms'] as const).map(
      (name) => ({
        field: order[name],
        viewField: materialStatusFields[name],
      }),
    ),
  ),
});
