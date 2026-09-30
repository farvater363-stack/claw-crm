import { SystemPermissionFlag } from 'twenty-sdk/define';
import { describe, expect, it } from 'vitest';

import { IDS } from 'src/constants/universal-identifiers';
import managerRole from 'src/roles/manager.role';
import measurerRole from 'src/roles/measurer.role';
import workshopRole from 'src/roles/workshop.role';

type RoleResult = { config: typeof managerRole.config };

const hiddenFieldIds = (role: RoleResult) =>
  (role.config.fieldPermissions ?? [])
    .filter((permission) => permission.canReadFieldValue === false)
    .map((permission) => permission.fieldUniversalIdentifier);

describe('roles', () => {
  it.each([managerRole, measurerRole, workshopRole])(
    'hides margin, cost and pay',
    (role) => {
      expect(hiddenFieldIds(role)).toEqual(
        expect.arrayContaining([
          IDS.order.costTotal,
          IDS.order.margin,
          IDS.order.masterPayTotal,
          IDS.orderItem.lineCost,
          IDS.priceListItem.manufacturingCostPerSquareMeter,
          IDS.master.ratePerSquareMeter,
        ]),
      );
    },
  );
});

const readOnlyFieldIds = (role: RoleResult) =>
  (role.config.fieldPermissions ?? [])
    .filter(
      (permission) =>
        permission.canReadFieldValue !== false &&
        permission.canUpdateFieldValue === false,
    )
    .map((permission) => permission.fieldUniversalIdentifier);

const readableObjectIds = (role: RoleResult) =>
  (role.config.objectPermissions ?? [])
    .filter((permission) => permission.canReadObjectRecords === true)
    .map((permission) => permission.objectUniversalIdentifier);

describe('calculated fields and object access', () => {
  it.each([managerRole, measurerRole])(
    'shows calculated values but lets only the triggers write them',
    (role) => {
      expect(readOnlyFieldIds(role)).toEqual(
        expect.arrayContaining([
          IDS.order.areaSquareMeters,
          IDS.order.total,
          IDS.order.balance,
          IDS.orderItem.areaSquareMeters,
          IDS.orderItem.lineTotal,
          IDS.orderExtraService.lineTotal,
          IDS.order.number,
        ]),
      );
      expect(readOnlyFieldIds(role)).not.toContain(IDS.order.prepayment);
    },
  );

  it('limits the measurer to the objects of a measurement', () => {
    expect(managerRole.config.canReadAllObjectRecords).toBe(false);
    expect(measurerRole.config.canReadAllObjectRecords).toBe(false);
    expect(readableObjectIds(measurerRole)).toEqual(
      expect.arrayContaining([
        IDS.order.object,
        IDS.orderItem.object,
        IDS.design.object,
        IDS.priceListItem.object,
      ]),
    );
  });
});

describe('workshop', () => {
  it('reads orders and masters only, and writes nothing', () => {
    expect(workshopRole.config.canReadAllObjectRecords).toBe(false);
    expect(readableObjectIds(workshopRole)).toEqual(
      expect.arrayContaining([IDS.order.object, IDS.master.object]),
    );
    expect(
      (workshopRole.config.objectPermissions ?? []).some(
        (permission) => permission.canUpdateObjectRecords,
      ),
    ).toBe(false);
  });
});

describe('payments', () => {
  it.each([managerRole, measurerRole, workshopRole])(
    'stay admin-only: no app role is granted masterPayment',
    (role) => {
      expect(role.config.canReadAllObjectRecords).toBe(false);
      expect(
        (role.config.objectPermissions ?? []).map(
          (permission) => permission.objectUniversalIdentifier,
        ),
      ).not.toContain(IDS.masterPayment.object);
    },
  );
});

describe('file uploads', () => {
  it.each([managerRole, measurerRole])(
    'lets roles that attach photos upload files',
    (role) => {
      expect(role.config.permissionFlagUniversalIdentifiers).toContain(
        SystemPermissionFlag.UPLOAD_FILE,
      );
    },
  );

  it('lets managers download photos', () => {
    expect(managerRole.config.permissionFlagUniversalIdentifiers).toContain(
      SystemPermissionFlag.DOWNLOAD_FILE,
    );
  });

  it('keeps the read-only workshop login from uploading', () => {
    expect(
      workshopRole.config.permissionFlagUniversalIdentifiers ?? [],
    ).not.toContain(SystemPermissionFlag.UPLOAD_FILE);
  });
});
