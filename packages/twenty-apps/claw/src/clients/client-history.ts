import {
  isCancelled,
  isInstalled,
  isSold,
} from 'src/constants/order-status-sets';
import {
  CANCEL_REASON_OPTIONS,
  ORDER_STATUS_OPTIONS,
} from 'src/constants/select-options';
import { type Tone } from 'src/ui/tokens';

export type HistoryLine = { name: string; quantity: number };

export type HistoryOrder = {
  id: string;
  name: string;
  status: string | null;
  createdOn: string;
  measuredOn: string | null;
  installedOn: string | null;
  total: number | null;
  paid: number | null;
  balance: number | null;
  cancelReason: string | null;
  lines: HistoryLine[];
};

const labelOf = (
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null,
): string | null =>
  options.find((option) => option.value === value)?.label ?? null;

export const statusLabel = (order: HistoryOrder): string => {
  const label = labelOf(ORDER_STATUS_OPTIONS, order.status) ?? 'Без статуса';
  const reason = labelOf(CANCEL_REASON_OPTIONS, order.cancelReason);

  return isCancelled(order.status) && reason !== null
    ? `${label}: ${reason}`
    : label;
};

export const statusTone = (status: string | null): Tone =>
  isCancelled(status)
    ? 'danger'
    : isInstalled(status)
      ? 'success'
      : isSold(status)
        ? 'warning'
        : 'neutral';

// «Решётка «Солнце» × 2, Козырёк»: what was made, in one line.
export const describeLines = (lines: readonly HistoryLine[]): string | null => {
  const merged = new Map<string, number>();

  for (const line of lines) {
    const name = line.name.trim();

    if (name === '') continue;

    merged.set(name, (merged.get(name) ?? 0) + line.quantity);
  }

  if (merged.size === 0) return null;

  return [...merged]
    .map(([name, quantity]) => (quantity > 1 ? `${name} × ${quantity}` : name))
    .join(', ');
};

export const newestFirst = (orders: readonly HistoryOrder[]): HistoryOrder[] =>
  [...orders].sort((left, right) =>
    right.createdOn.localeCompare(left.createdOn),
  );

// A call is filed under the order it is about: the newest one still open, or
// else the newest of all.
export const orderForCall = (
  orders: readonly HistoryOrder[],
): string | null => {
  const sorted = newestFirst(orders);

  return (
    sorted.find(
      (order) => !isCancelled(order.status) && !isInstalled(order.status),
    )?.id ??
    sorted[0]?.id ??
    null
  );
};
