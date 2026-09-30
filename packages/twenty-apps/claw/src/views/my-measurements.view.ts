import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toViewFields } from 'src/utils/to-view-fields';

export default defineView({
  universalIdentifier: IDS.view.myMeasurements,
  name: 'Мои замеры',
  objectUniversalIdentifier: IDS.order.object,
  type: ViewType.TABLE,
  icon: 'IconRuler2',
  position: 1,
  fields: toViewFields(
    [
      IDS.order.name, IDS.order.measurementDate, IDS.order.clientName,
      IDS.order.clientPhone, IDS.order.district, IDS.order.address, IDS.order.floor,
    ],
    VIEW_PART_IDS.myMeasurementsFields,
  ),
  filters: [
    {
      universalIdentifier: VIEW_PART_IDS.myMeasurementsFilterMeasurer,
      fieldMetadataUniversalIdentifier: IDS.order.measurer,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify({ isCurrentWorkspaceMemberSelected: true, selectedRecordIds: [] }),
    },
    {
      universalIdentifier: VIEW_PART_IDS.myMeasurementsFilterStatus,
      fieldMetadataUniversalIdentifier: IDS.order.status,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify(['MEASUREMENT_SCHEDULED']),
    },
  ],
  sorts: [
    {
      universalIdentifier: VIEW_PART_IDS.myMeasurementsSortDate,
      fieldMetadataUniversalIdentifier: IDS.order.measurementDate,
      direction: ViewSortDirection.ASC,
    },
  ],
});
