import { defineFrontComponent } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { OrderContract } from 'src/contract/order-contract-screen';

export default defineFrontComponent({
  universalIdentifier: IDS.contract.orderFrontComponent,
  name: 'order-contract',
  description: 'Договор заказа: подписать, открыть PDF, подписать заново',
  component: OrderContract,
});
