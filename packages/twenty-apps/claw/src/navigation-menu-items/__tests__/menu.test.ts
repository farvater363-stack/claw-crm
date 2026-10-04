import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { IDS } from 'src/constants/universal-identifiers';
import myMeasurements from 'src/navigation-menu-items/my-measurements.navigation-menu-item';
import newMeasurement from 'src/navigation-menu-items/new-measurement.navigation-menu-item';
import orders from 'src/navigation-menu-items/orders-kanban.navigation-menu-item';
import payroll from 'src/navigation-menu-items/payroll.navigation-menu-item';
import prices from 'src/navigation-menu-items/prices.navigation-menu-item';
import stock from 'src/navigation-menu-items/stock.navigation-menu-item';
import workshop from 'src/navigation-menu-items/workshop.navigation-menu-item';
import managerRole from 'src/roles/manager.role';
import measurerRole from 'src/roles/measurer.role';
import workshopRole from 'src/roles/workshop.role';

// Spec §6, top to bottom. «Сегодня» is not among them: it is a record item
// that scripts/setup-owner-dashboard.py creates at this position.
const DASHBOARD_ITEM_POSITION = -2;

const MENU = [
  { label: 'Заказы', item: orders, requires: IDS.stockMovement.object },
  { label: 'В работе', item: workshop, requires: IDS.master.object },
  {
    label: 'Новый замер',
    item: newMeasurement,
    requires: IDS.extraService.object,
  },
  {
    label: 'Мои замеры',
    item: myMeasurements,
    requires: IDS.extraService.object,
  },
  { label: 'Склад', item: stock, requires: IDS.stockMovement.object },
  { label: 'Цены', item: prices, requires: IDS.materialNorm.object },
  { label: 'ЗП', item: payroll, requires: IDS.masterPayment.object },
];

const menuOf = (role: { config: typeof managerRole.config }) => {
  const readable = (role.config.objectPermissions ?? [])
    .filter((permission) => permission.canReadObjectRecords === true)
    .map((permission) => permission.objectUniversalIdentifier);

  return MENU.filter(({ requires }) => readable.includes(requires)).map(
    ({ label }) => label,
  );
};

describe('menu', () => {
  it('has these seven items and no other', () => {
    expect(
      readdirSync(join(__dirname, '..'))
        .filter((file) => file.endsWith('.navigation-menu-item.ts'))
        .sort(),
    ).toEqual([
      'my-measurements.navigation-menu-item.ts',
      'new-measurement.navigation-menu-item.ts',
      'orders-kanban.navigation-menu-item.ts',
      'payroll.navigation-menu-item.ts',
      'prices.navigation-menu-item.ts',
      'stock.navigation-menu-item.ts',
      'workshop.navigation-menu-item.ts',
    ]);
  });

  it('orders them as the spec does, after the dashboard item and off position zero', () => {
    const positions = MENU.map(({ item }) => item.config.position);

    expect(positions).toEqual([-1, 1, 2, 3, 4, 5, 6]);
    expect(positions[0]).toBeGreaterThan(DASHBOARD_ITEM_POSITION);
  });

  it('names the object each item cannot work without', () => {
    expect(
      MENU.map(({ item }) => item.config.targetObjectUniversalIdentifier),
    ).toEqual(MENU.map(({ requires }) => requires));
  });

  it('labels the pages itself and takes the label of a view item from its view', () => {
    expect(MENU.map(({ item }) => item.config.name)).toEqual([
      undefined,
      'В работе',
      'Новый замер',
      undefined,
      'Склад',
      'Цены',
      'ЗП',
    ]);
    expect(orders.config.viewUniversalIdentifier).toBe(IDS.view.ordersKanban);
    expect(myMeasurements.config.viewUniversalIdentifier).toBe(
      IDS.view.myMeasurements,
    );
  });

  it.each([
    ['the measurer', measurerRole, ['Новый замер', 'Мои замеры']],
    ['the workshop', workshopRole, ['В работе']],
    [
      'the manager',
      managerRole,
      ['Заказы', 'В работе', 'Новый замер', 'Мои замеры', 'Склад', 'Цены'],
    ],
  ])('shows %s the menu of the spec, first item first', (_, role, labels) => {
    expect(menuOf(role)).toEqual(labels);
  });
});
