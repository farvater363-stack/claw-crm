import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { IDS } from 'src/constants/universal-identifiers';
import callBacks from 'src/navigation-menu-items/call-backs.navigation-menu-item';
import clients from 'src/navigation-menu-items/clients.navigation-menu-item';
import contract from 'src/navigation-menu-items/contract.navigation-menu-item';
import marketing from 'src/navigation-menu-items/marketing.navigation-menu-item';
import money from 'src/navigation-menu-items/money.navigation-menu-item';
import myMeasurements from 'src/navigation-menu-items/my-measurements.navigation-menu-item';
import newMeasurement from 'src/navigation-menu-items/new-measurement.navigation-menu-item';
import orders from 'src/navigation-menu-items/orders-kanban.navigation-menu-item';
import payroll from 'src/navigation-menu-items/payroll.navigation-menu-item';
import prices from 'src/navigation-menu-items/prices.navigation-menu-item';
import stock from 'src/navigation-menu-items/stock.navigation-menu-item';
import today from 'src/navigation-menu-items/today.navigation-menu-item';
import workshop from 'src/navigation-menu-items/workshop.navigation-menu-item';
import managerRole from 'src/roles/manager.role';
import measurerRole from 'src/roles/measurer.role';
import workshopRole from 'src/roles/workshop.role';

// Top to bottom. A role sees an item only when it can read the object the
// item cannot work without, so each role gets the screens it works in.

const MENU = [
  { label: 'Сегодня', item: today, requires: IDS.moneyEntry.object },
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
  { label: 'Договор', item: contract, requires: IDS.moneyEntry.object },
  { label: 'ЗП', item: payroll, requires: IDS.masterPayment.object },
  { label: 'Клиенты', item: clients, requires: IDS.clientCall.object },
  { label: 'Перезвоны', item: callBacks, requires: IDS.clientCall.object },
  { label: 'Маркетинг', item: marketing, requires: IDS.clientCall.object },
  { label: 'Деньги', item: money, requires: IDS.moneyEntry.object },
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
  it('has these thirteen items and no other', () => {
    expect(
      readdirSync(join(__dirname, '..'))
        .filter((file) => file.endsWith('.navigation-menu-item.ts'))
        .sort(),
    ).toEqual([
      'call-backs.navigation-menu-item.ts',
      'clients.navigation-menu-item.ts',
      'contract.navigation-menu-item.ts',
      'marketing.navigation-menu-item.ts',
      'money.navigation-menu-item.ts',
      'my-measurements.navigation-menu-item.ts',
      'new-measurement.navigation-menu-item.ts',
      'orders-kanban.navigation-menu-item.ts',
      'payroll.navigation-menu-item.ts',
      'prices.navigation-menu-item.ts',
      'stock.navigation-menu-item.ts',
      'today.navigation-menu-item.ts',
      'workshop.navigation-menu-item.ts',
    ]);
  });

  it('orders them as the spec does, off position zero', () => {
    expect(MENU.map(({ item }) => item.config.position)).toEqual([
      -2, -1, 1, 2, 3, 4, 5, 5.5, 6, 7, 8, 9, 10,
    ]);
  });

  it('names the object each item cannot work without', () => {
    expect(
      MENU.map(({ item }) => item.config.targetObjectUniversalIdentifier),
    ).toEqual(MENU.map(({ requires }) => requires));
  });

  it('labels the pages itself and takes the label of a view item from its view', () => {
    expect(MENU.map(({ item }) => item.config.name)).toEqual([
      'Сегодня',
      undefined,
      'В работе',
      'Новый замер',
      undefined,
      'Склад',
      'Цены',
      'Договор',
      'ЗП',
      undefined,
      'Перезвоны',
      'Маркетинг',
      'Деньги',
    ]);
    expect(clients.config.viewUniversalIdentifier).toBe(IDS.view.clients);
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
      [
        'Заказы',
        'В работе',
        'Новый замер',
        'Мои замеры',
        'Склад',
        'Цены',
        'Клиенты',
        'Перезвоны',
        'Маркетинг',
      ],
    ],
  ])('shows %s the menu of the spec, first item first', (_, role, labels) => {
    expect(menuOf(role)).toEqual(labels);
  });
});
