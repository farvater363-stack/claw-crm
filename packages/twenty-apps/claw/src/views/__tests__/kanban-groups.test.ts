import { describe, expect, it } from 'vitest';

import { BOARD_STATUSES } from 'src/constants/order-status-sets';
import { IDS } from 'src/constants/universal-identifiers';
import allOrders from 'src/views/all-orders.view';
import myMeasurements from 'src/views/my-measurements.view';
import ordersKanban from 'src/views/orders-kanban.view';

const idByStatus = (
  groups: ReadonlyArray<{ fieldValue: string; universalIdentifier: string }>,
): Record<string, string> =>
  Object.fromEntries(
    groups.map((group) => [group.fieldValue, group.universalIdentifier]),
  );

// A group belongs to the status it was created for. The ids below are the ones
// the server already holds; if a status is removed, its neighbours keep theirs.
describe('kanban groups keep their status', () => {
  it('on the orders board', () => {
    expect(idByStatus(ordersKanban.config.groups ?? [])).toEqual({
      NEW: '7d0c2a7d-5346-46bc-9154-46322e53f0a6',
      MEASUREMENT_SCHEDULED: '6145efec-e0ec-4f1c-ad81-9d80a1ecea9a',
      MEASURED: '3a25a32c-2749-437e-a33c-5e79387067d1',
      PRODUCTION: '5e44ee03-b859-4453-981a-8d5060aed81b',
      QUALITY_CHECK: 'b8cb0602-3cd0-4546-91b8-be01c009f1d8',
      INSTALLED: '7dea75ba-d8be-4f64-979f-f45c1656081d',
      CANCELLED: '56d6e014-11ba-450f-88d9-ba7a53e6930f',
    });
  });

  it('on «Мои замеры»', () => {
    expect(idByStatus(myMeasurements.config.groups ?? [])).toEqual({
      NEW: '168ea825-2b93-42aa-bedf-ac7ce2fbf4a1',
      MEASUREMENT_SCHEDULED: '0ae1cffa-b87a-4e62-8a3d-ac8513ce8405',
      MEASURED: 'c8636426-d2a3-4f80-9e46-46d04770f00d',
      PRODUCTION: '913b493d-75b8-436e-809b-1bb695948877',
      QUALITY_CHECK: 'f8161134-d272-474f-b585-9b61c30a60e4',
      INSTALLED: 'b077b531-29aa-422b-a0f6-a3fe3dc59b13',
      CANCELLED: '7fd48330-79f9-4032-8378-84cb747803c1',
    });
  });

  it('shows the measurer only his two columns', () => {
    expect(
      (myMeasurements.config.groups ?? [])
        .filter((group) => group.isVisible)
        .map((group) => group.fieldValue),
    ).toEqual(['MEASUREMENT_SCHEDULED', 'MEASURED']);
  });
});

describe('«Заказы»', () => {
  const groups = ordersKanban.config.groups ?? [];
  const fields = ordersKanban.config.fields ?? [];
  const fieldIds = (isVisible: boolean) =>
    fields
      .filter((field) => field.isVisible === isVisible)
      .map((field) => field.fieldMetadataUniversalIdentifier);

  it('carries the name of its menu item and comes before the table', () => {
    expect(ordersKanban.config.name).toBe('Заказы');
    expect([
      ordersKanban.config.position,
      allOrders.config.position,
      myMeasurements.config.position,
    ]).toEqual([0, 1, 2]);
  });

  it('shows the six steps as columns, in their order', () => {
    expect(
      groups
        .filter((group) => group.isVisible)
        .sort((left, right) => left.position - right.position)
        .map((group) => group.fieldValue),
    ).toEqual([...BOARD_STATUSES]);
  });

  it('keeps every other status as a hidden group at a place of its own', () => {
    const hidden = groups.filter((group) => !group.isVisible);

    expect(hidden.map((group) => group.fieldValue)).toContain('CANCELLED');
    expect(new Set(groups.map((group) => group.position)).size).toBe(
      groups.length,
    );
    expect(
      Math.min(...hidden.map((group) => group.position)),
    ).toBeGreaterThanOrEqual(BOARD_STATUSES.length);
  });

  it('shows eight fields on a card, the workshop stage and «Срочно» last', () => {
    expect(fieldIds(true)).toEqual([
      IDS.order.name,
      IDS.order.clientName,
      IDS.order.total,
      IDS.order.master,
      IDS.order.installationDeadline,
      IDS.order.deadlineState,
      IDS.order.productionStage,
      IDS.order.urgency,
    ]);
    expect(fieldIds(false)).toEqual([]);
  });
});
