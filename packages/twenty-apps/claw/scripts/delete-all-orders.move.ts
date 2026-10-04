import { CoreApiClient } from 'twenty-client-sdk/core';
import { it } from 'vitest';

import {
  checkDeleteConfirmation,
  type DeleteObject,
  planDeleteAllOrders,
  READ_STEPS,
} from '../src/moves/plan-delete-all-orders';
import { fetchAllPages } from '../src/utils/fetch-all-pages';
import { recalcWarehouse } from '../src/warehouse/recalc-warehouse';

const API_URL = (process.env.TWENTY_API_URL ?? '').trim().replace(/\/+$/, '');
const API_KEY = (process.env.TWENTY_API_KEY ?? '').trim();
const MOVE = process.env.MOVE ?? '';
const MOVE_PAYOUTS = process.env.MOVE_PAYOUTS ?? '';
const GRAPHQL_URL = `${API_URL}/graphql`;

const PAGE_SIZE = 200;
// The API key allows 100 requests a minute, reads included.
const REQUEST_PAUSE_MILLISECONDS = 700;
// One batch of 20 every 6 seconds keeps the functions it starts under their
// shared 500 requests a minute.
const DELETE_PAUSE_MILLISECONDS = 6_000;
// The functions started by the last batch finish before the stock is recalculated.
const SETTLE_PAUSE_MILLISECONDS = 60_000;
const RUN_TIMEOUT_MILLISECONDS = 2 * 60 * 60_000;

type Connection = {
  totalCount?: number;
  edges?: { node: { id: string } }[];
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
};

const pause = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// One request at a time, each after the pause: the warehouse recalculation
// sends its reads together, and they count against the same key.
let lastRequest: Promise<unknown> = Promise.resolve();

const paced = <TResult>(send: () => Promise<TResult>): Promise<TResult> => {
  const result = lastRequest
    .then(() => pause(REQUEST_PAUSE_MILLISECONDS))
    .then(send);

  lastRequest = result.catch(() => undefined);

  return result;
};

const pacedFetch = (...request: Parameters<typeof fetch>) =>
  paced(() => fetch(...request));

