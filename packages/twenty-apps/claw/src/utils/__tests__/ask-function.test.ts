import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { askFunction } from 'src/utils/ask-function';

const respond = (statuses: number[]) => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    requests.push({ url: String(url), init });

    const status = statuses[requests.length - 1] ?? 200;

    return new Response(JSON.stringify({ sent: true }), { status });
  }) as typeof fetch;

  return { requests, fetchImpl };
};

describe('askFunction', () => {
  beforeEach(() => {
    process.env.TWENTY_FUNCTIONS_URL = 'https://crm.example.test/s';
    process.env.TWENTY_APP_ACCESS_TOKEN = 'app-token';
  });

  afterEach(() => {
    delete process.env.TWENTY_FUNCTIONS_URL;
    delete process.env.TWENTY_APP_ACCESS_TOKEN;
  });

  it('renews the token once when the first answer fails', async () => {
    const { fetchImpl } = respond([500, 200]);
    let renewals = 0;

    await expect(
      askFunction('telegram-send', undefined, {
        fetchImpl,
        renewToken: async () => {
          renewals++;
        },
      }),
    ).resolves.toEqual({ sent: true });
    expect(renewals).toBe(1);
  });

  it('gives up after the second failure', async () => {
    const { fetchImpl } = respond([500, 500]);

    await expect(
      askFunction('telegram-send', undefined, {
        fetchImpl,
        renewToken: async () => {},
      }),
    ).rejects.toThrow('telegram-send: 500');
  });

  it('posts the body as JSON with the app token', async () => {
    const { requests, fetchImpl } = respond([200]);

    await askFunction(
      'telegram-send',
      { method: 'POST', body: { orderId: 'order-1' } },
      { fetchImpl, renewToken: async () => {} },
    );

    expect(requests[0].url).toBe('https://crm.example.test/s/telegram-send');
    expect(requests[0].init?.method).toBe('POST');
    expect(requests[0].init?.body).toBe(JSON.stringify({ orderId: 'order-1' }));
    expect(requests[0].init?.headers).toMatchObject({
      Authorization: 'Bearer app-token',
      'Content-Type': 'application/json',
    });
  });
});
