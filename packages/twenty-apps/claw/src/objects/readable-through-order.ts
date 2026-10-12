import { MetadataReadability } from 'twenty-sdk/define';

// A record is readable, and writable, only by someone who may read and write
// its order, so the order's row rules (the measurer sees only his own orders
// while they are being measured) reach its lines, services, payments and
// contracts. Records without an order are readable only by the app itself.
export const readableThroughOrder = (
  orderFieldUniversalIdentifier: string,
) => ({
  readability: MetadataReadability.INHERITED,
  readabilityParentFieldUniversalIdentifiers: [orderFieldUniversalIdentifier],
});
