import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  ViewType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { person } = IDS;
const { fields, groups, view } = VIEW_PART_IDS.clientRecordPage;

type FieldName = Exclude<keyof typeof fields, 'phones'>;

const section = (group: string, names: readonly FieldName[]) =>
  names.map((name) => ({
    field: person[name],
    viewField: fields[name],
    group,
  }));

export default defineView({
  universalIdentifier: view,
  name: 'Карточка клиента',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: ViewType.FIELDS_WIDGET,
  fieldGroups: [
    {
      universalIdentifier: groups.contacts,
      name: 'Контакты',
      position: 0,
      isVisible: true,
    },
    {
      universalIdentifier: groups.purchases,
      name: 'Покупки',
      position: 1,
      isVisible: true,
    },
    {
      universalIdentifier: groups.calls,
      name: 'Звонки',
      position: 2,
      isVisible: true,
    },
  ],
  fields: toKeyedViewFields([
    {
      field:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.fields.phones
          .universalIdentifier,
      viewField: fields.phones,
      group: groups.contacts,
    },
    ...section(groups.contacts, [
      'telegram',
      'district',
      'address',
      'source',
      'referredBy',
      'referrals',
      'canMessage',
      'clientNote',
    ]),
    ...section(groups.purchases, [
      'clientStatus',
      'ordersCount',
      'totalSpent',
      'owes',
      'quoted',
      'firstOrderAt',
      'lastOrderAt',
      'lastInstalledAt',
      'refusalReason',
    ]),
    ...section(groups.calls, [
      'callBackAt',
      'callBackReason',
      'lastCallAt',
      'lastCallNote',
    ]),
  ]),
});
