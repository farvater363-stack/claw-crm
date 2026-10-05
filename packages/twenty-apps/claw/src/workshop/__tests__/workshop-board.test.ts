import { describe, expect, it } from 'vitest';

import {
  buildWorkshopBoard,
  nextStageOf,
  readDeadline,
  type WorkshopOrder,
} from 'src/workshop/workshop-board';

const TODAY = '2026-10-04';

const order = (overrides: Partial<WorkshopOrder>): WorkshopOrder => ({
  id: 'order',
  name: '№1001',
  status: 'PRODUCTION',
  stage: null,
  isUrgent: false,
  masterId: 'worker-a',
  masterName: 'Мастер 2',
  installerName: null,
  clientName: null,
  districtLabel: null,
  addressLine: null,
  floor: null,
  comment: null,
  paintColor: null,
  startDate: null,
  deadline: '2026-10-07',
  areaSquareMeters: null,
  items: [],
  services: [],
  materials: [],
  finishedPhotoUrls: [],
  ...overrides,
});

const idsIn = (board: ReturnType<typeof buildWorkshopBoard>, key: string) =>
  board.columns
    .find((column) => column.key === key)
    ?.cards.map((card) => card.id);

describe('buildWorkshopBoard', () => {
  it('puts each order in the column of its stage, the queue first and installation last', () => {
    const board = buildWorkshopBoard(
      [
        order({ id: 'queued' }),
        order({ id: 'cut', stage: 'CUTTING' }),
        order({ id: 'welded', stage: 'WELDING' }),
        order({ id: 'painted', stage: 'PAINTING' }),
        order({ id: 'sent', status: 'QUALITY_CHECK', stage: 'PAINTING' }),
      ],
      TODAY,
    );

    expect(
      board.columns.map((column) => [
        column.key,
        column.title,
        column.cards.map((card) => card.id),
      ]),
    ).toEqual([
      ['QUEUE', 'Очередь', ['queued']],
      ['CUTTING', 'Резка', ['cut']],
      ['WELDING', 'Сварка', ['welded']],
      ['PAINTING', 'Покраска', ['painted']],
      ['SENT', 'На установку', ['sent']],
    ]);
  });

  it('leaves out every other status', () => {
    const board = buildWorkshopBoard(
      [
        order({ status: 'MEASURED' }),
        order({ status: 'INSTALLED' }),
        order({ status: null }),
      ],
      TODAY,
    );

    expect(board.columns.every((column) => column.cards.length === 0)).toBe(
      true,
    );
    expect(board.lanes).toEqual([]);
  });

  it('sorts a column urgent first, then by deadline, an order without one last', () => {
    const board = buildWorkshopBoard(
      [
        order({ id: 'none', deadline: null }),
        order({ id: 'late', deadline: '2026-10-01' }),
        order({ id: 'urgent', deadline: '2026-10-20', isUrgent: true }),
        order({ id: 'soon', deadline: '2026-10-05' }),
      ],
      TODAY,
    );

    expect(idsIn(board, 'QUEUE')).toEqual(['urgent', 'late', 'soon', 'none']);
  });

  it('gives each master a lane, «Без мастера» first, counting orders still being built', () => {
    const { lanes } = buildWorkshopBoard(
      [
        order({ id: 'a', masterId: 'worker-b', masterName: 'Мастер 1' }),
        order({ id: 'b' }),
        order({ id: 'c', masterId: null, masterName: null }),
        order({ id: 'd', status: 'QUALITY_CHECK' }),
        order({ id: 'e', masterId: 'worker-c', masterName: null }),
      ],
      TODAY,
    );

    expect(lanes).toEqual([
      { key: 'none', title: 'Без мастера', inWorkCount: 1 },
      { key: 'worker-c', title: 'Без имени', inWorkCount: 1 },
      { key: 'worker-b', title: 'Мастер 1', inWorkCount: 1 },
      { key: 'worker-a', title: 'Мастер 2', inWorkCount: 1 },
    ]);
  });

  it('shows one master only, and keeps every lane for the filter', () => {
    const board = buildWorkshopBoard(
      [
        order({ id: 'mine', masterId: 'worker-b', masterName: 'Мастер 1' }),
        order({ id: 'theirs' }),
        order({ id: 'nobody', masterId: null }),
      ],
      TODAY,
      'none',
    );

    expect(idsIn(board, 'QUEUE')).toEqual(['nobody']);
    expect(board.lanes.map((lane) => lane.key)).toEqual([
      'none',
      'worker-b',
      'worker-a',
    ]);
  });

  it('sums the area of each column and of the work in progress', () => {
    const board = buildWorkshopBoard(
      [
        order({ id: 'a', areaSquareMeters: 1.25 }),
        order({ id: 'b', areaSquareMeters: 2.5 }),
        order({ id: 'c', stage: 'WELDING', areaSquareMeters: null }),
        order({ id: 'd', status: 'QUALITY_CHECK', areaSquareMeters: 4 }),
      ],
      TODAY,
    );

    expect(board.columns.map((column) => column.areaSquareMeters)).toEqual([
      3.8, 0, 0, 0, 4,
    ]);
    expect(board.summary.areaSquareMeters).toBe(3.8);
  });

  it('counts the orders being built that are late, due today or short of material', () => {
    const shortLine = {
      id: 'line',
      name: 'Прут 12 мм',
      plannedQuantity: 10,
      unitLabel: 'м',
      isShort: true,
    };
    const { summary } = buildWorkshopBoard(
      [
        order({ deadline: '2026-10-01' }),
        order({ deadline: '2026-10-02', materials: [shortLine] }),
        order({ deadline: '2026-10-04' }),
        order({ deadline: '2026-10-09' }),
        // Built already: not counted against the workshop
        order({ status: 'QUALITY_CHECK', deadline: '2026-09-01' }),
      ],
      TODAY,
    );

    expect(summary).toEqual({
      inWork: 4,
      overdue: 2,
      dueToday: 1,
      shortOfMaterial: 1,
      areaSquareMeters: 0,
    });
  });

  it('leaves the list it was given as it was', () => {
    const orders = [
      order({ id: 'later', deadline: '2026-10-09' }),
      order({ id: 'sooner', deadline: '2026-10-05' }),
    ];

    buildWorkshopBoard(orders, TODAY);

    expect(orders.map((given) => given.id)).toEqual(['later', 'sooner']);
  });
});

