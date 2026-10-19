import { defineLogicFunction } from 'twenty-sdk/define';
import { kv, Response } from 'twenty-sdk/logic-function';

import { createRecalcClient } from 'src/recalc/create-recalc-client';
import {
  buildWebsiteCatalog,
  parseOfferPercent,
} from 'src/website/website-estimate';
import { WEBSITE_IDS } from 'src/website/website-identifiers';
import { loadWebsitePriceList } from 'src/website/load-website-price-list';

const PAGE_SIZE = 100;
const CACHE_KEY = 'website-catalog';
const CACHE_TTL_MS = 5 * 60 * 1000;

type Catalog = ReturnType<typeof buildWebsiteCatalog>;

const loadCatalog = async (): Promise<Catalog> => {
  const client = createRecalcClient();
  const [{ designs }, priceList] = await Promise.all([
    client.query({
      designs: {
        __args: { first: PAGE_SIZE, orderBy: [{ position: 'AscNullsLast' }] },
        edges: { node: { id: true, name: true } },
      },
    }),
    loadWebsitePriceList(client),
  ]);

  return buildWebsiteCatalog(
    (designs?.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name ?? null,
    })),
    priceList,
  );
};

// Every page view asks for this, and the app shares one API rate limit with order recalcs.
const handler = async () => {
  const cached = await kv.get<{ storedAt: number; catalog: Catalog }>(
    CACHE_KEY,
  );
  const isFresh =
    cached !== null && Date.now() - cached.storedAt < CACHE_TTL_MS;
  const catalog = isFresh ? cached.catalog : await loadCatalog();

  if (!isFresh) {
    await kv.set(CACHE_KEY, { storedAt: Date.now(), catalog });
  }

  return new Response(
    {
      ...catalog,
      offerPercent: parseOfferPercent(process.env.WEBSITE_OFFER_PERCENT),
    },
    { headers: { 'cache-control': 'public, max-age=300' } },
  );
};

export default defineLogicFunction({
  universalIdentifier: WEBSITE_IDS.catalogLogicFunction,
  name: 'website-catalog',
  description:
    'Public: designs, selling prices per m² and the monthly offer for the website',
  timeoutSeconds: 15,
  httpRouteTriggerSettings: {
    path: '/website/catalog',
    httpMethod: 'GET',
    isAuthRequired: false,
  },
  handler,
});
