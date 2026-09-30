import {
  AggregateOperations,
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toViewFields } from 'src/utils/to-view-fields';

const fields = toViewFields(
  [
    IDS.order.name, IDS.order.master, IDS.order.installedAt, IDS.order.areaSquareMeters,
    IDS.order.daysLate, IDS.order.masterPayCalculated, IDS.order.masterBonus,
    IDS.order.masterPayTotal, IDS.order.masterPayPaid,
  ],
  VIEW_PART_IDS.masterPayFields,
).map((field) =>
  field.fieldMetadataUniversalIdentifier === IDS.order.masterPayTotal
    ? { ...field, aggregateOperation: AggregateOperations.SUM }
    : field,
);

// Per-master grouping is a chart on the stage 2 dashboard; the master sort plus the sum footer covers payroll today.
export default defineView({
  universalIdentifier: IDS.view.masterPay,
  name: 'ЗП мастеров',
  objectUniversalIdentifier: IDS.order.object,
  type: ViewType.TABLE,
  icon: 'IconCash',
  position: 3,
  fields,
  filters: [
    {
      universalIdentifier: VIEW_PART_IDS.masterPayFilterStatus,
      fieldMetadataUniversalIdentifier: IDS.order.status,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify(['INSTALLED', 'CLOSED']),
    },
    {
      universalIdentifier: VIEW_PART_IDS.masterPayFilterUnpaid,
      fieldMetadataUniversalIdentifier: IDS.order.masterPayPaid,
      operand: ViewFilterOperand.IS,
      value: 'false',
    },
  ],
  sorts: [
    {
      universalIdentifier: VIEW_PART_IDS.masterPaySortMaster,
      fieldMetadataUniversalIdentifier: IDS.order.master,
      direction: ViewSortDirection.ASC,
    },
    {
      universalIdentifier: VIEW_PART_IDS.masterPaySortInstalledAt,
      fieldMetadataUniversalIdentifier: IDS.order.installedAt,
      direction: ViewSortDirection.ASC,
    },
  ],
});
