import { AggregateOperations, defineView, ViewType } from 'twenty-sdk/define';

import { ORDER_STATUS_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

export default defineView({
  universalIdentifier: IDS.view.ordersKanban,
  name: 'Доска заказов',
  objectUniversalIdentifier: IDS.order.object,
  type: ViewType.KANBAN,
  icon: 'IconLayoutKanban',
  position: 0,
  mainGroupByFieldMetadataUniversalIdentifier: IDS.order.status,
  kanbanAggregateOperation: AggregateOperations.SUM,
  kanbanAggregateOperationFieldMetadataUniversalIdentifier: IDS.order.total,
  fields: toKeyedViewFields([
    { field: IDS.order.name, viewField: VIEW_PART_IDS.ordersKanbanFields[0] },
    {
      field: IDS.order.clientName,
      viewField: VIEW_PART_IDS.ordersKanbanFields[1],
    },
    {
      field: IDS.order.clientPhone,
      viewField: VIEW_PART_IDS.ordersKanbanExtraFields.clientPhone,
    },
    {
      field: IDS.order.district,
      viewField: VIEW_PART_IDS.ordersKanbanFields[2],
    },
    {
      field: IDS.order.measurementDate,
      viewField: VIEW_PART_IDS.ordersKanbanExtraFields.measurementDate,
    },
    { field: IDS.order.total, viewField: VIEW_PART_IDS.ordersKanbanFields[3] },
    { field: IDS.order.master, viewField: VIEW_PART_IDS.ordersKanbanFields[5] },
    {
      field: IDS.order.installationDeadline,
      viewField: VIEW_PART_IDS.ordersKanbanFields[4],
    },
    {
      field: IDS.order.deadlineState,
      viewField: VIEW_PART_IDS.ordersKanbanExtraFields.deadlineState,
    },
  ]),
  groups: ORDER_STATUS_OPTIONS.map((option, position) => ({
    universalIdentifier: VIEW_PART_IDS.ordersKanbanGroups[option.value],
    fieldValue: option.value,
    position,
    isVisible: true,
  })),
});