const graphql = async <TData>(
  label: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<TData> => {
  let status = 0;
  let text = '';

  try {
    const response = await pacedFetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    status = response.status;
    text = await response.text();
  } catch (error) {
    throw new Error(`${label} failed: ${messageOf(error)}`);
  }

  let body: { data?: TData | null; errors?: unknown } = {};

  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${label} failed: HTTP ${status}`);
  }

  if (body.errors !== undefined || body.data === undefined || body.data === null) {
    throw new Error(
      `${label} failed: ${JSON.stringify(body.errors ?? `HTTP ${status}`)}`,
    );
  }

  return body.data;
};

const loadIds = async (
  plural: DeleteObject,
  label: string,
  onlyWithOrder: boolean,
): Promise<string[]> => {
  const filter = onlyWithOrder ? ', filter: { orderId: { is: NOT_NULL } }' : '';
  const nodes = await fetchAllPages(async (after) => {
    const data = await graphql<Record<string, Connection>>(
      `read ${label}`,
      `query($after: String) { ${plural}(first: ${PAGE_SIZE}, after: $after${filter}) { edges { node { id } } pageInfo { hasNextPage endCursor } } }`,
      { after },
    );

    return data[plural];
  });

  return nodes.map(({ id }) => id);
};

const loadAllIds = async (): Promise<Record<DeleteObject, string[]>> => {
  const idsByObject = {} as Record<DeleteObject, string[]>;

  for (const { plural, label, onlyWithOrder } of READ_STEPS) {
    idsByObject[plural] = await loadIds(plural, label, onlyWithOrder);
  }

  return idsByObject;
};

// A plain query hides the rows deleted earlier; naming deletedAt in the
// filter is what makes the server return them.
const countDeletedEarlier = async (): Promise<Record<DeleteObject, number>> => {
  const counts = {} as Record<DeleteObject, number>;

  for (const { plural, label, onlyWithOrder } of READ_STEPS) {
    const orderFilter = onlyWithOrder ? 'orderId: { is: NOT_NULL }, ' : '';
    const data = await graphql<Record<string, Connection>>(
      `count deleted ${label}`,
      `query { ${plural}(first: 1, filter: { ${orderFilter}deletedAt: { is: NOT_NULL } }) { totalCount } }`,
      {},
    );

    counts[plural] = data[plural]?.totalCount ?? 0;
  }

  return counts;
};

const totalOf = (counts: { count: number }[]) =>
  counts.reduce((sum, { count }) => sum + count, 0);

const run = async () => {
  if (API_URL === '' || API_KEY === '') {
    throw new Error('TWENTY_API_URL and TWENTY_API_KEY must be set');
  }

  if (MOVE !== '' && MOVE !== 'apply') {
    throw new Error(
      `MOVE is "${MOVE}": leave it unset for a dry run, or pass MOVE=apply to delete`,
    );
  }

  if (MOVE_PAYOUTS !== '' && MOVE_PAYOUTS !== 'delete') {
    throw new Error(
      `MOVE_PAYOUTS is "${MOVE_PAYOUTS}": leave it unset to keep the payouts to workers, or pass MOVE_PAYOUTS=delete`,
    );
  }

  const apply = MOVE === 'apply';
  const deletePayouts = MOVE_PAYOUTS === 'delete';
  const confirmationInput = {
    apiUrl: API_URL,
    confirmation: process.env.CONFIRM_DELETE_ALL_ORDERS,
    apply,
  };
  const { hostName, refusal } = checkDeleteConfirmation(confirmationInput);

  console.log(
    `delete-all-orders on ${hostName} (${GRAPHQL_URL}): ${apply ? 'APPLY, records will be deleted' : 'dry run, nothing will be deleted'}`,
  );

  if (refusal !== null) throw new Error(refusal);

  if (
    process.env.TWENTY_APP_ACCESS_TOKEN ||
    process.env.TWENTY_APP_APPLICATION_ACCESS_TOKEN
  ) {
    console.log(
      'an app access token is set in the environment and is ignored: every request uses TWENTY_API_KEY',
    );
  }

  const plan = planDeleteAllOrders({
    ...confirmationInput,
    deletePayouts,
    idsByObject: await loadAllIds(),
  });
  const deletedEarlier = await countDeletedEarlier();

  console.log('found:');

  for (const { plural, label } of READ_STEPS) {
    const live =
      plan.counts.find((count) => count.label === label)?.count ??
      plan.payoutsKept ??
      0;
    const fate =
      plural === 'masterPayments' && plan.payoutsKept !== null
        ? 'kept (pass MOVE_PAYOUTS=delete to remove them)'
        : 'to delete';

    console.log(
      `  ${label}: ${live} ${fate}; ${deletedEarlier[plural]} deleted earlier, left as they are`,
    );
  }

  console.log(
    `${apply ? 'deletes' : 'would delete'}, in this order: ${totalOf(plan.counts)} records in ${plan.batches.length} requests`,
  );

  plan.counts.forEach(({ label, count }, index) => {
    console.log(`  ${index + 1}. ${label}: ${count}`);
  });

  if (!apply) {
    console.log(
      `Dry run: nothing was deleted. To delete: MOVE=apply CONFIRM_DELETE_ALL_ORDERS=${hostName}`,
    );

    return;
  }

  const deletedByLabel = new Map<string, number>();

  for (const batch of plan.batches) {
    const done = deletedByLabel.get(batch.label) ?? 0;
    const wanted =
      plan.counts.find(({ label }) => label === batch.label)?.count ?? 0;

    await pause(DELETE_PAUSE_MILLISECONDS);

    try {
      await graphql(
        `delete ${batch.label}`,
        `mutation($ids: [UUID!]) { ${batch.mutation}(filter: { id: { in: $ids } }) { id } }`,
        { ids: batch.ids },
      );
    } catch (error) {
      throw new Error(
        `${messageOf(error)}. Stopped at ${batch.label}: ${done} of ${wanted} deleted; the objects listed after it were not touched. Run the same command again: it deletes what is left.`,
      );
    }

    deletedByLabel.set(batch.label, done + batch.ids.length);
    // The ids are the way back: restore<Objects>(filter: { id: { in: [...] } }).
    console.log(
      `deleted ${batch.ids.length} ${batch.label} (${done + batch.ids.length} of ${wanted}): ${batch.ids.join(' ')}`,
    );
  }

  if (plan.batches.length > 0) await pause(SETTLE_PAUSE_MILLISECONDS);

  try {
    // The explicit header wins over an app access token left in the environment.
    await recalcWarehouse(
      new CoreApiClient({
        url: GRAPHQL_URL,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        fetch: pacedFetch,
      }),
    );
  } catch (error) {
    throw new Error(
      `Everything was deleted, but the warehouse recalculation failed: ${messageOf(error)}. Run the same command again: nothing is left to delete, so only the recalculation runs.`,
    );
  }

  console.log('warehouse recalculated');

  const left = planDeleteAllOrders({
    ...confirmationInput,
    deletePayouts,
    idsByObject: await loadAllIds(),
  });
  const inTrash = await countDeletedEarlier();

  for (const { plural, label } of READ_STEPS) {
    const live =
      left.counts.find((count) => count.label === label)?.count ??
      left.payoutsKept ??
      0;

    console.log(
      `  ${label}: ${live} left, ${inTrash[plural]} deleted and restorable`,
    );
  }

  console.log(`left: ${totalOf(left.counts)}`);

  if (totalOf(left.counts) > 0) {
    throw new Error(
      `${totalOf(left.counts)} records are left: somebody created them during the run. Run the same command again.`,
    );
  }
};

it(
  'deletes every order with what belongs to it',
  async () => {
    try {
      await run();
    } catch (error) {
      // Nothing above puts the key in a message; this holds even if a library does.
      const message = messageOf(error);

      throw new Error(
        API_KEY === '' ? message : message.split(API_KEY).join('<key>'),
      );
    }
  },
  RUN_TIMEOUT_MILLISECONDS,
);
