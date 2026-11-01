import { describe, expect, it } from 'vitest';

import {
  buildOrderCard,
  type OrderCardInput,
  TELEGRAM_MESSAGE_LIMIT,
} from 'src/telegram/order-card';

const FULL: OrderCardInput = {
  name: '1043',
  installationDeadline: '2026-10-29',
  isUrgent: true,
  clientFullName: 'Тест Тестов',
  clientPhone: '+998 90 000 00 00',
  districtLabel: 'Юнусабад',
  addressLine: 'ул. Тестовая 1, кв. 2',
  floor: 5,
  locationNote: 'Вход со двора',
  installerName: 'Установщик Тест',
  paintColor: 'Чёрный мат',
  openings: [
    {
      title: 'Проём 1',
      quantity: 2,
      product: 'Классика',
      sizeText: 'арка 120×150×10, установка снаружи · 2,97 м²',
      visorText: 'Козырёк Стандарт, 120 см',
      notes: 'Старая рама',
    },
    {
      title: 'Проём 2',
      quantity: 1,
      product: 'Перилла Волна',
      sizeText: '450×90 · 4,5 п.м.',
      visorText: null,
      notes: null,
    },
  ],
  services: ['Установка', 'Доставка × 2 шт'],
  comment: 'Позвонить за час',
  money: { total: 1_250_000, paid: 500_000, balance: 750_000 },
  hasPoint: true,
  extraPhotoCount: 0,
  orderUrl: 'https://crm.example.test/object/order/abc',
};

const EMPTY: OrderCardInput = {
  ...FULL,
  installationDeadline: null,
  isUrgent: false,
  clientFullName: null,
  clientPhone: null,
  districtLabel: null,
  addressLine: null,
  floor: null,
  locationNote: null,
  installerName: null,
  paintColor: null,
  openings: [],
  services: [],
  comment: null,
  money: null,
  hasPoint: false,
};

describe('order card', () => {
  it('lists everything an installer needs, in order', () => {
    expect(buildOrderCard(FULL).split('\n')).toEqual([
      '<b>Заказ №1043</b> · Срок 29 октября · <b>СРОЧНО</b>',
      'Тест Тестов · +998 90 000 00 00',
      'Юнусабад, ул. Тестовая 1, кв. 2, 5 эт.',
      'Как найти: Вход со двора',
      'Установщик: Установщик Тест',
      '',
      'Цвет покраски: <b>Чёрный мат</b>',
      '<b>Проём 1 × 2</b> — Классика',
      '   арка 120×150×10, установка снаружи · 2,97 м²',
      '   + Козырёк Стандарт, 120 см',
      '   Заметка: Старая рама',
      '<b>Проём 2</b> — Перилла Волна',
      '   450×90 · 4,5 п.м.',
      '',
      'Услуги: Установка, Доставка × 2 шт',
      'Комментарий: Позвонить за час',
      '',
      'Итого: 1,250,000 сум',
      'Оплачено: 500,000 сум',
      '<b>Остаток к оплате: 750,000 сум</b>',
      '',
      '<a href="https://crm.example.test/object/order/abc">Открыть в CRM</a>',
    ]);
  });

  it('leaves out what is unknown and warns when there is no point', () => {
    expect(buildOrderCard(EMPTY).split('\n')).toEqual([
      '<b>Заказ №1043</b>',
      '⚠ точка не указана',
      '',
      '<a href="https://crm.example.test/object/order/abc">Открыть в CRM</a>',
    ]);
  });

  it('says a paid order owes nothing', () => {
    expect(
      buildOrderCard({
        ...FULL,
        money: { total: 1_250_000, paid: 1_250_000, balance: 0 },
      }),
    ).toContain('<b>Оплачено полностью</b>');
  });

  it('escapes what Telegram would read as markup', () => {
    expect(
      buildOrderCard({ ...FULL, clientFullName: 'A <b> & B', comment: '<i>' }),
    ).toContain('A &lt;b&gt; &amp; B');
    expect(buildOrderCard({ ...FULL, comment: '<i>' })).toContain(
      'Комментарий: &lt;i&gt;',
    );
  });

  it('says how many photos stayed in the CRM', () => {
    expect(buildOrderCard({ ...FULL, extraPhotoCount: 3 })).toContain(
      'ещё 3 фото в CRM',
    );
  });

  it('drops the last проёмы to stay under Telegram’s limit, money kept', () => {
    const card = buildOrderCard({
      ...FULL,
      openings: Array.from({ length: 80 }, (_, index) => ({
        ...FULL.openings[0],
        title: `Проём ${index + 1}`,
      })),
    });

    expect(card.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
    expect(card).toMatch(/ещё \d+ — в схеме/);
    expect(card).toContain('Остаток к оплате: 750,000 сум');
  });
});
