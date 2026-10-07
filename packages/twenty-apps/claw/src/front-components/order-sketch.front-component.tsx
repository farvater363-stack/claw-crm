import { defineFrontComponent } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { OrderSketch } from 'src/order-sketch/order-sketch-screen';

export default defineFrontComponent({
  universalIdentifier: IDS.orderSketch.frontComponent,
  name: 'order-sketch',
  description: 'Схема заказа: каждый проём с размерами и выносом',
  component: OrderSketch,
});
