import { describe, expect, it } from 'vitest';

import { type ClientCard } from 'src/clients/load-clients';
import { dashboardOrder } from 'src/dashboard/__tests__/dashboard-order';
import { buildToday, dayTitle, daySummary } from 'src/dashboard/today';

const TODAY = '2026-10-08';

const client = (overrides: Partial<ClientCard>): ClientCard => ({
  id: 'client',
  name: 'Шахло Каримова',
  phone: null,
  clientStatus: 'THINKING',
  ordersCount: 1,
  totalSpent: 0,
  owes: 0,
  quoted: null,
  firstOrderAt: null,
  lastOrderAt: null,
  refusalReason: null,
  source: null,
  callBackAt: null,
  callBackReason: null,
  lastCallAt: null,
  lastCallNote: null,
  ...overrides,
});

const build = (
  orders: Parameters<typeof buildToday>[0]['orders'],
  extra: Partial<Parameters<typeof buildToday>[0]> = {},
) =>
  buildToday({
    orders,
    payments: [],
    callBackClients: [],
    today: TODAY,
    ...extra,
  });

describe('buildToday', () => {
  it('lists today’s visits by the hour and the past ones nobody marked', () => {
    const view = build([
      dashboardOrder({
        id: 'late-visit',
        status: 'MEASUREMENT_SCHEDULED',
        measurementDay: TODAY,
        measurementTime: '15:00',
      }),
      dashboardOrder({
        id: 'early-visit',
        status: 'MEASUREMENT_SCHEDULED',
        measurementDay: TODAY,
        measurementTime: '10:00',
      }),
      dashboardOrder({
        id: 'missed',
        status: 'MEASUREMENT_SCHEDULED',
        measurementDay: '2026-10-06',
      }),
      dashboardOrder({
        id: 'measured',
        status: 'MEASURED',
        measurementDay: TODAY,
      }),
      dashboardOrder({
        id: 'tomorrow',
        status: 'MEASUREMENT_SCHEDULED',
        measurementDay: '2026-10-09',
      }),
    ]);

    expect(view.visits.map((order) => order.id)).toEqual([
      'early-visit',
      'late-visit',
    ]);
    expect(view.missedVisits.map((order) => order.id)).toEqual(['missed']);
  });

  it('finds open orders past their deadline, the latest first, and skips built ones', () => {
    const view = build([
      dashboardOrder({
        id: 'one-day',
        status: 'PRODUCTION',
        deadline: '2026-10-07',
      }),
      dashboardOrder({
        id: 'three-days',
        status: 'PRODUCTION',
        deadline: '2026-10-05',
      }),
      dashboardOrder({
        id: 'built',
        status: 'QUALITY_CHECK',
        deadline: '2026-10-01',
      }),
      dashboardOrder({
        id: 'due-today',
        status: 'PRODUCTION',
        deadline: TODAY,
      }),
    ]);

    expect(
      view.late.map(({ order, daysLate }) => [order.id, daysLate]),
    ).toEqual([
      ['three-days', 3],
      ['one-day', 1],
    ]);
  });

  it('adds up what installed clients still owe, the oldest debt first', () => {
    const view = build([
      dashboardOrder({
        id: 'recent',
        status: 'INSTALLED',
        balance: 1_000_000,
        installedAt: '2026-10-07',
      }),
      dashboardOrder({
        id: 'old',
        status: 'INSTALLED',
        balance: 3_200_000,
        installedAt: '2026-09-26',
      }),
      dashboardOrder({ id: 'paid', status: 'INSTALLED', balance: 0 }),
      dashboardOrder({ id: 'in-work', status: 'PRODUCTION', balance: 500_000 }),
    ]);

    expect(
      view.owing.map(({ order, daysSinceInstall }) => [
        order.id,
        daysSinceInstall,
      ]),
    ).toEqual([
      ['old', 12],
      ['recent', 1],
    ]);
    expect(view.owingTotal).toBe(4_200_000);
  });

  it('counts money received today and in the month so far', () => {
    const view = build([], {
      payments: [
        { paidOn: TODAY, amount: 2_400_000 },
        { paidOn: '2026-10-02', amount: 1_000_000 },
        { paidOn: '2026-09-30', amount: 5_000_000 },
      ],
    });

    expect([view.receivedToday, view.receivedThisMonth]).toEqual([
      2_400_000, 3_400_000,
    ]);
  });

  it('shows the workshop by stage, with its area, urgent orders and what is due this week', () => {
    const view = build([
      dashboardOrder({
        id: 'a',
        status: 'PRODUCTION',
        area: 4.2,
        isUrgent: true,
        deadline: '2026-10-10',
      }),
      dashboardOrder({
        id: 'b',
        status: 'PRODUCTION',
        area: 6,
        productionStage: 'WELDING',
        deadline: '2026-10-30',
      }),
      dashboardOrder({ id: 'c', status: 'MEASURED', total: 2_000_000 }),
    ]);

    expect(view.inWorkshop).toEqual({ count: 2, area: 10.2, urgent: 1 });
    expect(view.workshopStages).toEqual([
      { label: 'Ждут', count: 1 },
      { label: 'Резка', count: 0 },
      { label: 'Сварка', count: 1 },
      { label: 'Покраска', count: 0 },
    ]);
    expect(view.dueSoon.map((order) => order.id)).toEqual(['a']);
    expect(view.undecided).toEqual({ count: 1, total: 2_000_000 });
  });

  it('takes the calls due today or missed from the call-back list', () => {
    const view = build([], {
      callBackClients: [
        client({ id: 'due', callBackAt: TODAY }),
        client({ id: 'missed', callBackAt: '2026-10-06' }),
        client({ id: 'later', callBackAt: '2026-10-11' }),
      ],
    });

    expect(view.calls.map((card) => card.id)).toEqual(['missed', 'due']);
  });
});

describe('day header', () => {
  it('names the weekday and the date', () => {
    expect(dayTitle(TODAY)).toBe('Четверг, 8 октября');
  });

  it('says how many visits and calls the day holds', () => {
    const view = build(
      [
        dashboardOrder({
          status: 'MEASUREMENT_SCHEDULED',
          measurementDay: TODAY,
        }),
        dashboardOrder({
          id: 'b',
          status: 'MEASUREMENT_SCHEDULED',
          measurementDay: TODAY,
        }),
      ],
      { callBackClients: [client({ callBackAt: TODAY })] },
    );

    expect(daySummary(view)).toBe('2 замера и 1 звонок на сегодня');
    expect(daySummary(build([]))).toBe('На сегодня замеров и звонков нет');
  });
});
