import { defineView, ViewFilterOperand, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const ids = VIEW_PART_IDS.ownerDashboard;
const { material } = IDS;

export default defineView({
  universalIdentifier: IDS.view.dashboardOverrun,
  name: 'Уходит больше нормы',
  objectUniversalIdentifier: material.object,
  type: ViewType.TABLE_WIDGET,
  fields: toKeyedViewFields([
    { field: material.name, viewField: ids.overrunFields.name, size: 190 },
    {
      field: material.overrunPercent,
      viewField: ids.overrunFields.overrunPercent,
      size: 140,
    },
  ]),
  filters: [
    {
      universalIdentifier: ids.overrunFilter,
      fieldMetadataUniversalIdentifier: material.overrunPercent,
      operand: ViewFilterOperand.GREATER_THAN_OR_EQUAL,
      value: '5',
    },
  ],
});
