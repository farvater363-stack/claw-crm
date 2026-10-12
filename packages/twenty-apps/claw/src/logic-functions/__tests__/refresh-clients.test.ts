import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, mutation, linkClientByPhone } = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  linkClientByPhone: vi.fn(),
}));

vi.mock('src/recalc/create-recalc-client', () => ({
  createRecalcClient: () => ({ query, mutation }),
}));
vi.mock('src/recalc/link-client-by-phone', () => ({ linkClientByPhone }));
vi.mock('src/clients/recalc-client', () => ({ recalcClient: vi.fn() }));

import refreshClients from 'src/logic-functions/refresh-clients';

const order = (id: string, clientPhone: string) => ({
  node: { id, clientFullName: null, clientPhone },
});

describe('refresh-clients', () => {
  beforeEach(() => {
    query.mockReset();
    mutation.mockReset();
    linkClientByPhone.mockReset();
    linkClientByPhone.mockResolvedValue('person-1');
  });

  it('steps over phones no client can be found by and links the orders after them', async () => {
    const unparseable = Array.from({ length: 200 }, (_, index) =>
      order(`bad-${index}`, 'нет'),
    );

    query
      .mockResolvedValueOnce({
        orders: {
          edges: unparseable,
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
        },
      })
      .mockResolvedValueOnce({
        orders: {
          edges: [order('good', '+998 90 123 45 67')],
          pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
        },
      })
      .mockResolvedValue({ orders: { edges: [] }, people: { edges: [] } });

    await refreshClients.config.handler({} as never, {} as never);

    expect(query.mock.calls[1][0].orders.__args.after).toBe('cursor-1');
    expect(linkClientByPhone).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledWith({
      updateOrder: {
        __args: { id: 'good', data: { clientId: 'person-1' } },
        id: true,
      },
    });
  });
});
