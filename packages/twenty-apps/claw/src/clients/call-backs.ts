import { type ClientCard } from 'src/clients/load-clients';
import { CANCEL_REASON_OPTIONS } from 'src/constants/select-options';
import { addDays } from 'src/pricing/dates';

export type CallBackTab = 'due' | 'thinking' | 'refused';

const MILLISECONDS_PER_DAY = 86_400_000;
// A call planned this far ahead is shown under «Скоро», not lost in a list.
const SOON_DAYS = 7;

export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / MILLISECONDS_PER_DAY);

export type CallBackLists = {
  due: ClientCard[];
  soon: ClientCard[];
  thinking: ClientCard[];
  refused: ClientCard[];
};

const byCallBack = (left: ClientCard, right: ClientCard) =>
  (left.callBackAt ?? '').localeCompare(right.callBackAt ?? '');

export const buildCallBackLists = (
  clients: readonly ClientCard[],
  today: string,
): CallBackLists => {
  const soonEnd = addDays(today, SOON_DAYS);

  return {
    due: clients
      .filter(
        (client) => client.callBackAt !== null && client.callBackAt <= today,
      )
      .sort(byCallBack),
    soon: clients
      .filter(
        (client) =>
          client.callBackAt !== null &&
          client.callBackAt > today &&
          client.callBackAt <= soonEnd,
      )
      .sort(byCallBack),
    // The longest wait first: they are the likeliest to be lost.
    thinking: clients
      .filter((client) => client.clientStatus === 'THINKING')
      .sort((left, right) =>
        (left.lastOrderAt ?? '').localeCompare(right.lastOrderAt ?? ''),
      ),
    refused: clients
      .filter((client) => client.clientStatus === 'REFUSED')
      .sort((left, right) =>
        (right.lastOrderAt ?? '').localeCompare(left.lastOrderAt ?? ''),
      ),
  };
};

export const callBackWhen = (callBackAt: string, today: string): string => {
  const days = daysBetween(today, callBackAt);

  if (days === 0) return 'сегодня';
  if (days === -1) return 'вчера';
  if (days < 0) return `${-days} дн. назад`;
  if (days === 1) return 'завтра';

  return `через ${days} дн.`;
};

export type ReasonCount = { reason: string; label: string; count: number };

// Refusals of this month by reason, the commonest first.
export const refusalsByReason = (
  clients: readonly ClientCard[],
  today: string,
): ReasonCount[] => {
  const month = today.slice(0, 7);
  const counts = new Map<string, number>();

  for (const client of clients) {
    if (client.clientStatus !== 'REFUSED') continue;
    if (client.lastOrderAt?.slice(0, 7) !== month) continue;

    const reason = client.refusalReason ?? 'OTHER';

    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return [...counts]
    .map(([reason, count]) => ({
      reason,
      label:
        CANCEL_REASON_OPTIONS.find((option) => option.value === reason)
          ?.label ?? 'Другое',
      count,
    }))
    .sort((left, right) => right.count - left.count);
};
