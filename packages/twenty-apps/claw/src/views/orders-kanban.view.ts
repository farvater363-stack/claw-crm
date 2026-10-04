import { AggregateOperations, defineView, ViewType } from 'twenty-sdk/define';

import { BOARD_STATUSES } from 'src/constants/order-status-sets';
import { ORDER_STATUS_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { ordersKanbanFields, ordersKanbanExtraFields, ordersKanbanGroups } =
  VIEW_PART_IDS;

export default defineView({
  universalIdentifier: IDS.view.ordersKanban,
  // The menu item takes its label from here
  name: 'Заказы',
  objectUniversalIdentifier: IDS.order.object,
  type: ViewType.KANBAN,
  icon: 'IconLayoutKanban',
  position: 0,
  mainGroupByFieldMetadataUniversalIdentifier: IDS.order.status,
  kanbanAggregateOperation: AggregateOperations.SUM,
  kanbanAggregateOperationFieldMetadataUniversalIdentifier: IDS.order.total,
  fields: toKeyedViewFields([
    { field: IDS.order.name, viewField: ordersKanbanFields[0] },
    { field: IDS.order.clientName, viewField: ordersKanbanFields[1] },
    { field: IDS.order.total, viewField: ordersKanbanFields[3] },
    { field: IDS.order.master, viewField: ordersKanbanFields[5] },
    { field: IDS.order.installationDeadline, viewField: ordersKanbanFields[4] },
    {
      field: IDS.order.deadlineState,
      viewField: ordersKanbanExtraFields.deadlineState,
    },
  ]),
  groups: ORDER_STATUS_OPTIONS.map((option, optionIndex) => {
    const column = BOARD_STATUSES.indexOf(option.value);

    return {
      universalIdentifier: ordersKanbanGroups[option.value],
      fieldValue: option.value,
      // A hidden group sits after the six columns, at a place of its own
      position: column === -1 ? BOARD_STATUSES.length + optionIndex : column,
      isVisible: column !== -1,
    };
  }),
});
