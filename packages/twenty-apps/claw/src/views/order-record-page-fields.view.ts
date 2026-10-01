import { defineView, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { order } = IDS;
const { fields, groups } = VIEW_PART_IDS.orderRecordPage;

const section = (
  group: string,
  names: readonly (keyof typeof fields & keyof typeof order)[],
) =>
  names.map((name) => ({ field: order[name], viewField: fields[name], group }));

// Sections a role cannot read any field of disappear for that role.
export default defineView({
  universalIdentifier: VIEW_PART_IDS.orderRecordPage.view,
  name: 'Карточка заказа',
  objectUniversalIdentifier: order.object,
  type: ViewType.FIELDS_WIDGET,
  fieldGroups: [
    { universalIdentifier: groups.order, name: 'Заказ', position: 0, isVisible: true },
    { universalIdentifier: groups.client, name: 'Клиент', position: 1, isVisible: true },
    { universalIdentifier: groups.measurement, name: 'Замер', position: 2, isVisible: true },
    { universalIdentifier: groups.itemsAndTotal, name: 'Позиции и сумма', position: 3, isVisible: true },
    { universalIdentifier: groups.production, name: 'Производство', position: 4, isVisible: true },
    { universalIdentifier: groups.economics, name: 'Экономика', position: 5, isVisible: true },
    { universalIdentifier: groups.pay, name: 'ЗП', position: 6, isVisible: true },
  ],
  fields: toKeyedViewFields([
    ...section(groups.order, ['name', 'status']),
    ...section(groups.client, [
      'clientName',
      'clientPhone',
      'district',
      'address',
      'floor',
      'source',
      'client',
    ]),
    ...section(groups.measurement, ['measurementDate', 'measurer', 'comment']),
    ...section(groups.itemsAndTotal, [
      'items',
      'extraServices',
      'areaSquareMeters',
      'total',
      'prepayment',
      'balance',
    ]),
    ...section(groups.production, [
      'manager',
      'master',
      'productionStartDate',
      'installationDeadline',
      'deadlineState',
      'installedAt',
      'finishedPhotos',
    ]),
    ...section(groups.economics, ['costTotal', 'margin', 'marginPercent']),
    ...section(groups.pay, [
      'daysLate',
      'masterPayCalculated',
      'masterBonus',
      'masterPayTotal',
      'masterPayPaid',
    ]),
    { field: order.number, viewField: fields.number, isVisible: false },
  ]),
});
