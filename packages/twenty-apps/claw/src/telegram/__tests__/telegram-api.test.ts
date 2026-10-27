import { describe, expect, it } from 'vitest';

import {
  findLinkedChat,
  sendOrderPost,
  TelegramError,
} from 'src/telegram/telegram-api';

const recordingFetch = (response: unknown = { ok: true, result: {} }) => {
  const calls: { method: string; body: unknown }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({
      method: String(url).split('/').pop() ?? '',
      body: init?.body,
    });

    return new Response(JSON.stringify(response));
  }) as typeof fetch;

  return { calls, fetchImpl };
};

const photo = (index: number) => ({
  fileName: `entrance-${index}.jpg`,
  bytes: new Blob(['x'], { type: 'image/jpeg' }),
});

const POST = {
  chatId: '-1001',
  cardHtml: '<b>Заказ №1</b>',
  photos: [],
  point: { lat: 41.3111, lng: 69.2797 },
};

describe('sending an order to Telegram', () => {
  it('sends the card and then the location', async () => {
    const { calls, fetchImpl } = recordingFetch();

    await sendOrderPost('token', POST, fetchImpl);

    expect(calls.map((call) => call.method)).toEqual([
      'sendMessage',
      'sendLocation',
    ]);
  });

  it('sends one photo as a photo and no location without a point', async () => {
    const { calls, fetchImpl } = recordingFetch();

    await sendOrderPost(
      'token',
      { ...POST, photos: [photo(1)], point: null },
      fetchImpl,
    );

    expect(calls.map((call) => call.method)).toEqual([
      'sendMessage',
      'sendPhoto',
    ]);
  });

  it('sends several photos as one album', async () => {
    const { calls, fetchImpl } = recordingFetch();

    await sendOrderPost(
      'token',
      { ...POST, photos: [photo(1), photo(2), photo(3)] },
      fetchImpl,
    );

    const album = calls.find((call) => call.method === 'sendMediaGroup');

    expect(album?.body).toBeInstanceOf(FormData);
    expect(
      JSON.parse(String((album?.body as FormData).get('media'))),
    ).toHaveLength(3);
  });

  it('stops with the reason Telegram gives', async () => {
    const { fetchImpl } = recordingFetch({
      ok: false,
      description: 'Bad Request',
    });

    await expect(sendOrderPost('token', POST, fetchImpl)).rejects.toThrow(
      TelegramError,
    );
  });
});

const message = (chatType: string, text: string, chatId = -1001) => ({
  update_id: 1,
  message: { chat: { id: chatId, type: chatType, title: 'Монтаж' }, text },
});

describe('linking a group', () => {
  it('finds the group where the code was sent', () => {
    expect(
      findLinkedChat([message('supergroup', '/link 4821')], '4821'),
    ).toEqual({ chatId: '-1001', title: 'Монтаж' });
    expect(
      findLinkedChat([message('group', '/link@claw_bot 4821')], '4821'),
    ).toEqual({ chatId: '-1001', title: 'Монтаж' });
  });

  it('ignores the code in a private chat and another code', () => {
    expect(findLinkedChat([message('private', '/link 4821')], '4821')).toBe(
      null,
    );
    expect(findLinkedChat([message('group', '/link 1111')], '4821')).toBe(null);
  });

  it('takes the newest group when the code was sent twice', () => {
    expect(
      findLinkedChat(
        [
          message('group', '/link 4821', -1),
          message('group', '/link 4821', -2),
        ],
        '4821',
      )?.chatId,
    ).toBe('-2');
  });
});
