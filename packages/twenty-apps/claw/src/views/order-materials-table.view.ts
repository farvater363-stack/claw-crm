import { defineView, ViewFilterOperand, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { orderMaterial } = IDS;
const ids = VIEW_PART_IDS.orderRecordPage;

export default defineView({
  universalIdentifier: IDS.view.orderMaterialsTable,
  name: 'Материалы заказа',
  objectUniversalIdentifier: orderMaterial.object,
  type: ViewType.TABLE_WIDGET,
  fields: toKeyedViewFields([
    {
      field: orderMaterial.material,
      viewField: ids.materialsTableFields.material,
      size: 200,
    },
    {
      field: orderMaterial.plannedQuantity,
      viewField: ids.materialsTableFields.plannedQuantity,
      size: 120,
    },
  ]),
  filters: [
    {
      universalIdentifier: ids.materialsTableFilter,
      fieldMetadataUniversalIdentifier: orderMaterial.order,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify({
        selectedRecordIds: [],
        isCurrentRecordSelected: true,
      }),
    },
  ],
});
