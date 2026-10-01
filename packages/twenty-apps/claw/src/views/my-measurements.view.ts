import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import {
  ORDER_STATUS_OPTIONS,
  type OrderStatus,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toViewFields } from 'src/utils/to-view-fields';

const MY_MEASUREMENT_STATUSES: OrderStatus[] = [
  'MEASUREMENT_SCHEDULED',
  'MEASURED',
];

export default defineView({
  universalIdentifier: IDS.view.myMeasurements,
  name: 'Мои замеры',
  objectUniversalIdentifier: IDS.order.object,
  type: ViewType.KANBAN,
  icon: 'IconRuler2',
  position: 1,
  // Two columns in option order: «Замер назначен», then «Замер выполнен».
  mainGroupByFieldMetadataUniversalIdentifier: IDS.order.status,
  groups: ORDER_STATUS_OPTIONS.map((option, position) => ({
    universalIdentifier: VIEW_PART_IDS.myMeasurementsGroups[position],
    fieldValue: option.value,
    position,
    isVisible: MY_MEASUREMENT_STATUSES.includes(option.value),
  })),
  fields: [
    ...toViewFields(
      [
        IDS.order.name,
        IDS.order.measurementDate,
        IDS.order.clientName,
        IDS.order.clientPhone,
        IDS.order.district,
        IDS.order.address,
        IDS.order.floor,
      ],
      VIEW_PART_IDS.myMeasurementsFields,
    ),
    {
      universalIdentifier: VIEW_PART_IDS.myMeasurementsStatusField,
      fieldMetadataUniversalIdentifier: IDS.order.status,
      position: 7,
      isVisible: true,
    },
  ],
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
      value: JSON.stringify(MY_MEASUREMENT_STATUSES),
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
