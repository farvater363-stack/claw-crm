import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import {
  isStatusIn,
  MEASURER_BOARD_STATUSES,
} from 'src/constants/order-status-sets';
import { ORDER_STATUS_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const fieldIds = VIEW_PART_IDS.myMeasurementsFields;

export default defineView({
  universalIdentifier: IDS.view.myMeasurements,
  name: 'Мои замеры',
  objectUniversalIdentifier: IDS.order.object,
  type: ViewType.KANBAN,
  icon: 'IconRuler2',
  position: 2,
  // Two columns in option order: «Замер назначен», then «Замер выполнен».
  mainGroupByFieldMetadataUniversalIdentifier: IDS.order.status,
  groups: ORDER_STATUS_OPTIONS.map((option, position) => ({
    universalIdentifier: VIEW_PART_IDS.myMeasurementsGroups[option.value],
    fieldValue: option.value,
    position,
    isVisible: isStatusIn(MEASURER_BOARD_STATUSES, option.value),
  })),
  fields: toKeyedViewFields([
    { field: IDS.order.name, viewField: fieldIds[0] },
    { field: IDS.order.measurementDate, viewField: fieldIds[1] },
    {
      field: IDS.order.clientFullName,
      viewField: VIEW_PART_IDS.myMeasurementsClientFullNameField,
    },
    { field: IDS.order.clientPhone, viewField: fieldIds[3] },
    { field: IDS.order.district, viewField: fieldIds[4] },
    { field: IDS.order.address, viewField: fieldIds[5] },
    { field: IDS.order.floor, viewField: fieldIds[6] },
    {
      field: IDS.order.status,
      viewField: VIEW_PART_IDS.myMeasurementsStatusField,
    },
  ]),
  filters: [
    {
      universalIdentifier: VIEW_PART_IDS.myMeasurementsFilterMeasurer,
      fieldMetadataUniversalIdentifier: IDS.order.measurer,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify({
        isCurrentWorkspaceMemberSelected: true,
        selectedRecordIds: [],
      }),
    },
    {
      universalIdentifier: VIEW_PART_IDS.myMeasurementsFilterStatus,
      fieldMetadataUniversalIdentifier: IDS.order.status,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify(MEASURER_BOARD_STATUSES),
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
