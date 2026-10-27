export type TelegramFetch = typeof fetch;

export class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly description: string,
  ) {
    super(`${method}: ${description}`);
  }
}

export const callTelegram = async (
  token: string,
  method: string,
  body: Record<string, unknown> | FormData,
  fetchImpl: TelegramFetch = fetch,
): Promise<unknown> => {
  const response = await fetchImpl(
    `https://api.telegram.org/bot${token}/${method}`,
    body instanceof FormData
      ? { method: 'POST', body }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const answer = (await response.json()) as {
    ok?: boolean;
    result?: unknown;
    description?: string;
  };

  if (answer.ok !== true) {
    throw new TelegramError(
      method,
      answer.description ?? `HTTP ${response.status}`,
    );
  }

  return answer.result;
};

export type OrderPost = {
  chatId: string;
  cardHtml: string;
  photos: { fileName: string; bytes: Blob }[];
  point: { lat: number; lng: number } | null;
};

const sendPhotos = async (
  token: string,
  chatId: string,
  photos: OrderPost['photos'],
  fetchImpl: TelegramFetch,
) => {
  const form = new FormData();

  form.append('chat_id', chatId);

  if (photos.length === 1) {
    form.append('photo', photos[0].bytes, photos[0].fileName);
    await callTelegram(token, 'sendPhoto', form, fetchImpl);

    return;
  }

  // Signed file URLs are not reachable for Telegram, so the bytes go along.
  photos.forEach((photo, index) =>
    form.append(`photo${index}`, photo.bytes, photo.fileName),
  );
  form.append(
    'media',
    JSON.stringify(
      photos.map((_, index) => ({
        type: 'photo',
        media: `attach://photo${index}`,
      })),
    ),
  );
  await callTelegram(token, 'sendMediaGroup', form, fetchImpl);
};

export const sendOrderPost = async (
  token: string,
  post: OrderPost,
  fetchImpl: TelegramFetch = fetch,
): Promise<void> => {
  await callTelegram(
    token,
    'sendMessage',
    {
      chat_id: post.chatId,
      text: post.cardHtml,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    },
    fetchImpl,
  );

  if (post.photos.length > 0) {
    await sendPhotos(token, post.chatId, post.photos, fetchImpl);
  }

  if (post.point !== null) {
    await callTelegram(
      token,
      'sendLocation',
      {
        chat_id: post.chatId,
        latitude: post.point.lat,
        longitude: post.point.lng,
      },
      fetchImpl,
    );
  }
};

type TelegramUpdate = {
  message?: {
    chat?: { id?: number; type?: string; title?: string };
    text?: string;
  };
};

const LINK_COMMAND = /^\/link(@\w+)?\s+(\S+)\s*$/;

export const findLinkedChat = (
  updates: unknown[],
  code: string,
): { chatId: string; title: string } | null => {
  for (const update of [...updates].reverse() as TelegramUpdate[]) {
    const chat = update.message?.chat;
    const match = update.message?.text?.trim().match(LINK_COMMAND);

    if (
      chat?.id !== undefined &&
      (chat.type === 'group' || chat.type === 'supergroup') &&
      match?.[2] === code
    ) {
      return { chatId: String(chat.id), title: chat.title ?? '' };
    }
  }

  return null;
};
