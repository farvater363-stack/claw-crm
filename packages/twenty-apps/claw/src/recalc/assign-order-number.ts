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

const lastNumberAmong = async (
  client: CoreApiClient,
  deleted: boolean,
): Promise<number | null> => {
  const { orders } = await client.query({
    orders: {
      __args: {
        filter: {
          number: { is: 'NOT_NULL' },
          ...(deleted && { deletedAt: { is: 'NOT_NULL' } }),
        },
        orderBy: [{ number: 'DescNullsLast' }],
        first: 1,
      },
      edges: { node: { number: true } },
    },
  });
  const lastNumber = orders?.edges[0]?.node?.number;

  return lastNumber === null || lastNumber === undefined
    ? null
    : Number(lastNumber);
};

// Two orders saved in the same instant can read the same last number: the one
// created first keeps it and the other takes the next free one.
export const hasEarlierOrderWithNumber = async (
  client: CoreApiClient,
  orderId: string,
  number: number,
): Promise<boolean> => {
  const { orders } = await client.query({
    orders: {
      __args: {
        filter: { number: { eq: number } },
        orderBy: [{ createdAt: 'AscNullsLast' }],
        first: 1,
      },
      edges: { node: { id: true } },
    },
  });
  const firstId = orders?.edges[0]?.node?.id;

  return firstId !== undefined && firstId !== orderId;
};

// A deleted order keeps its number: it can be restored, so the number is not
// given out again.
// ponytail: max+1 can duplicate a number when two orders are created in the same instant; switch to a Postgres sequence if volume grows.
export const assignOrderNumber = async (
  client: CoreApiClient,
): Promise<{ number: number; name: string }> => {
  const [lastLive, lastDeleted] = await Promise.all([
    lastNumberAmong(client, false),
    lastNumberAmong(client, true),
  ]);
  const numbers = [lastLive, lastDeleted].filter(
    (value): value is number => value !== null,
  );
  const number = nextOrderNumber(
    numbers.length > 0 ? Math.max(...numbers) : null,
  );

  return { number, name: formatOrderName(number) };
};
