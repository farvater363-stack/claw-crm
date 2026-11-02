import { useSelectedRecordIds } from 'twenty-sdk/front-component';

import { OrderMediaBlock } from 'src/order-notes/order-media-block';

export const OrderMediaWidget = () => {
  const selectedRecordIds = useSelectedRecordIds();
  const orderId = selectedRecordIds.length === 1 ? selectedRecordIds[0] : null;

  return orderId === null || orderId === undefined ? null : (
    <OrderMediaBlock key={orderId} orderId={orderId} canFloat={false} />
  );
};
