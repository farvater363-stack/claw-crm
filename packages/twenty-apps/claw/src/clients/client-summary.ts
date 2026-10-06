import {
  type CallBackReason,
  type CallResult,
  type ClientStatus,
} from 'src/constants/select-options';
import {
  isCancelled,
  isInstalled,
  isMeasured,
  isSold,
  isStatusIn,
  LEAD_STATUSES,
} from 'src/constants/order-status-sets';
import { addDays, todayInTashkent } from 'src/pricing/dates';

export type ClientOrder = {
  status: string | null;
  total: number | null;
  balance: number | null;
  createdAt: string;
  installedAt: string | null;
  cancelReason: string | null;
};

export type ClientSummary = {
  clientStatus: ClientStatus;
  ordersCount: number;
  totalSpent: number;
  owes: number;
  quoted: number | null;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  lastInstalledAt: string | null;
  refusalReason: string | null;
};

export type CallBack = { at: string | null; reason: CallBackReason | null };

export const CALL_BACK_DAYS = {
  afterMeasurement: 3,
  afterInstallation: 7,
  unreachable: 1,
} as const;

const dayOf = (isoDateTime: string): string =>
  todayInTashkent(new Date(isoDateTime));

const latestFirst = (orders: readonly ClientOrder[]): ClientOrder[] =>
  [...orders].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

const clientStatusOf = (orders: readonly ClientOrder[]): ClientStatus => {
  const soldCount = orders.filter((order) => isSold(order.status)).length;

  if (soldCount >= 2) return 'REPEAT';
  if (soldCount === 1) return 'BOUGHT';
  if (orders.some((order) => isMeasured(order.status))) return 'THINKING';
  if (orders.length > 0 && orders.every((order) => isCancelled(order.status))) {
    return 'REFUSED';
  }

  return 'NEW';
};

export const computeClientSummary = (
  orders: readonly ClientOrder[],
): ClientSummary => {
  const newestFirst = latestFirst(orders);
  const sold = orders.filter((order) => isSold(order.status));
  const clientStatus = clientStatusOf(orders);
  const lastUnsold = newestFirst.find(
    (order) =>
      !isSold(order.status) && !isStatusIn(LEAD_STATUSES, order.status),
  );
  const installedDays = orders
    .map((order) => order.installedAt)
    .filter((day): day is string => day !== null)
    .sort();

  return {
    clientStatus,
    ordersCount: orders.length,
    totalSpent: sold.reduce((sum, order) => sum + (order.total ?? 0), 0),
    owes: sold.reduce((sum, order) => sum + Math.max(0, order.balance ?? 0), 0),
    // What we asked of a client who has not bought: the price they turned down
    // or are still thinking about.
    quoted:
      sold.length === 0 &&
      lastUnsold !== undefined &&
      (lastUnsold.total ?? 0) > 0
        ? lastUnsold.total
        : null,
    firstOrderAt:
      newestFirst.length > 0
        ? dayOf(newestFirst[newestFirst.length - 1].createdAt)
        : null,
    lastOrderAt:
      newestFirst.length > 0 ? dayOf(newestFirst[0].createdAt) : null,
    lastInstalledAt: installedDays[installedDays.length - 1] ?? null,
    refusalReason:
      clientStatus === 'REFUSED'
        ? (newestFirst.find((order) => isCancelled(order.status))
            ?.cancelReason ?? null)
        : null,
  };
};

const wanted = ({
  status,
  cancelReason,
  today,
}: {
  status: string | null;
  cancelReason: string | null;
  today: string;
}): CallBack | null => {
  if (isMeasured(status)) {
    return {
      at: addDays(today, CALL_BACK_DAYS.afterMeasurement),
      reason: 'AFTER_MEASUREMENT',
    };
  }

  if (isInstalled(status)) {
    return {
      at: addDays(today, CALL_BACK_DAYS.afterInstallation),
      reason: 'AFTER_INSTALLATION',
    };
  }

  if (isCancelled(status) && cancelReason === 'UNREACHABLE') {
    return {
      at: addDays(today, CALL_BACK_DAYS.unreachable),
      reason: 'UNREACHABLE',
    };
  }

  return null;
};

// What an order's step does to its client's next call; null leaves it alone.
export const planCallBackOnOrderChange = ({
  status,
  previousStatus,
  cancelReason,
  previousCancelReason,
  current,
  today,
}: {
  status: string | null;
  previousStatus: string | null;
  cancelReason: string | null;
  previousCancelReason: string | null;
  current: CallBack;
  today: string;
}): CallBack | null => {
  if (status === previousStatus && cancelReason === previousCancelReason) {
    return null;
  }

  const next = wanted({ status, cancelReason, today });

  if (next === null) {
    // A sale or a refusal answers the call that waited for a decision.
    const isDecided = isSold(status) || isCancelled(status);

    return isDecided && current.reason === 'AFTER_MEASUREMENT'
      ? { at: null, reason: null }
      : null;
  }

  if (next.reason === current.reason && current.at !== null) return null;

  // A call the manager already planned for sooner stays; a stale wait for a
  // decision gives way to the next step's call.
  if (
    current.at !== null &&
    current.at <= (next.at ?? '') &&
    current.reason !== 'AFTER_MEASUREMENT'
  ) {
    return null;
  }

  return next;
};

export const callBackAfterCall = ({
  result,
  nextCallAt,
}: {
  result: CallResult | null;
  nextCallAt: string | null;
}): CallBack =>
  nextCallAt === null
    ? { at: null, reason: null }
    : {
        at: nextCallAt,
        reason: result === 'NO_ANSWER' ? 'UNREACHABLE' : 'AGREED',
      };
