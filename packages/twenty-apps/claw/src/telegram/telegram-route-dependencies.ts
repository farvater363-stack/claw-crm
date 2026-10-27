import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { buildOrderCard } from 'src/telegram/order-card';
import { loadOrderPost } from 'src/telegram/load-order-post';
import {
  newFourDigitCode,
  type TelegramGroupRow,
  type TelegramRouteDependencies,
} from 'src/telegram/telegram-routes';

const GROUP_FIELDS = {
  id: true,
  linkCode: true,
  chatId: true,
  chatTitle: true,
} as const;

// TWENTY_FUNCTIONS_URL is built from the workspace's own address, so its
// origin is where the workspace's order pages live.
const workspaceUrl = (): string => {
  const functionsUrl = process.env.TWENTY_FUNCTIONS_URL;

  return functionsUrl
    ? new URL(functionsUrl).origin
    : (process.env.TWENTY_API_URL ?? '');
};

const toRow = (node: {
  id: string;
  linkCode?: string | null;
  chatId?: string | null;
  chatTitle?: string | null;
}): TelegramGroupRow => ({
  id: node.id,
  linkCode: node.linkCode ?? null,
  chatId: node.chatId ?? null,
  chatTitle: node.chatTitle ?? null,
});

export const createTelegramRouteDependencies =
  (): TelegramRouteDependencies => {
    const client = createRecalcClient();

    return {
      token: process.env.TELEGRAM_BOT_TOKEN,
      fetchImpl: fetch,
      newLinkCode: newFourDigitCode,
      store: {
        read: async () => {
          const { telegramGroups } = await client.query({
            telegramGroups: {
              __args: { first: 1, orderBy: [{ createdAt: 'AscNullsLast' }] },
              edges: { node: GROUP_FIELDS },
            },
          });
          const node = telegramGroups?.edges[0]?.node;

          return node === undefined ? null : toRow(node);
        },
        create: async (linkCode) => {
          const { createTelegramGroup } = await client.mutation({
            createTelegramGroup: {
              __args: { data: { linkCode } },
              ...GROUP_FIELDS,
            },
          });

          if (!createTelegramGroup?.id) throw new Error('empty response');

          return toRow(createTelegramGroup);
        },
        saveChat: async (id, chatId, chatTitle) => {
          await client.mutation({
            updateTelegramGroup: {
              __args: { id, data: { chatId, chatTitle } },
              id: true,
            },
          });
        },
      },
      loadPost: async (orderId) => {
        const { card, photoUrls, point } = await loadOrderPost(
          client,
          orderId,
          workspaceUrl(),
        );
        // Telegram cannot open the signed file links, so the bytes go along.
        const photos = await Promise.all(
          photoUrls.map(async ({ fileName, url }) => {
            const response = await fetch(url);

            if (!response.ok)
              throw new Error(`photo ${fileName}: ${response.status}`);

            return { fileName, bytes: await response.blob() };
          }),
        );

        return { cardHtml: buildOrderCard(card), photos, point };
      },
    };
  };
