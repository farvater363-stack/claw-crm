import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: IDS.person.orders,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'orders',
  label: 'Заказы',
  icon: 'IconClipboardList',
  relationTargetObjectMetadataUniversalIdentifier: IDS.order.object,
  relationTargetFieldMetadataUniversalIdentifier: IDS.order.client,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
