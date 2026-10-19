import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { kv, Response } from 'twenty-sdk/logic-function';

import { createRecalcClient } from 'src/recalc/create-recalc-client';
import {
  computeWebsiteEstimate,
  countInWindow,
  DEFAULT_METAL_SIZE,
  type EstimateRequest,
  parseEstimateRequest,
  parseOfferPercent,
  type RequestWindow,
} from 'src/website/website-estimate';
import { WEBSITE_IDS } from 'src/website/website-identifiers';
import { loadWebsitePriceList } from 'src/website/load-website-price-list';

const HOUR_IN_MILLISECONDS = 60 * 60 * 1000;
const MAX_ORDERS_PER_PHONE_PER_HOUR = 3;
const MAX_REQUESTS_PER_IP_PER_HOUR = 5;
// ponytail: a flat site-wide cap stops a bot rotating IPs and phones from flooding the CRM; raise it if real traffic ever gets near.
const MAX_WEBSITE_ORDERS_PER_HOUR = 30;

const LANGUAGE_LABEL: Record<EstimateRequest['language'], string> = {
  ru: 'русский',
  uz: 'узбекский',
};

const formatSum = (amount: number) =>
  `${amount.toLocaleString('ru-RU').replace(/\s/g, ' ')} сум`;

const tooManyRequests = () =>
  new Response(
    { error: 'TOO_MANY_REQUESTS' },
    { status: 429, headers: { 'retry-after': '3600' } },
  );

// Caddy appends the visitor's address to X-Forwarded-For; the first entry is the client.
const clientIpOf = (payload: RoutePayload) =>
  payload.headers['x-forwarded-for']?.split(',')[0]?.trim() || null;

// ponytail: read-then-write, so a burst of parallel requests can slip a few past the limit; fine against a single bot.
const isIpOverLimit = async (ip: string | null) => {
  if (ip === null) return false;

  const key = `website-ip:${ip}`;
  const window = countInWindow(
    await kv.get<RequestWindow>(key),
    Date.now(),
    HOUR_IN_MILLISECONDS,
  );

  await kv.set(key, window);

  return window.count > MAX_REQUESTS_PER_IP_PER_HOUR;
};

const handler = async (payload: RoutePayload) => {
  const parsed = parseEstimateRequest(payload.body);

  if (!parsed.isValid) {
    return new Response({ error: parsed.error }, { status: 400 });
  }

  const { request, isBot } = parsed;
  const client = createRecalcClient();
  const offerPercent = parseOfferPercent(process.env.WEBSITE_OFFER_PERCENT);

  if (await isIpOverLimit(clientIpOf(payload))) {
    return tooManyRequests();
  }

  const [priceList, designs, recentOrders] = await Promise.all([
    loadWebsitePriceList(client),
    request.designId === null
      ? null
      : client.query({
          designs: {
            __args: { filter: { id: { eq: request.designId } }, first: 1 },
            edges: { node: { id: true } },
          },
        }),
    client.query({
      orders: {
        __args: {
          filter: {
            source: { in: ['WEBSITE'] },
            createdAt: {
              gte: new Date(Date.now() - HOUR_IN_MILLISECONDS).toISOString(),
            },
          },
          first: MAX_WEBSITE_ORDERS_PER_HOUR,
        },
        edges: { node: { clientPhone: true } },
      },
    }),
  ]);

  if (designs !== null && (designs.designs?.edges.length ?? 0) === 0) {
    return new Response({ error: 'INVALID_CHOICE' }, { status: 400 });
  }

  const result = computeWebsiteEstimate(priceList, request, offerPercent);

  // Bots get a normal-looking answer so they don't retry with tweaks.
  if (isBot) {
    return result;
  }

  const recentPhones = (recentOrders.orders?.edges ?? []).map(
    ({ node }) => node.clientPhone,
  );

  if (
    recentPhones.length >= MAX_WEBSITE_ORDERS_PER_HOUR ||
    recentPhones.filter((phone) => phone === request.clientPhone).length >=
      MAX_ORDERS_PER_PHONE_PER_HOUR
  ) {
    return tooManyRequests();
  }

  const { createOrder } = await client.mutation({
    createOrder: {
      __args: {
        data: {
          status: 'NEW',
          source: 'WEBSITE',
          clientName: request.clientName,
          clientPhone: request.clientPhone,
          comment: [
            'Заявка с сайта',
            `язык: ${LANGUAGE_LABEL[request.language]}`,
            result.estimate === null
              ? 'цены нет в прайсе'
              : `оценка ${formatSum(result.estimate)}`,
            ...(offerPercent > 0 && result.discountedEstimate !== null
              ? [
                  `на сайте показана со скидкой месяца ${offerPercent}%: ${formatSum(result.discountedEstimate)}`,
                ]
              : []),
          ].join(' · '),
        },
      },
      id: true,
    },
  });

  if (!createOrder?.id) {
    throw new Error('Website order was not created');
  }

  try {
    await client.mutation({
      createOrderItem: {
        __args: {
          data: {
            orderId: createOrder.id,
            designId: request.designId,
            metal: request.metal,
            metalSize: DEFAULT_METAL_SIZE[request.metal],
            widthCm: request.widthCm,
            heightCm: request.heightCm,
            projectionCm: request.projectionCm,
            quantity: request.quantity,
          },
        },
        id: true,
      },
    });
  } catch (error) {
    // An order without its item has no size or price; drop it so a retry doesn't leave a duplicate.
    await client
      .mutation({ destroyOrder: { __args: { id: createOrder.id }, id: true } })
      .catch(() => undefined);
    throw error;
  }

  return result;
};

export default defineLogicFunction({
  universalIdentifier: WEBSITE_IDS.estimateLogicFunction,
  name: 'website-estimate',
  description:
    'Public: creates a website order with one item and returns its estimate',
  timeoutSeconds: 30,
  httpRouteTriggerSettings: {
    path: '/website/estimate',
    httpMethod: 'POST',
    isAuthRequired: false,
    forwardedRequestHeaders: ['x-forwarded-for'],
  },
  handler,
});
