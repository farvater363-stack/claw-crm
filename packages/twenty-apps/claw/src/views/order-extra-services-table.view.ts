import { defineView, ViewFilterOperand, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { orderExtraService } = IDS;
const ids = VIEW_PART_IDS.orderRecordPage;

// Widths in px, wide enough that Russian column headers do not truncate.
const COLUMN_WIDTHS = {
  extraService: 180,
  quantity: 230,
  price: 110,
  lineTotal: 130,
  cost: 140,
  lineCost: 170,
} as const satisfies Record<keyof typeof ids.extraServicesTableFields, number>;
const fieldNames = Object.keys(
  ids.extraServicesTableFields,
) as (keyof typeof ids.extraServicesTableFields)[];

export default defineView({
  universalIdentifier: IDS.view.orderExtraServicesTable,
  name: 'Доп. услуги заказа',
  objectUniversalIdentifier: orderExtraService.object,
  type: ViewType.TABLE_WIDGET,
  fields: toKeyedViewFields(
    fieldNames.map((name) => ({
      field: orderExtraService[name],
      viewField: ids.extraServicesTableFields[name],
      size: COLUMN_WIDTHS[name],
    })),
  ),
  filters: [
    {
      universalIdentifier: ids.extraServicesTableFilter,
      fieldMetadataUniversalIdentifier: orderExtraService.order,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify({
        selectedRecordIds: [],
        isCurrentRecordSelected: true,
      }),
    },
  ],
});
