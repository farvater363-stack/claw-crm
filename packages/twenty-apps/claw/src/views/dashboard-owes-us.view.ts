import { defineView, ViewFilterOperand, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { STEP_STATUS } from 'src/order-header/order-steps';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const ids = VIEW_PART_IDS.ownerDashboard;

export default defineView({
  universalIdentifier: IDS.view.dashboardOwesUs,
  name: 'Должны нам',
  objectUniversalIdentifier: IDS.order.object,
  type: ViewType.TABLE_WIDGET,
  fields: toKeyedViewFields([
    { field: IDS.order.name, viewField: ids.owesUsFields.name, size: 100 },
    {
      field: IDS.order.clientName,
      viewField: ids.owesUsFields.clientName,
      size: 180,
    },
    {
      field: IDS.order.clientPhone,
      viewField: ids.owesUsFields.clientPhone,
      size: 160,
    },
    { field: IDS.order.total, viewField: ids.owesUsFields.total, size: 130 },
    {
      field: IDS.order.balance,
      viewField: ids.owesUsFields.balance,
      size: 130,
    },
  ]),
  filters: [
    {
      universalIdentifier: ids.owesUsFilterStatus,
      fieldMetadataUniversalIdentifier: IDS.order.status,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify([STEP_STATUS.installed]),
    },
    {
      universalIdentifier: ids.owesUsFilterBalance,
      fieldMetadataUniversalIdentifier: IDS.order.balance,
      operand: ViewFilterOperand.GREATER_THAN_OR_EQUAL,
      subFieldName: 'amountMicros',
      // Whole sums: «at least 1» is «more than 0».
      value: '1',
    },
  ],
});
