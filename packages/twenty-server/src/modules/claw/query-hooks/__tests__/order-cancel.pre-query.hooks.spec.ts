import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import {
  type ORMWorkspaceContext,
  withWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import {
  OrderCancelCreateManyPreQueryHook,
  OrderCancelUpdateOnePreQueryHook,
} from 'src/modules/claw/query-hooks/order-cancel.pre-query.hooks';

const ORDER_OBJECT_ID = 'order-object-id';
const PAID_FIELD_ID = 'paid-field-id';
const WORKSHOP_ROLE_ID = 'workshop-role-id';
const MANAGER_ROLE_ID = 'manager-role-id';

const userAuthContext = (userWorkspaceId: string) =>
  ({ type: 'user', userWorkspaceId }) as never;

const buildWorkspaceContext = (
  authContext: ORMWorkspaceContext['authContext'],
  { withPaidField = true }: { withPaidField?: boolean } = {},
): ORMWorkspaceContext =>
  ({
    authContext,
    objectIdByNameSingular: { order: ORDER_OBJECT_ID },
    flatObjectMetadataMaps: {
      byUniversalIdentifier: {
        'order-uid': { id: ORDER_OBJECT_ID, fieldIds: [PAID_FIELD_ID] },
      },
      universalIdentifierById: { [ORDER_OBJECT_ID]: 'order-uid' },
    },
    flatFieldMetadataMaps: {
      byUniversalIdentifier: withPaidField
        ? { 'paid-uid': { id: PAID_FIELD_ID, name: 'paid' } }
        : {},
      universalIdentifierById: withPaidField
        ? { [PAID_FIELD_ID]: 'paid-uid' }
        : {},
    },
    permissionsPerRoleId: {
      [WORKSHOP_ROLE_ID]: {
        [ORDER_OBJECT_ID]: {
          restrictedFields: {
            [PAID_FIELD_ID]: { canRead: false, canUpdate: false },
          },
        },
      },
      [MANAGER_ROLE_ID]: {
        [ORDER_OBJECT_ID]: { restrictedFields: {} },
      },
    },
    userWorkspaceRoleMap: {
      workshop: WORKSHOP_ROLE_ID,
      manager: MANAGER_ROLE_ID,
    },
    apiKeyRoleMap: {},
  }) as unknown as ORMWorkspaceContext;

const buildOrmManager = (options?: { withPaidField?: boolean }) => {
  const executeInWorkspaceContext = jest.fn(
    (fn: () => unknown, authContext: ORMWorkspaceContext['authContext']) =>
      Promise.resolve(
        withWorkspaceContext(buildWorkspaceContext(authContext, options), fn),
      ),
  );

  return {
    executeInWorkspaceContext,
  } as unknown as WorkspaceOrmManager & {
    executeInWorkspaceContext: jest.Mock;
  };
};

const cancelPayload = {
  id: 'order-id',
  data: { status: 'CANCELLED' },
} as never;

describe('OrderCancel pre-query hooks', () => {
  it('refuses a cancel from a role that cannot read the payment', async () => {
    const hook = new OrderCancelUpdateOnePreQueryHook(buildOrmManager());

    await expect(
      hook.execute(userAuthContext('workshop'), 'order', cancelPayload),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses an upsert batch that cancels an order', async () => {
    const hook = new OrderCancelCreateManyPreQueryHook(buildOrmManager());

    await expect(
      hook.execute(userAuthContext('workshop'), 'order', {
        data: [{ status: 'PRODUCTION' }, { status: 'CANCELLED' }],
        upsert: true,
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets the workshop write any other status without loading permissions', async () => {
    const ormManager = buildOrmManager();
    const hook = new OrderCancelUpdateOnePreQueryHook(ormManager);
    const payload = { id: 'order-id', data: { status: 'INSTALLED' } } as never;

    await expect(
      hook.execute(userAuthContext('workshop'), 'order', payload),
    ).resolves.toBe(payload);
    expect(ormManager.executeInWorkspaceContext).not.toHaveBeenCalled();
  });

  it('lets a role that reads the payment cancel', async () => {
    const hook = new OrderCancelUpdateOnePreQueryHook(buildOrmManager());

    await expect(
      hook.execute(userAuthContext('manager'), 'order', cancelPayload),
    ).resolves.toBe(cancelPayload);
  });

  it('lets the system context cancel', async () => {
    const hook = new OrderCancelUpdateOnePreQueryHook(buildOrmManager());

    await expect(
      hook.execute({ type: 'system' } as never, 'order', cancelPayload),
    ).resolves.toBe(cancelPayload);
  });

  it('does nothing in a workspace whose order has no paid field', async () => {
    const hook = new OrderCancelUpdateOnePreQueryHook(
      buildOrmManager({ withPaidField: false }),
    );

    await expect(
      hook.execute(userAuthContext('workshop'), 'order', cancelPayload),
    ).resolves.toBe(cancelPayload);
  });
});
