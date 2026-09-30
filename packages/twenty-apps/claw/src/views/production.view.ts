import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toViewFields } from 'src/utils/to-view-fields';

export default defineView({
  universalIdentifier: IDS.view.production,
  name: 'Производство',
  objectUniversalIdentifier: IDS.order.object,
  type: ViewType.TABLE,
  icon: 'IconHammer',
  position: 2,
  fields: toViewFields(
    [
      IDS.order.name, IDS.order.status, IDS.order.clientName, IDS.order.address,
      IDS.order.master, IDS.order.installationDeadline, IDS.order.finishedPhotos,
    ],
    VIEW_PART_IDS.productionFields,
  ),
  filters: [
    {
      universalIdentifier: VIEW_PART_IDS.productionFilterStatus,
      fieldMetadataUniversalIdentifier: IDS.order.status,
      operand: ViewFilterOperand.IS,
      value: JSON.stringify(['PRODUCTION', 'QUALITY_CHECK']),
    },
  ],
  sorts: [
    {
      universalIdentifier: VIEW_PART_IDS.productionSortDeadline,
      fieldMetadataUniversalIdentifier: IDS.order.installationDeadline,
      direction: ViewSortDirection.ASC,
    },
  ],
});
