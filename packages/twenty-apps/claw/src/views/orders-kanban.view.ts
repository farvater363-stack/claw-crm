import { AggregateOperations, defineView, ViewType } from 'twenty-sdk/define';

import { ORDER_STATUS_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toViewFields } from 'src/utils/to-view-fields';

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
  fields: toViewFields(
    [
      IDS.order.name,
      IDS.order.clientName,
      IDS.order.district,
      IDS.order.total,
      IDS.order.installationDeadline,
      IDS.order.master,
    ],
    VIEW_PART_IDS.ordersKanbanFields,
  ),
  groups: ORDER_STATUS_OPTIONS.map((option, position) => ({
    universalIdentifier: VIEW_PART_IDS.ordersKanbanGroups[position],
    fieldValue: option.value,
    position,
    isVisible: true,
  })),
});
