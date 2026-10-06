import {
  type MarketingClient,
  type MarketingOrder,
} from 'src/clients/load-clients';
import {
  isCancelled,
  isSold,
  isStatusIn,
  LEAD_STATUSES,
} from 'src/constants/order-status-sets';
import {
  CANCEL_REASON_OPTIONS,
  SOURCE_OPTIONS,
} from 'src/constants/select-options';

export type MarketingPeriod = 'month' | 'quarter' | 'year' | 'all';

export const MARKETING_PERIODS: { value: MarketingPeriod; label: string }[] = [
  { value: 'month', label: 'Этот месяц' },
  { value: 'quarter', label: '3 месяца' },
  { value: 'year', label: 'Год' },
  { value: 'all', label: 'Всё время' },
];

const MONTHS_BACK: Record<Exclude<MarketingPeriod, 'all'>, number> = {
  month: 0,
  quarter: 2,
  year: 11,
};

// The first day counted: whole calendar months, this one included.
export const periodStart = (
  period: MarketingPeriod,
  today: string,
): string | null => {
  if (period === 'all') return null;

  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1 - MONTHS_BACK[period];
  const start = new Date(Date.UTC(year, month, 1));

  return start.toISOString().slice(0, 10);
};

export type SourceRow = {
  source: string | null;
  label: string;
  leads: number;
  measured: number;
  sold: number;
  conversionPercent: number | null;
  revenue: number;
  averageOrder: number | null;
  topRefusal: string | null;
};

const NO_SOURCE = 'Не указан';

const topRefusalOf = (orders: readonly MarketingOrder[]): string | null => {
  const counts = new Map<string, number>();

  for (const order of orders) {
    if (!isCancelled(order.status) || order.cancelReason === null) continue;

    counts.set(order.cancelReason, (counts.get(order.cancelReason) ?? 0) + 1);
  }

  const [top] = [...counts].sort((left, right) => right[1] - left[1]);

  return top === undefined
    ? null
    : (CANCEL_REASON_OPTIONS.find((option) => option.value === top[0])?.label ??
        null);
};

// Orders that came in during the period, grouped by where the client found us.
export const sourceRows = (
  orders: readonly MarketingOrder[],
  period: MarketingPeriod,
  today: string,
): SourceRow[] => {
  const start = periodStart(period, today);
  const inPeriod = orders.filter(
    (order) => start === null || order.createdOn >= start,
  );
  const sources: (string | null)[] = [
    ...SOURCE_OPTIONS.map((option) => option.value),
    null,
  ];

  return sources
    .map((source) => {
      const ofSource = inPeriod.filter((order) => order.source === source);
      const sold = ofSource.filter((order) => isSold(order.status));
      const revenue = sold.reduce((sum, order) => sum + (order.total ?? 0), 0);

      return {
        source,
        label:
          SOURCE_OPTIONS.find((option) => option.value === source)?.label ??
          NO_SOURCE,
        leads: ofSource.length,
        // Measured or further on: an order sold without a recorded measurement
        // was measured all the same.
        measured: ofSource.filter(
          (order) =>
            order.measuredOn !== null ||
            isSold(order.status) ||
            (!isStatusIn(LEAD_STATUSES, order.status) &&
              !isCancelled(order.status)),
        ).length,
        sold: sold.length,
        conversionPercent:
          ofSource.length === 0
            ? null
            : Math.round((sold.length / ofSource.length) * 100),
        revenue,
        averageOrder:
          sold.length === 0 ? null : Math.round(revenue / sold.length),
        topRefusal: topRefusalOf(ofSource),
      };
    })
    .filter((row) => row.leads > 0)
    .sort(
      (left, right) => right.revenue - left.revenue || right.leads - left.leads,
    );
};

export type ClientTotals = {
  buyers: number;
  repeat: number;
  topClients: MarketingClient[];
  topReferrers: { client: MarketingClient; count: number }[];
};

const TOP_COUNT = 5;

export const clientTotals = (
  clients: readonly MarketingClient[],
): ClientTotals => {
  const byId = new Map(clients.map((client) => [client.id, client]));
  const referralCounts = new Map<string, number>();

  for (const client of clients) {
    if (client.referredById === null) continue;

    referralCounts.set(
      client.referredById,
      (referralCounts.get(client.referredById) ?? 0) + 1,
    );
  }

  return {
    buyers: clients.filter(
      (client) =>
        client.clientStatus === 'BOUGHT' || client.clientStatus === 'REPEAT',
    ).length,
    repeat: clients.filter((client) => client.clientStatus === 'REPEAT').length,
    topClients: [...clients]
      .filter((client) => client.totalSpent > 0)
      .sort((left, right) => right.totalSpent - left.totalSpent)
      .slice(0, TOP_COUNT),
    topReferrers: [...referralCounts]
      .flatMap(([id, count]) => {
        const client = byId.get(id);

        return client === undefined ? [] : [{ client, count }];
      })
      .sort((left, right) => right.count - left.count)
      .slice(0, TOP_COUNT),
  };
};
