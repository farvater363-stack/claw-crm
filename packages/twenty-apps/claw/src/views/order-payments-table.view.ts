import { defineView, ViewFilterOperand, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { orderPayment } = IDS;
const ids = VIEW_PART_IDS.orderPayments;

export default defineView({
  universalIdentifier: IDS.view.orderPaymentsTable,
  name: 'Оплаты заказа',
  objectUniversalIdentifier: orderPayment.object,
  type: ViewType.TABLE_WIDGET,
  fields: toKeyedViewFields([
    {
      field: orderPayment.paidOn,
      viewField: ids.tableFields.paidOn,
      size: 130,
    },
    {
      field: orderPayment.method,
      viewField: ids.tableFields.method,
      size: 130,
    },
    {
      field: orderPayment.amount,
      viewField: ids.tableFields.amount,
      size: 150,
    },
    {
      field: orderPayment.receivedBy,
      viewField: ids.tableFields.receivedBy,
      size: 150,
    },
    {
      field: orderPayment.comment,
      viewField: ids.tableFields.comment,
      size: 240,
    },
  ]),
  filters: [
    {
      universalIdentifier: ids.tableFilter,
      fieldMetadataUniversalIdentifier: orderPayment.order,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify({
        selectedRecordIds: [],
        isCurrentRecordSelected: true,
      }),
    },
  ],
});
