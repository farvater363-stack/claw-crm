import { defineFrontComponent } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { OrderLocationBlock } from 'src/location/order-location-block';

export default defineFrontComponent({
  universalIdentifier: IDS.orderLocation.frontComponent,
  name: 'order-location',
  description:
    'Точка заказа на карте, «Как найти», фото входа и отправка в Telegram',
  component: OrderLocationBlock,
});
