import { defineView, ViewFilterOperand, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { orderMaterial } = IDS;
const ids = VIEW_PART_IDS.orderRecordPage;

const COLUMN_WIDTHS = {
  material: 200,
  plannedQuantity: 120,
  writtenOffQuantity: 120,
  actualQuantity: 130,
} as const satisfies Record<keyof typeof ids.materialsTableFields, number>;
const fieldNames = Object.keys(
  ids.materialsTableFields,
) as (keyof typeof ids.materialsTableFields)[];

export default defineView({
  universalIdentifier: IDS.view.orderMaterialsTable,
  name: 'Материалы заказа',
  objectUniversalIdentifier: orderMaterial.object,
  type: ViewType.TABLE_WIDGET,
  fields: toKeyedViewFields(
    fieldNames.map((name) => ({
      field: orderMaterial[name],
      viewField: ids.materialsTableFields[name],
      size: COLUMN_WIDTHS[name],
    })),
  ),
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
