import { defineView, ViewSortDirection, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const ids = VIEW_PART_IDS.warehouse;
const { material } = IDS;

export default defineView({
  universalIdentifier: IDS.view.warehouseMaterials,
  name: 'Материалы',
  objectUniversalIdentifier: material.object,
  type: ViewType.TABLE,
  icon: 'IconBox',
  position: 0,
  fields: toKeyedViewFields([
    { field: material.name, viewField: ids.materialsFields.name, size: 200 },
    { field: material.unit, viewField: ids.materialsFields.unit, size: 70 },
    {
      field: material.stockState,
      viewField: ids.materialsFields.stockState,
      size: 160,
    },
    { field: material.onHand, viewField: ids.materialsFields.onHand },
    { field: material.reserved, viewField: ids.materialsFields.reserved },
    { field: material.available, viewField: ids.materialsFields.available },
    { field: material.toBuy, viewField: ids.materialsFields.toBuy },
    {
      field: material.minimumStock,
      viewField: ids.materialsFields.minimumStock,
    },
    {
      field: material.safetyPercent,
      viewField: ids.materialsFields.safetyPercent,
    },
  ]),
  sorts: [
    {
      universalIdentifier: ids.materialsSortState,
      fieldMetadataUniversalIdentifier: material.stockState,
      direction: ViewSortDirection.ASC,
    },
    {
      universalIdentifier: ids.materialsSortName,
      fieldMetadataUniversalIdentifier: material.name,
      direction: ViewSortDirection.ASC,
    },
  ],
});
