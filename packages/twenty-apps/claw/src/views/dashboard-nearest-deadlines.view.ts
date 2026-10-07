import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { STEP_STATUS } from 'src/order-header/order-steps';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const ids = VIEW_PART_IDS.ownerDashboard;

// The widget that shows this view cuts it to five rows.
export default defineView({
  universalIdentifier: IDS.view.dashboardNearestDeadlines,
  name: 'Ближайшие сроки',
  objectUniversalIdentifier: IDS.order.object,
  type: ViewType.TABLE_WIDGET,
  fields: toKeyedViewFields([
    {
      field: IDS.order.name,
      viewField: ids.nearestDeadlinesFields.name,
      size: 100,
    },
    {
      field: IDS.order.clientFullName,
      viewField: ids.nearestDeadlinesFields.clientFullName,
      size: 180,
    },
    {
      field: IDS.order.installationDeadline,
      viewField: ids.nearestDeadlinesFields.installationDeadline,
      size: 130,
    },
    {
      field: IDS.order.master,
      viewField: ids.nearestDeadlinesFields.master,
      size: 160,
    },
  ]),
  filters: [
    {
      universalIdentifier: ids.nearestDeadlinesFilterStatus,
      fieldMetadataUniversalIdentifier: IDS.order.status,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify([STEP_STATUS.production]),
    },
  ],
  sorts: [
    {
      universalIdentifier: ids.nearestDeadlinesSortDeadline,
      fieldMetadataUniversalIdentifier: IDS.order.installationDeadline,
      direction: ViewSortDirection.ASC,
    },
  ],
});
