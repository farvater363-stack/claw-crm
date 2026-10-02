import { defineView, ViewSortDirection, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const ids = VIEW_PART_IDS.warehouse.movementsFields;
const { stockMovement } = IDS;

export default defineView({
  universalIdentifier: IDS.view.warehouseMovements,
  name: 'Движения',
  objectUniversalIdentifier: stockMovement.object,
  type: ViewType.TABLE,
  icon: 'IconArrowsExchange',
  position: 0,
  fields: toKeyedViewFields([
    { field: stockMovement.name, viewField: ids.name, size: 280 },
    { field: stockMovement.date, viewField: ids.date },
    { field: stockMovement.kind, viewField: ids.kind, size: 170 },
    { field: stockMovement.material, viewField: ids.material, size: 180 },
    { field: stockMovement.quantity, viewField: ids.quantity },
    { field: stockMovement.countedQuantity, viewField: ids.countedQuantity },
    { field: stockMovement.unitPrice, viewField: ids.unitPrice },
    { field: stockMovement.comment, viewField: ids.comment, size: 220 },
  ]),
  sorts: [
    {
      universalIdentifier: VIEW_PART_IDS.warehouse.movementsSortDate,
      fieldMetadataUniversalIdentifier: stockMovement.date,
      direction: ViewSortDirection.DESC,
    },
  ],
});
