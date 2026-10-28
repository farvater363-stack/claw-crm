import { Injectable } from '@nestjs/common';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type ResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import {
  assertCallerCanCancelOrder,
  isCancellingOrder,
} from 'src/modules/claw/query-hooks/utils/assert-caller-can-cancel-order.util';

// One hook per key: the decorator takes a single key. Upserts arrive as
// createOne/createMany and can update an existing order's status.
@Injectable()
export class OrderCancelPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: ResolverArgs,
  ): Promise<ResolverArgs> {
    const data = 'data' in payload ? payload.data : undefined;
    const records = Array.isArray(data) ? data : [data];

    if (!isCancellingOrder(records)) {
      return payload;
    }

    // Pre-query hooks run before the runner opens its workspace context.
    await this.workspaceOrmManager.executeInWorkspaceContext(
      () => assertCallerCanCancelOrder(getWorkspaceContext()),
      authContext,
    );

    return payload;
  }
}

@WorkspaceQueryHook(`order.updateOne`)
export class OrderCancelUpdateOnePreQueryHook extends OrderCancelPreQueryHook {}

@WorkspaceQueryHook(`order.updateMany`)
export class OrderCancelUpdateManyPreQueryHook extends OrderCancelPreQueryHook {}

@WorkspaceQueryHook(`order.createOne`)
export class OrderCancelCreateOnePreQueryHook extends OrderCancelPreQueryHook {}

@WorkspaceQueryHook(`order.createMany`)
export class OrderCancelCreateManyPreQueryHook extends OrderCancelPreQueryHook {}
