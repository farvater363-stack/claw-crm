import { defineView, ViewType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toViewFields } from 'src/utils/to-view-fields';

const { order } = IDS;

// Client and openings first: that is what the measurer and the manager open
// an order for. Fields a role cannot read are dropped by the front end.
export default defineView({
  universalIdentifier: VIEW_PART_IDS.orderRecordPage.view,
  name: 'Карточка заказа',
  objectUniversalIdentifier: order.object,
  type: ViewType.FIELDS_WIDGET,
  fields: toViewFields(
    [
      order.name,
      order.status,
      order.clientName,
      order.clientPhone,
      order.district,
      order.address,
      order.floor,
      order.measurementDate,
      order.source,
      order.items,
      order.extraServices,
      order.comment,
      order.measurer,
      order.manager,
      order.master,
      order.client,
      order.productionStartDate,
      order.installationDeadline,
      order.installedAt,
      order.areaSquareMeters,
      order.total,
      order.prepayment,
      order.balance,
      order.costTotal,
      order.margin,
      order.marginPercent,
      order.daysLate,
      order.masterPayCalculated,
      order.masterBonus,
      order.masterPayTotal,
      order.masterPayPaid,
      order.finishedPhotos,
      order.number,
    ],
    VIEW_PART_IDS.orderRecordPage.fields,
  ),
});
