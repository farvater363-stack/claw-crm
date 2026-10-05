import {
  isInProduction,
  isSentToInstallation,
} from 'src/constants/order-status-sets';

export type WorkshopOrder = {
  id: string;
  name: string;
  status: string | null;
  masterId: string | null;
  masterName: string | null;
  installerName: string | null;
  deadline: string | null;
  lines: string[];
};

type DeadlineReading = {
  daysLeftText: string;
  tone: 'danger' | 'warning' | null;
};

export type WorkshopColumn = {
  key: string;
  title: string;
  cards: (WorkshopOrder & DeadlineReading)[];
};

const MILLISECONDS_PER_DAY = 86_400_000;
const NO_MASTER_KEY = 'none';

const daysWord = (count: number): string => {
  const lastDigit = count % 10;
  const lastTwo = count % 100;

  if (lastDigit === 1 && lastTwo !== 11) return 'день';

  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return 'дня';
  }

  return 'дней';
};

const readDeadline = (
  deadline: string | null,
  today: string,
): DeadlineReading => {
  if (deadline === null) return { daysLeftText: 'срок не указан', tone: null };

  const days = Math.round(
    (Date.parse(deadline.slice(0, 10)) - Date.parse(today)) /
      MILLISECONDS_PER_DAY,
  );

  if (days < 0) {
    return {
      daysLeftText: `просрочен на ${-days} ${daysWord(-days)}`,
      tone: 'danger',
    };
  }

  if (days === 0) return { daysLeftText: 'сегодня', tone: 'warning' };
  if (days === 1) return { daysLeftText: 'завтра', tone: null };

  const word = daysWord(days);

  return {
    daysLeftText: `${word === 'день' ? 'остался' : 'осталось'} ${days} ${word}`,
    tone: null,
  };
};

// A date sorts as text; an order without one goes last.
const byDeadline = (left: WorkshopOrder, right: WorkshopOrder) =>
  (left.deadline ?? '9999').localeCompare(right.deadline ?? '9999') ||
  left.name.localeCompare(right.name, 'ru', { numeric: true });

export const buildWorkshopBoard = (
  orders: WorkshopOrder[],
  today: string,
): { columns: WorkshopColumn[]; sent: WorkshopOrder[] } => {
  const columnByKey = new Map<string, WorkshopColumn>();

  for (const order of orders
    .filter((candidate) => isInProduction(candidate.status))
    .sort(byDeadline)) {
    const key = order.masterId ?? NO_MASTER_KEY;
    const column = columnByKey.get(key) ?? {
      key,
      title:
        order.masterId === null
          ? 'Без мастера'
          : (order.masterName ?? 'Без имени'),
      cards: [],
    };

    column.cards.push({ ...order, ...readDeadline(order.deadline, today) });
    columnByKey.set(key, column);
  }

  return {
    columns: [...columnByKey.values()].sort(
      (left, right) =>
        Number(right.key === NO_MASTER_KEY) -
          Number(left.key === NO_MASTER_KEY) ||
        left.title.localeCompare(right.title, 'ru'),
    ),
    sent: orders
      .filter((candidate) => isSentToInstallation(candidate.status))
      .sort(byDeadline),
  };
};
