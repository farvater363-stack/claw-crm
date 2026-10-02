import { describe, expect, it } from 'vitest';

import {
  factMovementId,
  isEmptyOrderMaterialsPlan,
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
  status: 'PRICE_APPROVAL',
  demand: new Map([['profile', 16.5]]),
  lines: [],
  systemMovements: [],
  today: TODAY,
  ...overrides,
});

const line = (
  overrides: Partial<OrderMaterialLine> = {},
): OrderMaterialLine => ({
  id: LINE,
  materialId: 'profile',
  plannedQuantity: 16.5,
  writtenOffQuantity: null,
  actualQuantity: null,
  ...overrides,
});

describe('planOrderMaterials', () => {
  it('reserves demand as unwritten lines at price approval', () => {
    expect(planOrderMaterials(input({}))).toEqual({
      lineUpserts: [
        {
          id: LINE,
          orderId: ORDER,
          materialId: 'profile',
          plannedQuantity: 16.5,
          writtenOffQuantity: null,
        },
      ],
      lineDeletes: [],
      movementUpserts: [],
      movementDeletes: [],
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
        writtenOffQuantity: null,
      },
    ]);
    expect(plan.lineDeletes).toEqual([stale.id]);
  });

  it('writes off once when production starts, even without price approval first', () => {
    const plan = planOrderMaterials(input({ status: 'PRODUCTION' }));

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

    for (const status of ['PRICE_APPROVAL', 'PRODUCTION', 'CANCELLED', 'NEW']) {
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
    for (const status of ['CANCELLED', 'MEASURED']) {
      expect(planOrderMaterials(input({ status, lines: [line()] }))).toEqual({
        lineUpserts: [],
        lineDeletes: [LINE],
        movementUpserts: [],
        movementDeletes: [],
      });
    }
  });

  it('books the difference between actual and written-off once the order is ready', () => {
    const written = line({ writtenOffQuantity: 16.5, actualQuantity: 18 });
    const plan = planOrderMaterials(
      input({
        status: 'READY',
        lines: [written],
        systemMovements: [{ id: writeOffMovementId(LINE), quantity: -16.5 }],
      }),
    );

    expect(plan.movementUpserts).toEqual([
      {
        id: factMovementId(LINE),
        kind: 'FACT_ADJUSTMENT',
        materialId: 'profile',
        orderId: ORDER,
        orderMaterialId: LINE,
        quantity: -1.5,
        date: TODAY,
      },
    ]);
  });

  it('removes the adjustment when the actual is cleared or equals the write-off', () => {
    const movements = [
      { id: writeOffMovementId(LINE), quantity: -16.5 },
      { id: factMovementId(LINE), quantity: -1.5 },
    ];

    for (const actualQuantity of [null, 16.5]) {
      const plan = planOrderMaterials(
        input({
          status: 'READY',
          lines: [line({ writtenOffQuantity: 16.5, actualQuantity })],
          systemMovements: movements,
        }),
      );

      expect(plan.movementDeletes).toEqual([factMovementId(LINE)]);
      expect(plan.movementUpserts).toEqual([]);
    }
  });

  it('does not book an actual before the order is ready', () => {
    const plan = planOrderMaterials(
      input({
        status: 'PRODUCTION',
        lines: [line({ writtenOffQuantity: 16.5, actualQuantity: 18 })],
        systemMovements: [{ id: writeOffMovementId(LINE), quantity: -16.5 }],
      }),
    );

    expect(isEmptyOrderMaterialsPlan(plan)).toBe(true);
  });
});
