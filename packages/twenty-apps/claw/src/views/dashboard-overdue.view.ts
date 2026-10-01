import { defineView, ViewFilterOperand, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const ids = VIEW_PART_IDS.ownerDashboard;

export default defineView({
  universalIdentifier: IDS.view.dashboardOverdue,
  name: 'Просрочены',
  objectUniversalIdentifier: IDS.order.object,
  type: ViewType.TABLE_WIDGET,
  fields: toKeyedViewFields([
    { field: IDS.order.name, viewField: ids.overdueFields.name, size: 100 },
    { field: IDS.order.master, viewField: ids.overdueFields.master, size: 160 },
    {
      field: IDS.order.installationDeadline,
      viewField: ids.overdueFields.installationDeadline,
      size: 130,
    },
    { field: IDS.order.status, viewField: ids.overdueFields.status, size: 170 },
  ]),
  filters: [
    {
      universalIdentifier: ids.overdueFilter,
      fieldMetadataUniversalIdentifier: IDS.order.deadlineState,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify(['OVERDUE']),
    },
  ],
});
