import { type CoreApiClient } from 'twenty-client-sdk/core';

const ORDER_NUMBER_DIGITS = 4;
// Imported Excel orders keep their own numbers (1-28); new orders start here.
const FIRST_ORDER_NUMBER = 1001;

export const nextOrderNumber = (lastNumber: number | null): number =>
  Math.max((lastNumber ?? 0) + 1, FIRST_ORDER_NUMBER);

export const formatOrderName = (number: number): string =>
  `№${String(number).padStart(ORDER_NUMBER_DIGITS, '0')}`;

// Twenty's create flow saves the empty label field after the created trigger
// has named the order, so an empty name on a numbered order is restored.
export const orderNameToRestore = ({
  name,
  number,
}: {
  name: string | null;
  number: number | null;
}): string | null =>
  number !== null && (name ?? '').trim() === ''
    ? formatOrderName(number)
    : null;

// ponytail: max+1 can duplicate a number when two orders are created in the same instant; switch to a Postgres sequence if volume grows.
export const assignOrderNumber = async (
  client: CoreApiClient,
): Promise<{ number: number; name: string }> => {
  const { orders } = await client.query({
    orders: {
      __args: {
        filter: { number: { is: 'NOT_NULL' } },
        orderBy: [{ number: 'DescNullsLast' }],
        first: 1,
      },
      edges: { node: { number: true } },
    },
  });

  const lastNumber = orders?.edges[0]?.node?.number;
  const number = nextOrderNumber(
    lastNumber === null || lastNumber === undefined ? null : Number(lastNumber),
  );

  return { number, name: formatOrderName(number) };
};
