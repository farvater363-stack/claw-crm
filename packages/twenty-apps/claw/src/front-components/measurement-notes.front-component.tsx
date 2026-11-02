import { defineFrontComponent } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { OrderMediaWidget } from 'src/order-notes/order-media-widget';

export default defineFrontComponent({
  universalIdentifier: IDS.measurementNotes.frontComponent,
  name: 'measurement-notes',
  description:
    'Фото и заметки заказа: от замера, офиса и цеха, в одном месте и с добавлением',
  component: OrderMediaWidget,
});
