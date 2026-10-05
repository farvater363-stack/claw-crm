import { defineView, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { order } = IDS;
const { fields, groups } = VIEW_PART_IDS.orderRecordPage;

type FieldName = keyof typeof fields & keyof typeof order;

const section = (group: string, names: readonly FieldName[]) =>
  names.map((name) => ({ field: order[name], viewField: fields[name], group }));

// Sections a role cannot read any field of disappear for that role.
export default defineView({
  universalIdentifier: VIEW_PART_IDS.orderRecordPage.view,
  name: 'Карточка заказа',
  objectUniversalIdentifier: order.object,
  type: ViewType.FIELDS_WIDGET,
  fieldGroups: [
    {
      universalIdentifier: groups.client,
      name: 'Клиент',
      position: 0,
      isVisible: true,
    },
    {
      universalIdentifier: groups.production,
      name: 'Срок и люди',
      position: 1,
      isVisible: true,
    },
    {
      universalIdentifier: groups.itemsAndTotal,
      name: 'Деньги',
      position: 2,
      isVisible: true,
    },
    {
      universalIdentifier: groups.economics,
      name: 'Экономика',
      position: 3,
      isVisible: true,
    },
  ],
  fields: toKeyedViewFields([
    ...section(groups.client, [
      'clientName',
      'clientPhone',
      'district',
      'address',
      'floor',
      'source',
      'client',
      'measurementDate',
      'measurer',
      'comment',
    ]),
    ...section(groups.production, [
      'isUrgent',
      'master',
      'installer',
      'soldBy',
      'manager',
      'productionStartDate',
      'installationDeadline',
      'readyAt',
      'installedAt',
      'paintColor',
      'productionStage',
      'finishedPhotos',
      // Last, for corrections: the header moves an order forward
      'status',
      'cancelReason',
    ]),
    ...section(groups.itemsAndTotal, [
      'subtotal',
      'discountKind',
      'discountValue',
      'discount',
      'total',
      'paid',
      'balance',
    ]),
    ...section(groups.economics, [
      'costTotal',
      'margin',
      'marginPercent',
      'masterPayCalculated',
      'masterPenalty',
      'masterBonus',
      'masterPayTotal',
      'daysLate',
    ]),
  ]),
});
