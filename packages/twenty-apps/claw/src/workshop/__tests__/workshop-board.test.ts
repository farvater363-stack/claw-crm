import { describe, expect, it } from 'vitest';

import {
  buildWorkshopBoard,
  type WorkshopOrder,
} from 'src/workshop/workshop-board';

const TODAY = '2026-10-04';

const order = (overrides: Partial<WorkshopOrder>): WorkshopOrder => ({
  id: 'order',
  name: '№1001',
  status: 'PRODUCTION',
  masterId: 'worker-a',
  masterName: 'Мастер 2',
  installerName: null,
  deadline: '2026-10-07',
  lines: [],
  ...overrides,
});

describe('buildWorkshopBoard', () => {
  it('gives each master with an order in production a column, «Без мастера» first', () => {
    const { columns } = buildWorkshopBoard(
      [
        order({ id: 'a', masterId: 'worker-b', masterName: 'Мастер 1' }),
        order({ id: 'b' }),
        order({ id: 'c', masterId: null, masterName: null }),
        order({ id: 'd' }),
      ],
      TODAY,
    );

    expect(columns.map((column) => [column.key, column.title])).toEqual([
      ['none', 'Без мастера'],
      ['worker-b', 'Мастер 1'],
      ['worker-a', 'Мастер 2'],
    ]);
    expect(columns[2]?.cards.map((card) => card.id)).toEqual(['b', 'd']);
  });

  it('names a master without a name', () => {
    const { columns } = buildWorkshopBoard(
      [order({ masterName: null })],
      TODAY,
    );

    expect(columns.map((column) => column.title)).toEqual(['Без имени']);
  });

  it('sorts the cards of a column by deadline, an order without one last', () => {
    const { columns } = buildWorkshopBoard(
      [
        order({ id: 'none', deadline: null }),
        order({ id: 'late', deadline: '2026-10-01' }),
        order({ id: 'soon', deadline: '2026-10-05' }),
      ],
      TODAY,
    );

    expect(columns[0]?.cards.map((card) => card.id)).toEqual([
      'late',
      'soon',
      'none',
    ]);
  });

  it.each([
    ['2026-10-07', 'осталось 3 дня', null],
    ['2026-10-09', 'осталось 5 дней', null],
    ['2026-10-25', 'остался 21 день', null],
    ['2026-10-05', 'завтра', null],
    ['2026-10-04', 'сегодня', 'warning'],
    ['2026-10-03', 'просрочен на 1 день', 'danger'],
    ['2026-10-02', 'просрочен на 2 дня', 'danger'],
    ['2026-09-23', 'просрочен на 11 дней', 'danger'],
    [null, 'срок не указан', null],
  ])('reads the deadline %s as «%s»', (deadline, daysLeftText, tone) => {
    const { columns } = buildWorkshopBoard([order({ deadline })], TODAY);

    expect(columns[0]?.cards[0]).toMatchObject({ daysLeftText, tone });
  });

  it('lists the orders sent to installation apart, by deadline', () => {
    const { columns, sent } = buildWorkshopBoard(
      [
        order({ id: 'x', status: 'QUALITY_CHECK', deadline: '2026-10-06' }),
        order({ id: 'y', status: 'QUALITY_CHECK', deadline: '2026-10-02' }),
      ],
      TODAY,
    );

    expect(columns).toEqual([]);
    expect(sent.map((sentOrder) => sentOrder.id)).toEqual(['y', 'x']);
  });

  it('leaves out every other status', () => {
    expect(
      buildWorkshopBoard(
        [
          order({ status: 'MEASURED' }),
          order({ status: 'INSTALLED' }),
          order({ status: null }),
        ],
        TODAY,
      ),
    ).toEqual({ columns: [], sent: [] });
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
