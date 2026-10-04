import { defineView, ViewFilterOperand, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { orderItem } = IDS;
const ids = VIEW_PART_IDS.orderRecordPage;

// Widths in px, wide enough that Russian column headers do not truncate.
const COLUMN_WIDTHS = {
  design: 150,
  widthCm: 125,
  heightCm: 110,
  projectionCm: 100,
  quantity: 120,
  areaSquareMeters: 120,
  pricePerSquareMeter: 130,
  lineTotal: 130,
  notes: 240,
  costPerSquareMeter: 200,
  lineCost: 170,
} as const satisfies Partial<Record<keyof typeof ids.itemsTableFields, number>>;
// The identifiers keep retired columns, so the widths decide which columns
// the table has.
const fieldNames = Object.keys(COLUMN_WIDTHS) as (keyof typeof COLUMN_WIDTHS)[];

// Cost columns are listed for admins; field permissions drop them for others.
export default defineView({
  universalIdentifier: IDS.view.orderItemsTable,
  name: 'Проёмы заказа',
  objectUniversalIdentifier: orderItem.object,
  type: ViewType.TABLE_WIDGET,
  fields: toKeyedViewFields(
    fieldNames.map((name) => ({
      field: orderItem[name],
      viewField: ids.itemsTableFields[name],
      size: COLUMN_WIDTHS[name],
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
