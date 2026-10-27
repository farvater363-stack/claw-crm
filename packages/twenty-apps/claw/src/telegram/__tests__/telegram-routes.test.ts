import { describe, expect, it } from 'vitest';

import {
  checkTelegramLink,
  getTelegramLink,
  newLinkCode,
  sendOrderToTelegram,
  type TelegramGroupRow,
  type TelegramRouteDependencies,
} from 'src/telegram/telegram-routes';

const dependencies = (
  overrides: Partial<TelegramRouteDependencies> & {
    row?: TelegramGroupRow | null;
    telegram?: Record<string, unknown>;
    failOn?: string;
  } = {},
) => {
  let row = overrides.row === undefined ? null : overrides.row;
  const telegramCalls: string[] = [];
  const telegramBodies: Record<string, unknown> = {};
  const telegram = overrides.telegram ?? {};

  const result: TelegramRouteDependencies = {
    token: 'token',
    store: {
      read: async () => row,
      create: async (linkCode) => {
        row = { id: 'group-1', linkCode, chatId: null, chatTitle: null };

        return row;
      },
      saveChat: async (_id, chatId, chatTitle, linkCode) => {
        row = { ...(row as TelegramGroupRow), chatId, chatTitle, linkCode };
      },
    },
    fetchImpl: (async (url: string, init?: RequestInit) => {
      const method = String(url).split('/').pop() ?? '';

      telegramCalls.push(method);
      telegramBodies[method] =
        typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;

      if (overrides.failOn === method) throw new TypeError('network down');

      return new Response(
        JSON.stringify({ ok: true, result: telegram[method] ?? {} }),
      );
    }) as typeof fetch,
    newLinkCode: () => 'NEXTCODE',
    loadPost: async () => ({
      cardHtml: '<b>Заказ №1</b>',
      photos: [],
      point: null,
    }),
    ...overrides,
  };

  return { result, telegramCalls, telegramBodies, currentRow: () => row };
};

const LINKED: TelegramGroupRow = {
  id: 'group-1',
  linkCode: '4821',
  chatId: '-1001',
  chatTitle: 'Монтаж',
};

describe('telegram routes', () => {
  it('makes a code the first time the link is asked for', async () => {
    const { result, currentRow } = dependencies();

    expect(await getTelegramLink(result)).toEqual({
      linked: false,
      chatTitle: null,
      code: 'NEXTCODE',
      isBotConfigured: true,
    });
    expect(currentRow()?.linkCode).toBe('NEXTCODE');
  });

  it('sends nothing while no group is linked', async () => {
    const { result, telegramCalls } = dependencies();

    expect(await sendOrderToTelegram(result, 'order-1')).toEqual({
      sent: false,
      problem: 'not-linked',
      detail: null,
    });
    expect(telegramCalls).toEqual([]);
  });

  it('says the bot is not set up when the server has no token', async () => {
    const { result } = dependencies({ token: undefined, row: LINKED });

    expect(await sendOrderToTelegram(result, 'order-1')).toMatchObject({
      sent: false,
      problem: 'no-token',
    });
    expect(await checkTelegramLink(result)).toMatchObject({
      problem: 'no-token',
    });
  });

  it('does not read updates of a bot that has a webhook elsewhere', async () => {
    const { result, telegramCalls } = dependencies({
      row: { ...LINKED, chatId: null, chatTitle: null },
      telegram: { getWebhookInfo: { url: 'https://other.example.test/hook' } },
    });

    expect(await checkTelegramLink(result)).toMatchObject({
      linked: false,
      problem: 'webhook',
    });
    expect(telegramCalls).not.toContain('getUpdates');
  });

  it('links the group where the code was sent', async () => {
    const { result, currentRow } = dependencies({
      row: { ...LINKED, chatId: null, chatTitle: null },
      telegram: {
        getWebhookInfo: { url: '' },
        getUpdates: [
          {
            update_id: 1,
            message: {
              chat: { id: -1002, type: 'supergroup', title: 'Монтаж Тест' },
              text: '/link 4821',
            },
          },
        ],
      },
    });

    expect(await checkTelegramLink(result)).toEqual({
      linked: true,
      chatTitle: 'Монтаж Тест',
      problem: null,
    });
    expect(currentRow()?.chatId).toBe('-1002');
  });

  it('sends a linked order', async () => {
    const { result, telegramCalls } = dependencies({ row: LINKED });

    expect(await sendOrderToTelegram(result, 'order-1')).toEqual({
      sent: true,
    });
    expect(telegramCalls).toEqual(['sendMessage']);
  });
});

describe('telegram routes, after review', () => {
  it('reads the newest updates, not the oldest hundred', async () => {
    const { result, telegramBodies } = dependencies({
      row: { ...LINKED, chatId: null, chatTitle: null },
      telegram: { getWebhookInfo: { url: '' }, getUpdates: [] },
    });

    await checkTelegramLink(result);

    expect(telegramBodies.getUpdates).toMatchObject({ offset: -100 });
  });

  it('gives the workspace a new code once a group is linked', async () => {
    const { result, currentRow } = dependencies({
      row: { ...LINKED, chatId: null, chatTitle: null },
      telegram: {
        getWebhookInfo: { url: '' },
        getUpdates: [
          {
            update_id: 1,
            message: {
              chat: { id: -1002, type: 'supergroup', title: 'Монтаж' },
              text: '/link 4821',
            },
          },
        ],
      },
    });

    await checkTelegramLink(result);

    expect(currentRow()?.linkCode).toBe('NEXTCODE');
  });

  // A route that fails after the card went out would be asked again and
  // post the card a second time.
  it('answers instead of failing when the album breaks after the card', async () => {
    const { result } = dependencies({
      row: LINKED,
      failOn: 'sendPhoto',
      loadPost: async () => ({
        cardHtml: '<b>Заказ №1</b>',
        photos: [{ fileName: 'a.jpg', bytes: new Blob(['x']) }],
        point: null,
      }),
    });

    expect(await sendOrderToTelegram(result, 'order-1')).toEqual({
      sent: false,
      problem: 'telegram',
      detail: 'network down',
    });
  });
});

describe('link codes', () => {
  it("are long enough that nobody guesses another workspace's", () => {
    const codes = new Set(Array.from({ length: 50 }, () => newLinkCode()));

    expect(codes.size).toBe(50);

    for (const code of codes) expect(code).toMatch(/^[A-Z2-7]{10}$/);
  });
});
