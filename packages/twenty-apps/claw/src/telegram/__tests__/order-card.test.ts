import { describe, expect, it } from 'vitest';

import { buildOrderCard, type OrderCardInput } from 'src/telegram/order-card';

const FULL: OrderCardInput = {
  name: '1043',
  installationDeadline: '2026-10-29',
  clientFullName: 'Тест Тестов',
  clientPhone: '+998 90 000 00 00',
  districtLabel: 'Юнусабад',
  addressLine: 'ул. Тестовая 1, кв. 2',
  floor: 5,
  locationNote: 'Вход со двора',
  installerName: 'Установщик Тест',
  hasPoint: true,
  extraPhotoCount: 0,
  orderUrl: 'https://crm.example.test/object/order/abc',
};

const EMPTY: OrderCardInput = {
  ...FULL,
  installationDeadline: null,
  clientFullName: null,
  clientPhone: null,
  districtLabel: null,
  addressLine: null,
  floor: null,
  locationNote: null,
  installerName: null,
  hasPoint: false,
};

describe('order card', () => {
  it('lists everything an installer needs, in order', () => {
    expect(buildOrderCard(FULL).split('\n')).toEqual([
      '<b>Заказ №1043</b> · Срок 29 октября',
      'Тест Тестов · +998 90 000 00 00',
      'Юнусабад, ул. Тестовая 1, кв. 2, 5 эт.',
      'Как найти: Вход со двора',
      'Установщик: Установщик Тест',
      '<a href="https://crm.example.test/object/order/abc">Открыть в CRM</a>',
    ]);
  });

  it('leaves out what is unknown and warns when there is no point', () => {
    expect(buildOrderCard(EMPTY).split('\n')).toEqual([
      '<b>Заказ №1043</b>',
      '⚠ точка не указана',
      '<a href="https://crm.example.test/object/order/abc">Открыть в CRM</a>',
    ]);
  });

  it('escapes what Telegram would read as markup', () => {
    expect(buildOrderCard({ ...FULL, clientFullName: 'A <b> & B' })).toContain(
      'A &lt;b&gt; &amp; B',
    );
  });

  it('says how many photos stayed in the CRM', () => {
    expect(buildOrderCard({ ...FULL, extraPhotoCount: 3 })).toContain(
      'ещё 3 фото в CRM',
    );
  });
});
