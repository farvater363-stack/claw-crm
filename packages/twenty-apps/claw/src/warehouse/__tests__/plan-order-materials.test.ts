import { describe, expect, it } from 'vitest';

import { deterministicUuid } from 'src/utils/deterministic-uuid';
import {
  isEmptyOrderMaterialsPlan,
  isEnteringWrittenOff,
  orderMaterialLineId,
  planOrderMaterials,
  type OrderMaterialLine,
  type OrderMaterialsInput,
  writeOffMovementId,
} from 'src/warehouse/plan-order-materials';

const ORDER = 'order-1';
const LINE = orderMaterialLineId(ORDER, 'profile');
const TODAY = '2026-10-03';

const input = (
  overrides: Partial<OrderMaterialsInput>,
): OrderMaterialsInput => ({
  orderId: ORDER,
  status: 'MEASURED',
  demand: new Map([['profile', 16.5]]),
  lines: [],
  systemMovements: [],
  today: TODAY,
  entersWrittenOff: false,
  ...overrides,
});

const line = (
  overrides: Partial<OrderMaterialLine> = {},
): OrderMaterialLine => ({
  id: LINE,
  materialId: 'profile',
  plannedQuantity: 16.5,
  writtenOffQuantity: null,
  ...overrides,
});

describe('planOrderMaterials', () => {
  it('reserves demand as unwritten lines once the order is measured', () => {
    expect(planOrderMaterials(input({}))).toEqual({
      lineUpserts: [
        {
          id: LINE,
          orderId: ORDER,
          materialId: 'profile',
          plannedQuantity: 16.5,
        },
      ],
      lineDeletes: [],
      movementUpserts: [],
    });
  });

  it('is empty when lines already match the demand', () => {
    expect(
      isEmptyOrderMaterialsPlan(planOrderMaterials(input({ lines: [line()] }))),
    ).toBe(true);
  });

  it('updates a changed demand and drops materials no longer needed', () => {
    const stale = line({
      id: orderMaterialLineId(ORDER, 'paint'),
      materialId: 'paint',
      plannedQuantity: 1,
    });
    const plan = planOrderMaterials(
      input({ demand: new Map([['profile', 20]]), lines: [line(), stale] }),
    );

    expect(plan.lineUpserts).toEqual([
      {
        id: LINE,
        orderId: ORDER,
        materialId: 'profile',
        plannedQuantity: 20,
      },
    ]);
    expect(plan.lineDeletes).toEqual([stale.id]);
  });

  it('writes off once when production starts, even without a measured step first', () => {
    const plan = planOrderMaterials(
      input({ status: 'PRODUCTION', entersWrittenOff: true }),
    );

    expect(plan.lineUpserts).toEqual([
      {
        id: LINE,
        orderId: ORDER,
        materialId: 'profile',
        plannedQuantity: 16.5,
        writtenOffQuantity: 16.5,
      },
    ]);
    expect(plan.movementUpserts).toEqual([
      {
        id: writeOffMovementId(LINE),
        kind: 'WRITE_OFF',
        materialId: 'profile',
        orderId: ORDER,
        orderMaterialId: LINE,
        quantity: -16.5,
        date: TODAY,
      },
    ]);
  });

  it('leaves an order already in production at go-live without lines', () => {
    const plan = planOrderMaterials(input({ status: 'PRODUCTION' }));

    expect(isEmptyOrderMaterialsPlan(plan)).toBe(true);
  });

  it('writes off a reserved line whenever the order is seen in production', () => {
    const plan = planOrderMaterials(
      input({ status: 'PRODUCTION', lines: [line()] }),
    );

    expect(plan.lineUpserts).toEqual([
      {
        id: LINE,
        orderId: ORDER,
        materialId: 'profile',
        plannedQuantity: 16.5,
        writtenOffQuantity: 16.5,
      },
    ]);
    expect(plan.movementUpserts).toEqual([
      {
        id: writeOffMovementId(LINE),
        kind: 'WRITE_OFF',
        materialId: 'profile',
        orderId: ORDER,
        orderMaterialId: LINE,
        quantity: -16.5,
        date: TODAY,
      },
    ]);
  });

  it('never touches a written-off line again, whatever the demand or status', () => {
    const written = line({ writtenOffQuantity: 16.5 });
    const movements = [{ id: writeOffMovementId(LINE), quantity: -16.5 }];

    for (const status of ['MEASURED', 'PRODUCTION', 'CANCELLED', 'NEW']) {
      const plan = planOrderMaterials(
        input({
          status,
          demand: new Map([['profile', 99]]),
          lines: [written],
          systemMovements: movements,
        }),
      );

      expect(isEmptyOrderMaterialsPlan(plan)).toBe(true);
    }
  });

  it('restores a missing write-off movement of a written-off line', () => {
    const plan = planOrderMaterials(
      input({
        status: 'PRODUCTION',
        lines: [line({ writtenOffQuantity: 16.5 })],
      }),
    );

    expect(
      plan.movementUpserts.map(({ id, quantity }) => ({ id, quantity })),
    ).toEqual([{ id: writeOffMovementId(LINE), quantity: -16.5 }]);
  });

  it('drops unwritten lines when the order is cancelled or moved back', () => {
    for (const status of ['CANCELLED', 'MEASUREMENT_SCHEDULED']) {
      expect(planOrderMaterials(input({ status, lines: [line()] }))).toEqual({
        lineUpserts: [],
        lineDeletes: [LINE],
        movementUpserts: [],
      });
    }
  });

  it('writes off once and never plans another movement kind', () => {
    const result = planOrderMaterials(
      input({
        status: 'INSTALLED',
        lines: [line({ writtenOffQuantity: 10 })],
        systemMovements: [],
      }),
    );

    expect(result.movementUpserts.map((movement) => movement.kind)).toEqual([
      'WRITE_OFF',
    ]);
  });

  it('restores a missing write-off even on a cancelled order', () => {
    const plan = planOrderMaterials(
      input({
        status: 'CANCELLED',
        lines: [line({ writtenOffQuantity: 16.5 })],
      }),
    );

    expect(plan.lineUpserts).toEqual([]);
    expect(plan.lineDeletes).toEqual([]);
    expect(
      plan.movementUpserts.map(({ id, quantity }) => ({ id, quantity })),
    ).toEqual([{ id: writeOffMovementId(LINE), quantity: -16.5 }]);
  });

  it('derives ids from fixed recipes', () => {
    expect(writeOffMovementId(LINE)).toBe(
      deterministicUuid(`writeoff:${LINE}`),
    );
    expect(orderMaterialLineId(ORDER, 'profile')).toBe(
      deterministicUuid(`orderMaterial:${ORDER}:profile`),
    );
  });
});

describe('isEnteringWrittenOff', () => {
  it.each([
    ['MEASURED', 'PRODUCTION', true],
    ['NEW', 'PRODUCTION', true],
    ['QUALITY_CHECK', 'INSTALLED', false],
    ['PRODUCTION', 'MEASURED', false],
    [null, 'PRODUCTION', true],
    [null, 'NEW', false],
  ])('%s -> %s is %s', (previousStatus, status, expected) => {
    expect(isEnteringWrittenOff({ status, previousStatus })).toBe(expected);
  });
});
