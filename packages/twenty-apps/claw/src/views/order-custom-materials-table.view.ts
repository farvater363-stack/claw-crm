import { defineView, ViewFilterOperand, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { materialNorm } = IDS;
const ids = VIEW_PART_IDS.orderRecordPage;

export default defineView({
  universalIdentifier: IDS.view.orderCustomMaterialsTable,
  name: 'Материалы своего рисунка',
  objectUniversalIdentifier: materialNorm.object,
  type: ViewType.TABLE_WIDGET,
  fields: toKeyedViewFields([
    {
      field: materialNorm.material,
      viewField: ids.customMaterialsTableFields.material,
      size: 220,
    },
    {
      field: materialNorm.quantityPerUnit,
      viewField: ids.customMaterialsTableFields.quantityPerUnit,
      size: 140,
    },
  ]),
  filters: [
    {
      universalIdentifier: ids.customMaterialsTableFilter,
      fieldMetadataUniversalIdentifier: materialNorm.order,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify({
        selectedRecordIds: [],
        isCurrentRecordSelected: true,
      }),
    },
  ],
});
