import {
  MetadataReadability,
  RowLevelPermissionPredicateOperand,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  SystemPermissionFlag,
} from 'twenty-sdk/define';
import { describe, expect, it } from 'vitest';

import { IDS } from 'src/constants/universal-identifiers';
import loginOnMasterField from 'src/fields/login-on-master.field';
import designObject from 'src/objects/design.object';
import orderExtraServiceObject from 'src/objects/order-extra-service.object';
import orderItemObject from 'src/objects/order-item.object';
import orderPaymentObject from 'src/objects/order-payment.object';
import orderObject from 'src/objects/order.object';
import payAccrualObject from 'src/objects/pay-accrual.object';
import payRuleObject from 'src/objects/pay-rule.object';
import signedContractObject from 'src/objects/signed-contract.object';
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
          IDS.master.penaltyPercentPerDay,
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
          IDS.order.subtotal,
          IDS.order.discount,
          IDS.order.total,
          IDS.order.balance,
          IDS.orderItem.areaSquareMeters,
          IDS.orderItem.lineTotal,
          IDS.orderExtraService.lineTotal,
          IDS.order.number,
        ]),
      );
      expect(readOnlyFieldIds(role)).toContain(IDS.order.measuredAt);
      expect(readOnlyFieldIds(role)).not.toContain(IDS.order.discountKind);
      expect(readOnlyFieldIds(role)).not.toContain(IDS.order.discountValue);
      expect(hiddenFieldIds(role)).not.toContain(IDS.order.discountKind);
      expect(hiddenFieldIds(role)).not.toContain(IDS.order.discountValue);
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
  it('reads orders and workers, and updates orders only', () => {
    expect(workshopRole.config.canReadAllObjectRecords).toBe(false);
    expect(workshopRole.config.canUpdateAllObjectRecords).toBe(false);
    expect(readableObjectIds(workshopRole)).toEqual(
      expect.arrayContaining([
        IDS.order.object,
        IDS.orderItem.object,
        IDS.orderExtraService.object,
        IDS.master.object,
        IDS.design.object,
      ]),
    );
    expect(updatableObjectIds(workshopRole)).toEqual([IDS.order.object]);
  });

  // Walks every identifier of the order, so a field added later is read-only
  // for the workshop until somebody classifies it here.
  it('may change only the status, the stage, the finished photos and the printed scheme of an order', () => {
    const limited = new Set([
      ...hiddenFieldIds(workshopRole),
      ...readOnlyFieldIds(workshopRole),
    ]);
    const definedFields = new Map(
      orderObject.config.fields.map((field) => [
        field.universalIdentifier,
        field,
      ]),
    );
    // The other side holds the value; the order has no column to lock.
    const oneToManyKeys = [
      'items',
      'extraServices',
      'materials',
      'stockMovements',
      'payments',
      'accruals',
      'calls',
      'moneyEntries',
      'signedContracts',
      'customMaterials',
    ] as const;
    const retiredKeys = ['masterPayPaid', 'prepayment', 'isUrgent'] as const;
    // The object's own identifier, and the retired fields that are no longer defined.
    const keysWithoutField: string[] = ['object', ...retiredKeys];
    const writableIds = [
      IDS.order.status,
      IDS.order.productionStage,
      IDS.order.finishedPhotos,
      IDS.order.schemePdf,
      // Twenty writes the author itself on every update, through the same
      // check as the caller's fields, and overwrites whatever the caller sent:
      // locked, «Готово» would be refused; open, it still cannot be falsified.
      IDS.order.updatedBy,
    ];

    for (const key of oneToManyKeys) {
      expect(definedFields.get(IDS.order[key])).toMatchObject({
        type: 'RELATION',
        universalSettings: { relationType: 'ONE_TO_MANY' },
      });
    }

    // A permission on a field that is not defined would point at nothing.
    for (const key of retiredKeys) {
      expect(definedFields.has(IDS.order[key])).toBe(false);
      expect(limited.has(IDS.order[key])).toBe(false);
    }

    const columnIds = Object.entries(IDS.order)
      .filter(
        ([key]) =>
          !keysWithoutField.includes(key) &&
          !oneToManyKeys.some((oneToManyKey) => oneToManyKey === key),
      )
      .map(([, id]) => id);

    expect(columnIds.filter((id) => !limited.has(id)).sort()).toEqual(
      [...writableIds].sort(),
    );
  });

  // Twenty has no create right apart from update. Every create carries a
  // position, so a login that may not write it cannot create an order; the
  // rest closes a soft delete, a move between periods and a false author
  // through a plain update.
  it('cannot write the fields Twenty keeps on an order', () => {
    expect(readOnlyFieldIds(workshopRole)).toEqual(
      expect.arrayContaining([
        IDS.order.position,
        IDS.order.deletedAt,
        IDS.order.createdAt,
        IDS.order.createdBy,
        IDS.order.updatedAt,
      ]),
    );
  });

  it('names each field once', () => {
    const fieldIds = (workshopRole.config.fieldPermissions ?? []).map(
      (permission) => permission.fieldUniversalIdentifier,
    );

    expect(new Set(fieldIds).size).toBe(fieldIds.length);
  });

  // The shared wall login is not trusted with the money or the client's phone.
  it('reads no sums and no client phone', () => {
    expect(hiddenFieldIds(workshopRole)).toEqual(
      expect.arrayContaining([
        IDS.order.clientPhone,
        IDS.order.subtotal,
        IDS.order.discountValue,
        IDS.order.discount,
        IDS.order.total,
        IDS.order.paid,
        IDS.order.balance,
        IDS.order.refundAmount,
        IDS.orderItem.pricePerSquareMeter,
        IDS.orderItem.lineTotal,
        IDS.orderExtraService.price,
        IDS.orderExtraService.lineTotal,
        IDS.design.pricePerSquareMeter,
      ]),
    );
  });

  it('still reads what the wall shows', () => {
    for (const fieldId of [
      IDS.order.name,
      IDS.order.status,
      IDS.order.clientFullName,
      IDS.order.address,
      IDS.order.areaSquareMeters,
      IDS.orderItem.areaSquareMeters,
      IDS.orderItem.quantity,
    ]) {
      expect(hiddenFieldIds(workshopRole)).not.toContain(fieldId);
    }
  });

  it('removes and destroys nothing, and reads no more than before', () => {
    const permissions = workshopRole.config.objectPermissions ?? [];

    expect(workshopRole.config.canSoftDeleteAllObjectRecords).toBe(false);
    expect(workshopRole.config.canDestroyAllObjectRecords).toBe(false);
    expect(
      permissions.filter(
        (permission) =>
          permission.canSoftDeleteObjectRecords !== false ||
          permission.canDestroyObjectRecords !== false,
      ),
    ).toEqual([]);
    expect(
      permissions
        .map((permission) => permission.objectUniversalIdentifier)
        .sort(),
    ).toEqual(
      [
        IDS.order.object,
        IDS.orderItem.object,
        IDS.orderExtraService.object,
        IDS.master.object,
        IDS.design.object,
        // The kind's name is on the workshop's order card.
        IDS.grilleKind.object,
        IDS.material.object,
        IDS.orderMaterial.object,
      ].sort(),
    );
  });

  // A menu entry shows only to a role that reads its object; there is no
  // workshop login to check the menu in a browser.
  it.each([
    ['«Заказы» and «Склад»', IDS.stockMovement.object],
    ['«Цены»', IDS.materialNorm.object],
    ['«Новый замер» and «Мои замеры»', IDS.extraService.object],
    ['«ЗП»', IDS.masterPayment.object],
  ])('has no %s in its menu', (_, objectId) => {
    expect(readableObjectIds(workshopRole)).not.toContain(objectId);
  });

  it('has «В работе» in its menu', () => {
    expect(readableObjectIds(workshopRole)).toContain(IDS.master.object);
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

  it('lets the manager record purchases and suppliers but not money', () => {
    expect(updatableObjectIds(managerRole)).toEqual(
      expect.arrayContaining([IDS.supplier.object, IDS.purchase.object]),
    );
    expect(readableObjectIds(managerRole)).not.toContain(IDS.moneyEntry.object);
  });

  it.each([managerRole, measurerRole, workshopRole])(
    'keeps recurring expenses with the owner',
    (role) => {
      expect(readableObjectIds(role)).not.toContain(
        IDS.recurringExpense.object,
      );
    },
  );

  it.each([measurerRole, workshopRole])(
    'gives the measurer and the workshop no purchases or money',
    (role) => {
      expect(readableObjectIds(role)).not.toContain(IDS.purchase.object);
      expect(readableObjectIds(role)).not.toContain(IDS.supplier.object);
      expect(readableObjectIds(role)).not.toContain(IDS.moneyEntry.object);
    },
  );

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
  it('soft-deletes only what the order sync, the accrual sync, a deleted order and the screens remove, and destroys nothing', () => {
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
        IDS.material.object,
        IDS.orderMaterial.object,
        IDS.stockMovement.object,
        IDS.design.object,
        IDS.grilleKind.object,
        IDS.extraService.object,
        IDS.materialNorm.object,
        IDS.payRule.object,
        IDS.payAccrual.object,
        IDS.workshopRate.object,
        IDS.moneyEntry.object,
        IDS.purchase.object,
        IDS.masterPayment.object,
        IDS.orderPayment.object,
        IDS.order.object,
      ].sort(),
    );
    expect(
      permissions.filter(
        (permission) => permission.canDestroyObjectRecords !== false,
      ),
    ).toEqual([]);
    // The triggers stamp calculated fields and measuredAt, so nothing is locked.
    expect(functionsRole.config.fieldPermissions ?? []).toEqual([]);
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

describe('pay rules and accruals', () => {
  it.each([managerRole, measurerRole, workshopRole])(
    'stay owner-only: no app role is granted payRule or payAccrual',
    (role) => {
      const grantedObjectIds = (role.config.objectPermissions ?? []).map(
        (permission) => permission.objectUniversalIdentifier,
      );

      expect(grantedObjectIds).not.toContain(IDS.payRule.object);
      expect(grantedObjectIds).not.toContain(IDS.payAccrual.object);
    },
  );

  it.each([managerRole, measurerRole, workshopRole])(
    'hides the pay numbers and the worker login',
    (role) => {
      expect(hiddenFieldIds(role)).toEqual(
        expect.arrayContaining([
          IDS.master.login,
          IDS.payRule.amount,
          IDS.payRule.percent,
          IDS.payAccrual.amount,
          IDS.payAccrual.basis,
          IDS.payAccrual.rate,
        ]),
      );
    },
  );

  // The server does not copy a relation's permission to its other side, so the
  // member's list of workers is hidden by a permission of its own.
  it.each([managerRole, measurerRole, workshopRole])(
    'hides the login from the workspace member side as well',
    (role) => {
      expect(role.config.fieldPermissions ?? []).toContainEqual({
        objectUniversalIdentifier:
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember
            .universalIdentifier,
        fieldUniversalIdentifier: IDS.workspaceMember.workers,
        canReadFieldValue: false,
        canUpdateFieldValue: false,
      });
    },
  );

  // The timeline is readable by every role, so an audited pay value would leak there.
  it.each([payRuleObject, payAccrualObject])(
    'keeps every pay field out of the audit log',
    (object) => {
      expect(
        object.config.fields.filter((field) => field.isAuditLogged !== false),
      ).toEqual([]);
    },
  );

  it('keeps the worker login out of the audit log', () => {
    expect(loginOnMasterField.config.isAuditLogged).toBe(false);
  });
});

describe('client payments', () => {
  const paymentPermission = (role: RoleResult) =>
    (role.config.objectPermissions ?? []).find(
      (permission) =>
        permission.objectUniversalIdentifier === IDS.orderPayment.object,
    );

  it('lets the manager record, change and remove payments', () => {
    expect(paymentPermission(managerRole)).toMatchObject({
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: true,
      canDestroyObjectRecords: false,
    });
  });

  // A create is an update in Twenty, and Новый замер retries a payment by
  // writing the same id again.
  it('lets the measurer record and read payments, not remove them', () => {
    expect(paymentPermission(measurerRole)).toMatchObject({
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    });
  });

  it('gives the workshop no access to payments', () => {
    expect(paymentPermission(workshopRole)).toBeUndefined();
  });

  it.each([managerRole, measurerRole])(
    'keeps «Оплачено» for the recalc to write',
    (role) => {
      expect(readOnlyFieldIds(role)).toContain(IDS.order.paid);
    },
  );
});

describe('file uploads', () => {
  it.each([managerRole, measurerRole, workshopRole])(
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

  it('keeps downloads from the workshop login', () => {
    expect(workshopRole.config.permissionFlagUniversalIdentifiers).toEqual([
      SystemPermissionFlag.UPLOAD_FILE,
    ]);
  });
});

describe('workshop rows', () => {
  const rules = workshopRole.config.rowLevelPermissionPredicates ?? [];

  // It cannot read the money, so it cannot answer what became of it.
  it('cannot cancel an order', () => {
    expect(rules).toEqual([
      expect.objectContaining({
        objectUniversalIdentifier: IDS.order.object,
        fieldUniversalIdentifier: IDS.order.status,
        operand: RowLevelPermissionPredicateOperand.IS,
        value: [
          'NEW',
          'MEASUREMENT_SCHEDULED',
          'MEASURED',
          'PRODUCTION',
          'QUALITY_CHECK',
          'INSTALLED',
        ],
      }),
    ]);
    expect(rules[0]?.universalIdentifier).not.toBe(
      IDS.role.measurerMeasuringStatuses,
    );
  });

  it('cannot change the refund wallet', () => {
    expect(readOnlyFieldIds(workshopRole)).toContain(IDS.order.refundWallet);
  });
});

describe('refund record of an order', () => {
  it.each([managerRole, measurerRole, workshopRole])(
    'is written by the app alone',
    (role) => {
      expect(readOnlyFieldIds(role)).toContain(IDS.order.refundEntryId);
    },
  );
});

describe('measurer rows', () => {
  const rules = measurerRole.config.rowLevelPermissionPredicates ?? [];

  it('reads and writes only the orders he measures, while they are measured', () => {
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectUniversalIdentifier: IDS.order.object,
          fieldUniversalIdentifier: IDS.order.measurer,
          operand: RowLevelPermissionPredicateOperand.IS,
          value: {
            isCurrentWorkspaceMemberSelected: true,
            selectedRecordIds: [],
          },
        }),
        expect.objectContaining({
          objectUniversalIdentifier: IDS.order.object,
          fieldUniversalIdentifier: IDS.order.status,
          operand: RowLevelPermissionPredicateOperand.IS,
          value: ['MEASUREMENT_SCHEDULED', 'MEASURED'],
        }),
      ]),
    );
    // Outside a group the rules are ANDed: both must hold.
    expect(measurerRole.config.rowLevelPermissionPredicateGroups ?? []).toEqual(
      [],
    );
    expect(
      rules.every((rule) => rule.predicateGroupUniversalIdentifier == null),
    ).toBe(true);
  });

  it('lets Новый замер save the status it writes', () => {
    const statusRule = rules.find(
      (rule) => rule.fieldUniversalIdentifier === IDS.order.status,
    );

    expect(statusRule?.value).toContain('MEASURED');
  });

  it.each([
    orderItemObject,
    orderExtraServiceObject,
    orderPaymentObject,
    signedContractObject,
  ])(
    'limits what hangs off an order the same way as the order',
    ({ config }) => {
      const [parentFieldId] =
        config.readabilityParentFieldUniversalIdentifiers ?? [];
      const parentField = config.fields.find(
        (field) => field.universalIdentifier === parentFieldId,
      );

      expect(config.readability).toBe(MetadataReadability.INHERITED);
      expect(config.readabilityParentFieldUniversalIdentifiers).toHaveLength(1);
      expect(parentField).toMatchObject({
        name: 'order',
        relationTargetObjectMetadataUniversalIdentifier: IDS.order.object,
      });
    },
  );

  it('gives each rule its own identifier', () => {
    const ids = rules.map((rule) => rule.universalIdentifier);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves the manager and the functions without rules', () => {
    for (const role of [managerRole, functionsRole]) {
      expect(role.config.rowLevelPermissionPredicates ?? []).toEqual([]);
    }
  });

  it('reads clients but leaves them to the trigger that makes them', () => {
    expect(
      (measurerRole.config.objectPermissions ?? []).find(
        (permission) =>
          permission.objectUniversalIdentifier ===
          STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      ),
    ).toMatchObject({
      canReadObjectRecords: true,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    });
  });
});
