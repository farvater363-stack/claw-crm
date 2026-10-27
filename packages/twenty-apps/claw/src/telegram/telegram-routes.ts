import {
  callTelegram,
  findLinkedChat,
  type OrderPost,
  sendOrderPost,
  TelegramError,
  type TelegramFetch,
} from 'src/telegram/telegram-api';

export type TelegramGroupRow = {
  id: string;
  linkCode: string | null;
  chatId: string | null;
  chatTitle: string | null;
};

export type TelegramGroupStore = {
  read: () => Promise<TelegramGroupRow | null>;
  create: (linkCode: string) => Promise<TelegramGroupRow>;
  saveChat: (id: string, chatId: string, chatTitle: string) => Promise<void>;
};

export type TelegramRouteDependencies = {
  token: string | undefined;
  store: TelegramGroupStore;
  fetchImpl: TelegramFetch;
  newLinkCode: () => string;
  loadPost: (orderId: string) => Promise<Omit<OrderPost, 'chatId'>>;
};

export type TelegramLinkAnswer = {
  linked: boolean;
  chatTitle: string | null;
  code: string;
  isBotConfigured: boolean;
};

export type TelegramLinkCheckAnswer = {
  linked: boolean;
  chatTitle: string | null;
  problem: 'webhook' | 'not-found' | 'no-token' | null;
};

export type TelegramSendAnswer =
  | { sent: true }
  | {
      sent: false;
      problem: 'not-linked' | 'no-token' | 'telegram';
      detail: string | null;
    };

const hasToken = (token: string | undefined): token is string =>
  token !== undefined && token.trim() !== '';

export const newFourDigitCode = (): string =>
  String(Math.floor(1000 + Math.random() * 9000));

const readOrCreate = async (
  store: TelegramGroupStore,
  newLinkCode: () => string,
): Promise<TelegramGroupRow> => {
  const row = await store.read();

  return row ?? store.create(newLinkCode());
};

export const getTelegramLink = async ({
  token,
  store,
  newLinkCode,
}: TelegramRouteDependencies): Promise<TelegramLinkAnswer> => {
  const row = await readOrCreate(store, newLinkCode);

  return {
    linked: row.chatId !== null && row.chatId !== '',
    chatTitle: row.chatTitle,
    code: row.linkCode ?? '',
    isBotConfigured: hasToken(token),
  };
};

// The bot only sends, so it has no webhook and reads its updates on demand.
// getUpdates fails while a webhook is set: the token is then in use elsewhere.
export const checkTelegramLink = async ({
  token,
  store,
  fetchImpl,
  newLinkCode,
}: TelegramRouteDependencies): Promise<TelegramLinkCheckAnswer> => {
  const row = await readOrCreate(store, newLinkCode);

  if (!hasToken(token)) {
    return { linked: false, chatTitle: row.chatTitle, problem: 'no-token' };
  }

  const webhook = (await callTelegram(
    token,
    'getWebhookInfo',
    {},
    fetchImpl,
  )) as {
    url?: string;
  };

  if (webhook.url) {
    return { linked: false, chatTitle: row.chatTitle, problem: 'webhook' };
  }

  const updates = (await callTelegram(
    token,
    'getUpdates',
    { allowed_updates: ['message'] },
    fetchImpl,
  )) as unknown[];
  const chat = findLinkedChat(updates, row.linkCode ?? '');

  if (chat === null) {
    return {
      linked: row.chatId !== null && row.chatId !== '',
      chatTitle: row.chatTitle,
      problem: 'not-found',
    };
  }

  await store.saveChat(row.id, chat.chatId, chat.title);

  return { linked: true, chatTitle: chat.title, problem: null };
};

export const sendOrderToTelegram = async (
  { token, store, fetchImpl, loadPost }: TelegramRouteDependencies,
  orderId: string,
): Promise<TelegramSendAnswer> => {
  if (!hasToken(token)) {
    return { sent: false, problem: 'no-token', detail: null };
  }

  const row = await store.read();

  if (row?.chatId === null || row?.chatId === undefined || row.chatId === '') {
    return { sent: false, problem: 'not-linked', detail: null };
  }

  try {
    await sendOrderPost(
      token,
      { chatId: row.chatId, ...(await loadPost(orderId)) },
      fetchImpl,
    );
  } catch (error) {
    if (error instanceof TelegramError) {
      return { sent: false, problem: 'telegram', detail: error.description };
    }

    throw error;
  }

  return { sent: true };
};