describe('readDeadline', () => {
  it.each([
    ['2026-10-07', '3 дн', 'осталось 3 дня', 'success'],
    ['2026-10-09', '5 дн', 'осталось 5 дней', 'success'],
    ['2026-10-25', '21 дн', 'остался 21 день', 'success'],
    ['2026-10-05', 'завтра', 'сдать завтра', 'warning'],
    ['2026-10-04', 'сегодня', 'сдать сегодня', 'warning'],
    ['2026-10-03', '−1 дн', 'просрочен на 1 день', 'danger'],
    ['2026-10-02', '−2 дн', 'просрочен на 2 дня', 'danger'],
    ['2026-09-23', '−11 дн', 'просрочен на 11 дней', 'danger'],
    [null, 'без срока', 'срок не указан', null],
  ])(
    'reads the deadline %s as «%s», «%s»',
    (deadline, badge, daysLeftText, tone) => {
      expect(readDeadline({ deadline, startDate: null }, TODAY)).toMatchObject(
        { badge, daysLeftText, tone },
      );
    },
  );

  it('measures the time used from the start of production to the deadline', () => {
    expect(
      readDeadline({ startDate: '2026-09-30', deadline: '2026-10-10' }, TODAY)
        .timeUsedPercent,
    ).toBe(40);
    expect(
      readDeadline({ startDate: '2026-09-01', deadline: '2026-09-20' }, TODAY)
        .timeUsedPercent,
    ).toBe(100);
    expect(
      readDeadline({ startDate: null, deadline: '2026-10-10' }, TODAY)
        .timeUsedPercent,
    ).toBeNull();
    // A late order without a start date still shows its bar full
    expect(
      readDeadline({ startDate: null, deadline: '2026-10-01' }, TODAY)
        .timeUsedPercent,
    ).toBe(100);
  });
});

describe('nextStageOf', () => {
  it('walks the queue through cutting, welding and painting to «Готово»', () => {
    expect(nextStageOf(null)).toBe('CUTTING');
    expect(nextStageOf('CUTTING')).toBe('WELDING');
    expect(nextStageOf('WELDING')).toBe('PAINTING');
    expect(nextStageOf('PAINTING')).toBe('READY');
  });
});
