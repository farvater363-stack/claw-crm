import {
  isInProduction,
  isSentToInstallation,
} from 'src/constants/order-status-sets';
import {
  PRODUCTION_STAGE_OPTIONS,
  type ProductionStage,
} from 'src/constants/select-options';

export type WorkshopItem = {
  id: string;
  designName: string | null;
  metalLabel: string | null;
  size: string;
  quantity: number;
  areaSquareMeters: number | null;
  notes: string | null;
  designPhotoUrl: string | null;
  openingPhotoUrls: string[];
};

export type WorkshopService = { id: string; name: string; quantity: number };

export type WorkshopMaterial = {
  id: string;
  name: string;
  plannedQuantity: number | null;
  unitLabel: string;
  // The warehouse holds less than nothing of it: this order's write-off took
  // stock that was never bought.
  isShort: boolean;
};

export type WorkshopOrder = {
  id: string;
  name: string;
  status: string | null;
  stage: ProductionStage | null;
  isUrgent: boolean;
  masterId: string | null;
  masterName: string | null;
  installerName: string | null;
  clientName: string | null;
  districtLabel: string | null;
  addressLine: string | null;
  floor: number | null;
  comment: string | null;
  paintColor: string | null;
  startDate: string | null;
  deadline: string | null;
  areaSquareMeters: number | null;
  items: WorkshopItem[];
  services: WorkshopService[];
  materials: WorkshopMaterial[];
  finishedPhotoUrls: string[];
};

export type Tone = 'danger' | 'warning' | 'success' | null;

export type DeadlineReading = {
  // Short, for the card's corner: «−16 дн», «сегодня», «7 дн»
  badge: string;
  // A sentence, for the line under the time bar
  daysLeftText: string;
  tone: Tone;
  daysLeft: number | null;
  // How much of the time from the start of production to the deadline has
  // passed, 0 to 100; null without both dates
  timeUsedPercent: number | null;
};

export type WorkshopCard = WorkshopOrder & DeadlineReading;

export type ColumnKey = 'QUEUE' | ProductionStage | 'SENT';

export const QUEUE_KEY = 'QUEUE';
export const SENT_KEY = 'SENT';
export const NO_MASTER_KEY = 'none';

// The workshop's way through an order, left to right. The last column holds
// the orders already sent to installation.
export const COLUMNS: readonly { key: ColumnKey; title: string }[] = [
  { key: QUEUE_KEY, title: 'Очередь' },
  ...PRODUCTION_STAGE_OPTIONS.map((option) => ({
    key: option.value,
    title: option.label,
  })),
  { key: SENT_KEY, title: 'На установку' },
];

export const STAGE_COLUMNS = COLUMNS.filter((column) => column.key !== SENT_KEY);

export type BoardColumn = {
  key: ColumnKey;
  title: string;
  cards: WorkshopCard[];
  areaSquareMeters: number;
};

export type MasterLane = {
  key: string;
  title: string;
  inWorkCount: number;
};

export type WorkshopSummary = {
  inWork: number;
  overdue: number;
  dueToday: number;
  shortOfMaterial: number;
  areaSquareMeters: number;
};

const MILLISECONDS_PER_DAY = 86_400_000;

export const daysWord = (count: number): string => {
  const lastDigit = count % 10;
  const lastTwo = count % 100;

  if (lastDigit === 1 && lastTwo !== 11) return 'день';

  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return 'дня';
  }

  return 'дней';
};

const daysBetween = (from: string, to: string): number =>
  Math.round(
    (Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) /
      MILLISECONDS_PER_DAY,
  );

export const readDeadline = (
  order: Pick<WorkshopOrder, 'deadline' | 'startDate'>,
  today: string,
): DeadlineReading => {
  const { deadline, startDate } = order;

  if (deadline === null) {
    return {
      badge: 'без срока',
      daysLeftText: 'срок не указан',
      tone: null,
      daysLeft: null,
      timeUsedPercent: null,
    };
  }

  const daysLeft = daysBetween(today, deadline);
  const totalDays = startDate === null ? 0 : daysBetween(startDate, deadline);
  const timeUsedPercent =
    totalDays > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              (daysBetween(startDate ?? today, today) / totalDays) * 100,
            ),
          ),
        )
      : daysLeft < 0
        ? 100
        : null;

  if (daysLeft < 0) {
    return {
      badge: `−${-daysLeft} дн`,
      daysLeftText: `просрочен на ${-daysLeft} ${daysWord(-daysLeft)}`,
      tone: 'danger',
      daysLeft,
      timeUsedPercent,
    };
  }

  if (daysLeft === 0) {
    return {
      badge: 'сегодня',
      daysLeftText: 'сдать сегодня',
      tone: 'warning',
      daysLeft,
      timeUsedPercent,
    };
  }

  if (daysLeft === 1) {
    return {
      badge: 'завтра',
      daysLeftText: 'сдать завтра',
      tone: 'warning',
      daysLeft,
      timeUsedPercent,
    };
  }

  const word = daysWord(daysLeft);

  return {
    badge: `${daysLeft} дн`,
    daysLeftText: `${word === 'день' ? 'остался' : 'осталось'} ${daysLeft} ${word}`,
    tone: 'success',
    daysLeft,
    timeUsedPercent,
  };
};

