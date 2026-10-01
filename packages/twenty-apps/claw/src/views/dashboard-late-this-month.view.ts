import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const ids = VIEW_PART_IDS.ownerDashboard;

export default defineView({
  universalIdentifier: IDS.view.dashboardLateThisMonth,
  name: 'Просрочки за месяц',
  objectUniversalIdentifier: IDS.order.object,
  type: ViewType.TABLE_WIDGET,
  fields: toKeyedViewFields([
    { field: IDS.order.name, viewField: ids.lateFields.name, size: 100 },
    { field: IDS.order.master, viewField: ids.lateFields.master, size: 160 },
    {
      field: IDS.order.installationDeadline,
      viewField: ids.lateFields.installationDeadline,
      size: 130,
    },
    { field: IDS.order.readyAt, viewField: ids.lateFields.readyAt, size: 130 },
    {
      field: IDS.order.daysLate,
      viewField: ids.lateFields.daysLate,
      size: 150,
    },
    {
      field: IDS.order.masterPenalty,
      viewField: ids.lateFields.masterPenalty,
      size: 130,
    },
  ]),
  filters: [
    {
      universalIdentifier: ids.lateFilterReadyAt,
      fieldMetadataUniversalIdentifier: IDS.order.readyAt,
      operand: ViewFilterOperand.IS_RELATIVE,
      value: 'THIS_1_MONTH;;Asia/Tashkent;;',
    },
    {
      universalIdentifier: ids.lateFilterDaysLate,
      fieldMetadataUniversalIdentifier: IDS.order.daysLate,
      operand: ViewFilterOperand.GREATER_THAN_OR_EQUAL,
      value: '1',
    },
    {
      universalIdentifier: ids.lateFilterNotCancelled,
      fieldMetadataUniversalIdentifier: IDS.order.status,
      operand: ViewFilterOperand.IS_NOT,
      value: JSON.stringify(['CANCELLED']),
    },
  ],
  sorts: [
    {
      universalIdentifier: ids.lateSortMaster,
      fieldMetadataUniversalIdentifier: IDS.order.master,
      direction: ViewSortDirection.ASC,
    },
  ],
});
