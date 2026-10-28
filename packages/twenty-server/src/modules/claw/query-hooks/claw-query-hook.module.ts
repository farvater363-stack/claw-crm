import { Module } from '@nestjs/common';

import {
  OrderCancelCreateManyPreQueryHook,
  OrderCancelCreateOnePreQueryHook,
  OrderCancelUpdateManyPreQueryHook,
  OrderCancelUpdateOnePreQueryHook,
} from 'src/modules/claw/query-hooks/order-cancel.pre-query.hooks';

@Module({
  providers: [
    OrderCancelUpdateOnePreQueryHook,
    OrderCancelUpdateManyPreQueryHook,
    OrderCancelCreateOnePreQueryHook,
    OrderCancelCreateManyPreQueryHook,
  ],
})
export class ClawQueryHookModule {}
