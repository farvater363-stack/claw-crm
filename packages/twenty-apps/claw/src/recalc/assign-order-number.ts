import { type CoreApiClient } from 'twenty-client-sdk/core';

const ORDER_NUMBER_DIGITS = 4;

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

  const number = Number(orders?.edges[0]?.node?.number ?? 0) + 1;

  return {
    number,
    name: `№${String(number).padStart(ORDER_NUMBER_DIGITS, '0')}`,
  };
};
