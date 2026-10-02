import { defineView, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const ids = VIEW_PART_IDS.warehouse.normsFields;
const { materialNorm } = IDS;

export default defineView({
  universalIdentifier: IDS.view.warehouseNorms,
  name: 'Нормы расхода',
  objectUniversalIdentifier: materialNorm.object,
  type: ViewType.TABLE,
  icon: 'IconRuler',
  position: 0,
  fields: toKeyedViewFields([
    { field: materialNorm.name, viewField: ids.name, size: 240 },
    {
      field: materialNorm.priceListItem,
      viewField: ids.priceListItem,
      size: 220,
    },
    {
      field: materialNorm.extraService,
      viewField: ids.extraService,
      size: 180,
    },
    { field: materialNorm.material, viewField: ids.material, size: 180 },
    { field: materialNorm.quantityPerUnit, viewField: ids.quantityPerUnit },
  ]),
});
