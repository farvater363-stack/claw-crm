import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type PriceListEntry } from 'src/pricing/resolve-price-list-entry';
import { fromCurrency } from 'src/recalc/money';

const PAGE_SIZE = 200;

// Selling prices only: these routes are public, costs must never be selected.
export const loadWebsitePriceList = async (
  client: CoreApiClient,
): Promise<PriceListEntry[]> => {
  const { priceListItems } = await client.query({
    priceListItems: {
      __args: { first: PAGE_SIZE },
      edges: {
        node: {
          designId: true,
          metal: true,
          metalSize: true,
          pricePerSquareMeter: { amountMicros: true, currencyCode: true },
        },
      },
    },
  });

  return (priceListItems?.edges ?? []).map(({ node }) => ({
    designId: node.designId ?? null,
    metal: node.metal ?? null,
    metalSize: node.metalSize ?? null,
    pricePerSquareMeter: fromCurrency(node.pricePerSquareMeter),
    costPerSquareMeter: null,
  }));
};
