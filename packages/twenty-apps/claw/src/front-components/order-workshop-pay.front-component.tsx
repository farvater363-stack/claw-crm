import { defineFrontComponent } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { OrderWorkshopPay } from 'src/payroll/order-workshop-pay';

export default defineFrontComponent({
  universalIdentifier: IDS.workshopPay.frontComponent,
  name: 'order-workshop-pay',
  description: 'Оплата цеха по заказу: каждый проём по ставке своей решётки',
  component: OrderWorkshopPay,
});
