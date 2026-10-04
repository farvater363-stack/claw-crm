import { SystemPermissionFlag } from 'twenty-sdk/define';
import { describe, expect, it } from 'vitest';

import { IDS } from 'src/constants/universal-identifiers';
import designObject from 'src/objects/design.object';
import functionsRole from 'src/roles/functions.role';
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
          IDS.design.manufacturingCostPerSquareMeter,
          IDS.master.ratePerSquareMeter,
          IDS.stockMovement.unitPrice,
          IDS.material.lastPurchasePrice,
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
        IDS.extraService.object,
      ]),
    );
  });

  it.each([managerRole, workshopRole])(
    'reads materials and order material lines',
    (role) => {
      expect(readableObjectIds(role)).toEqual(
        expect.arrayContaining([IDS.material.object, IDS.orderMaterial.object]),
      );
    },
  );
});

const updatableObjectIds = (role: RoleResult) =>
  (role.config.objectPermissions ?? [])
    .filter((permission) => permission.canUpdateObjectRecords === true)
    .map((permission) => permission.objectUniversalIdentifier);

describe('workshop', () => {
  it('reads orders and masters, and writes nothing', () => {
    expect(workshopRole.config.canReadAllObjectRecords).toBe(false);
    expect(workshopRole.config.canUpdateAllObjectRecords).toBe(false);
    expect(readableObjectIds(workshopRole)).toEqual(
      expect.arrayContaining([IDS.order.object, IDS.master.object]),
    );
    expect(updatableObjectIds(workshopRole)).toEqual([]);
  });

  // «Склад» opens the stock history object, so a role that cannot read it gets no menu item.
  it('has no stock screen', () => {
    expect(readableObjectIds(workshopRole)).not.toContain(
      IDS.stockMovement.object,
    );
  });
});

describe('warehouse access', () => {
  it('lets the manager record stock movements and read norms', () => {
    expect(updatableObjectIds(managerRole)).toContain(IDS.stockMovement.object);
    expect(readableObjectIds(managerRole)).toEqual(
      expect.arrayContaining([IDS.materialNorm.object, IDS.material.object]),
    );
    expect(updatableObjectIds(managerRole)).not.toContain(
      IDS.orderMaterial.object,
    );
  });

  it('keeps order material lines read-only for the workshop', () => {
    expect(updatableObjectIds(workshopRole)).not.toContain(
      IDS.orderMaterial.object,
    );
  });

  it.each([
    ['manager', managerRole],
    ['measurer', measurerRole],
  ])(
    'keeps the order material state for the recalc to write (%s)',
    (_, role) => {
      expect(readOnlyFieldIds(role)).toEqual(
        expect.arrayContaining([
          IDS.order.materialState,
          IDS.order.materialNote,
          IDS.order.missingNorms,
        ]),
      );
    },
  );

  it.each([
    ['material', IDS.material.object],
    ['materialNorm', IDS.materialNorm.object],
    ['stockMovement', IDS.stockMovement.object],
    ['orderMaterial', IDS.orderMaterial.object],
  ])('does not give the measurer the %s object', (_, objectId) => {
    expect(readableObjectIds(measurerRole)).not.toContain(objectId);
  });
});

describe('grille prices and composition', () => {
  it('hides grille costs from every non-admin role', () => {
    const costIds = [
      IDS.design.materialCostPerSquareMeter,
      IDS.design.manufacturingCostPerSquareMeter,
      IDS.design.installationCostPerSquareMeter,
    ];

    for (const role of [managerRole, measurerRole, workshopRole]) {
      expect(hiddenFieldIds(role)).toEqual(expect.arrayContaining(costIds));
    }
  });

  // The timeline is readable by every role, so an audited cost would leak there.
  it('keeps grille costs out of the audit log', () => {
    const auditFlagByFieldId = new Map(
      designObject.config.fields.map((field) => [
        field.universalIdentifier,
        field.isAuditLogged,
      ]),
    );

    for (const costId of [
      IDS.design.materialCostPerSquareMeter,
      IDS.design.manufacturingCostPerSquareMeter,
      IDS.design.installationCostPerSquareMeter,
    ]) {
      expect(auditFlagByFieldId.get(costId)).toBe(false);
    }
  });

  it('hides the grille price from the workshop only', () => {
    expect(hiddenFieldIds(workshopRole)).toContain(
      IDS.design.pricePerSquareMeter,
    );
    for (const role of [managerRole, measurerRole]) {
      expect(hiddenFieldIds(role)).not.toContain(
        IDS.design.pricePerSquareMeter,
      );
    }
  });

  it('lets the manager edit composition and materials', () => {
    expect(updatableObjectIds(managerRole)).toEqual(
      expect.arrayContaining([IDS.materialNorm.object, IDS.material.object]),
    );
  });

  it('keeps the computed material values for the recalc to write', () => {
    expect(readOnlyFieldIds(managerRole)).toEqual(
      expect.arrayContaining([
        IDS.material.onHand,
        IDS.material.reserved,
        IDS.material.toBuy,
        IDS.material.stockState,
        IDS.material.overrunPercent,
      ]),
    );
    expect(readOnlyFieldIds(managerRole)).not.toContain(IDS.materialNorm.name);
  });
});

describe('functions role', () => {
  it('soft-deletes only what the order sync and the price list screen remove, and destroys nothing', () => {
    const permissions = functionsRole.config.objectPermissions ?? [];

    expect(functionsRole.config.canSoftDeleteAllObjectRecords).toBe(false);
    expect(functionsRole.config.canDestroyAllObjectRecords).toBe(false);
    expect(
      permissions
        .filter((permission) => permission.canSoftDeleteObjectRecords === true)
        .map((permission) => permission.objectUniversalIdentifier)
        .sort(),
    ).toEqual(
      [
        IDS.orderMaterial.object,
        IDS.stockMovement.object,
        IDS.design.object,
        IDS.extraService.object,
        IDS.materialNorm.object,
      ].sort(),
    );
    expect(
      permissions.filter(
        (permission) => permission.canDestroyObjectRecords !== false,
      ),
    ).toEqual([]);
    for (const permission of permissions) {
      expect(permission).toMatchObject({
        canReadObjectRecords: true,
        canUpdateObjectRecords: true,
      });
    }
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

  it('keeps the workshop login from uploading', () => {
    expect(
      workshopRole.config.permissionFlagUniversalIdentifiers ?? [],
    ).not.toContain(SystemPermissionFlag.UPLOAD_FILE);
  });
});
