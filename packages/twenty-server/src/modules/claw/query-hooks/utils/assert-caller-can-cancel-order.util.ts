import { msg } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { isSystemAuthContext } from 'src/engine/core-modules/auth/guards/is-system-auth-context.guard';
import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { findManyFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-many-flat-entity-by-id-in-flat-entity-maps.util';
import { type ORMWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRoleIdsFromAuthContext } from 'src/engine/twenty-orm/utils/resolve-role-ids-from-auth-context.util';

export const ORDER_CANCELLED_STATUS = 'CANCELLED';

export const isCancellingOrder = (records: unknown[]): boolean =>
  records.some(
    (record) =>
      isDefined(record) &&
      typeof record === 'object' &&
      'status' in record &&
      record.status === ORDER_CANCELLED_STATUS,
  );

// Claw: a login that cannot read what was paid cannot say whether it was
// refunded, so it may not cancel. A row rule would also hide cancelled orders
// from it, since Twenty applies row rules to reads too.
export const assertCallerCanCancelOrder = (
  workspaceContext: ORMWorkspaceContext,
): void => {
  const {
    authContext,
    objectIdByNameSingular,
    flatObjectMetadataMaps,
    flatFieldMetadataMaps,
    permissionsPerRoleId,
    userWorkspaceRoleMap,
    apiKeyRoleMap,
  } = workspaceContext;

  if (isSystemAuthContext(authContext)) {
    return;
  }

  const orderObjectId = objectIdByNameSingular.order;

  if (!isDefined(orderObjectId)) {
    return;
  }

  const orderObject = findFlatEntityByIdInFlatEntityMaps({
    flatEntityMaps: flatObjectMetadataMaps,
    flatEntityId: orderObjectId,
  });

  const paidField = findManyFlatEntityByIdInFlatEntityMaps({
    flatEntityMaps: flatFieldMetadataMaps,
    flatEntityIds: orderObject?.fieldIds ?? [],
  }).find((field) => field.name === 'paid');

  if (!isDefined(paidField)) {
    return;
  }

  const roleIds = resolveRoleIdsFromAuthContext({
    authContext,
    userWorkspaceRoleMap,
    apiKeyRoleMap,
  });

  const isPaidHiddenFromCaller = roleIds.some(
    (roleId) =>
      permissionsPerRoleId[roleId]?.[orderObjectId]?.restrictedFields?.[
        paidField.id
      ]?.canRead === false,
  );

  if (isPaidHiddenFromCaller) {
    throw new ForbiddenError('Caller cannot read order.paid', {
      userFriendlyMessage: msg`Отменить заказ может только тот, кто видит оплату`,
    });
  }
};
