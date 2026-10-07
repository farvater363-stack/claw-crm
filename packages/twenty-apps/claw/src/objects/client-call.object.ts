import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { CALL_RESULT_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';

const { clientCall } = IDS;

// Who called and when are the record's own createdBy and createdAt.
export default defineObject({
  universalIdentifier: clientCall.object,
  nameSingular: 'clientCall',
  namePlural: 'clientCalls',
  labelSingular: 'Звонок',
  labelPlural: 'Звонки',
  icon: 'IconPhoneCall',
  labelIdentifierFieldMetadataUniversalIdentifier: clientCall.name,
  fields: [
    {
      universalIdentifier: clientCall.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Название',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: clientCall.result,
      type: FieldType.SELECT,
      name: 'result',
      label: 'Итог',
      icon: 'IconPhoneCheck',
      isNullable: true,
      options: CALL_RESULT_OPTIONS,
    },
    {
      universalIdentifier: clientCall.note,
      type: FieldType.TEXT,
      name: 'note',
      label: 'Заметка',
      icon: 'IconMessage',
      isNullable: true,
    },
    {
      universalIdentifier: clientCall.nextCallAt,
      type: FieldType.DATE,
      name: 'nextCallAt',
      label: 'Перезвонить',
      icon: 'IconCalendarRepeat',
      isNullable: true,
    },
    {
      universalIdentifier: clientCall.person,
      type: FieldType.RELATION,
      name: 'person',
      label: 'Клиент',
      icon: 'IconUser',
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier: IDS.person.calls,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'personId',
      },
    },
    {
      universalIdentifier: clientCall.order,
      type: FieldType.RELATION,
      name: 'order',
      label: 'Заказ',
      icon: 'IconClipboardList',
      relationTargetObjectMetadataUniversalIdentifier: IDS.order.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.order.calls,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'orderId',
      },
    },
  ],
});