export const columnKeyOf = (order: WorkshopOrder): ColumnKey | null => {
  if (isSentToInstallation(order.status)) return SENT_KEY;

  if (!isInProduction(order.status)) return null;

  return order.stage ?? QUEUE_KEY;
};

export const masterKeyOf = (order: WorkshopOrder): string =>
  order.masterId ?? NO_MASTER_KEY;

// Urgent first, then the nearest deadline; an order without one goes last.
const byUrgencyThenDeadline = (left: WorkshopOrder, right: WorkshopOrder) =>
  Number(right.isUrgent) - Number(left.isUrgent) ||
  (left.deadline ?? '9999').localeCompare(right.deadline ?? '9999') ||
  left.name.localeCompare(right.name, 'ru', { numeric: true });

const sumArea = (orders: WorkshopOrder[]): number =>
  Math.round(
    orders.reduce((sum, order) => sum + (order.areaSquareMeters ?? 0), 0) * 10,
  ) / 10;

export const buildWorkshopBoard = (
  orders: WorkshopOrder[],
  today: string,
  masterKey: string | null = null,
): {
  columns: BoardColumn[];
  lanes: MasterLane[];
  summary: WorkshopSummary;
} => {
  const onBoard = orders.filter((order) => columnKeyOf(order) !== null);
  const shown =
    masterKey === null
      ? onBoard
      : onBoard.filter((order) => masterKeyOf(order) === masterKey);
  const cards = [...shown]
    .sort(byUrgencyThenDeadline)
    .map((order): WorkshopCard => ({ ...order, ...readDeadline(order, today) }));
  const inWork = cards.filter((card) => isInProduction(card.status));

  const laneByKey = new Map<string, MasterLane>();

  for (const order of onBoard) {
    const key = masterKeyOf(order);
    const lane = laneByKey.get(key) ?? {
      key,
      title:
        order.masterId === null
          ? 'Без мастера'
          : (order.masterName ?? 'Без имени'),
      inWorkCount: 0,
    };

    if (isInProduction(order.status)) lane.inWorkCount += 1;

    laneByKey.set(key, lane);
  }

  return {
    columns: COLUMNS.map((column) => {
      const columnCards = cards.filter(
        (card) => columnKeyOf(card) === column.key,
      );

      return {
        ...column,
        cards: columnCards,
        areaSquareMeters: sumArea(columnCards),
      };
    }),
    lanes: [...laneByKey.values()].sort(
      (left, right) =>
        Number(right.key === NO_MASTER_KEY) -
          Number(left.key === NO_MASTER_KEY) ||
        left.title.localeCompare(right.title, 'ru'),
    ),
    summary: {
      inWork: inWork.length,
      overdue: inWork.filter((card) => card.tone === 'danger').length,
      dueToday: inWork.filter((card) => card.daysLeft === 0).length,
      shortOfMaterial: inWork.filter((card) =>
        card.materials.some((material) => material.isShort),
      ).length,
      areaSquareMeters: sumArea(inWork),
    },
  };
};

// The stage a card's button moves an order to; after the last one, «Готово».
export const nextStageOf = (
  stage: ProductionStage | null,
): ProductionStage | 'READY' => {
  const stages = PRODUCTION_STAGE_OPTIONS.map((option) => option.value);
  const next = stage === null ? stages[0] : stages[stages.indexOf(stage) + 1];

  return next ?? 'READY';
};

export const NEXT_STEP_LABEL: Record<ProductionStage | 'READY', string> = {
  CUTTING: 'В резку',
  WELDING: 'В сварку',
  PAINTING: 'В покраску',
  READY: 'Готово',
};

export const stageOfColumn = (key: ColumnKey): ProductionStage | null =>
  key === QUEUE_KEY || key === SENT_KEY ? null : key;
