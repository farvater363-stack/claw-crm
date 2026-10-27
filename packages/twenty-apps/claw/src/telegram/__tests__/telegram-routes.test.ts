import { describe, expect, it } from 'vitest';

import {
  checkTelegramLink,
  getTelegramLink,
  sendOrderToTelegram,
  type TelegramGroupRow,
  type TelegramRouteDependencies,
} from 'src/telegram/telegram-routes';

const dependencies = (
  overrides: Partial<TelegramRouteDependencies> & {
    row?: TelegramGroupRow | null;
    telegram?: Record<string, unknown>;
  } = {},
) => {
  let row = overrides.row === undefined ? null : overrides.row;
  const telegramCalls: string[] = [];
  const telegram = overrides.telegram ?? {};

  const result: TelegramRouteDependencies = {
    token: 'token',
    store: {
      read: async () => row,
      create: async (linkCode) => {
        row = { id: 'group-1', linkCode, chatId: null, chatTitle: null };

        return row;
      },
      saveChat: async (_id, chatId, chatTitle) => {
        row = { ...(row as TelegramGroupRow), chatId, chatTitle };
      },
    },
    fetchImpl: (async (url: string) => {
      const method = String(url).split('/').pop() ?? '';

      telegramCalls.push(method);

      return new Response(
        JSON.stringify({ ok: true, result: telegram[method] ?? {} }),
      );
    }) as typeof fetch,
    newLinkCode: () => '4821',
    loadPost: async () => ({
      cardHtml: '<b>Заказ №1</b>',
      photos: [],
      point: null,
    }),
    ...overrides,
  };

  return { result, telegramCalls, currentRow: () => row };
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
      code: '4821',
      isBotConfigured: true,
    });
    expect(currentRow()?.linkCode).toBe('4821');
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
