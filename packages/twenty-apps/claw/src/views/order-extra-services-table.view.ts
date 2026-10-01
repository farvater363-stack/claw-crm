import { defineView, ViewFilterOperand, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { orderExtraService } = IDS;
const ids = VIEW_PART_IDS.orderRecordPage;
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
