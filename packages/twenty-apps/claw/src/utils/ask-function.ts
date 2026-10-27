import { CoreApiClient } from 'twenty-client-sdk/core';

type AskOptions = { method: 'GET' | 'POST'; body?: Record<string, unknown> };

type AskDependencies = {
  fetchImpl?: typeof fetch;
  renewToken?: () => Promise<void>;
};

// Only an API call renews the half-hour app token.
const renewWithCheapQuery = async () => {
  await new CoreApiClient().query({
    orders: { __args: { first: 1 }, edges: { node: { id: true } } },
  });
};

// Asked of the app's own functions, which run as the application: a measurer
// may read only their own orders and no workers, Цех no client phones.
export const askFunction = async (
  path: string,
  options: AskOptions = { method: 'GET' },
  { fetchImpl = fetch, renewToken = renewWithCheapQuery }: AskDependencies = {},
): Promise<Record<string, unknown>> => {
  const request = () =>
    fetchImpl(
      `${process.env.TWENTY_FUNCTIONS_URL ?? `${process.env.TWENTY_API_URL}/s`}/${path}`,
      {
        method: options.method,
        headers: {
          Authorization: `Bearer ${process.env.TWENTY_APP_ACCESS_TOKEN}`,
          ...(options.body === undefined
            ? {}
            : { 'Content-Type': 'application/json' }),
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      },
    );
  let response = await request();

  // A user may spend longer than the token's half hour on one screen; the
  // route answers an expired token with a 500, not a 401.
  if (!response.ok) {
    await renewToken();
    response = await request();
  }

  if (!response.ok) throw new Error(`${path}: ${response.status}`);

  return (await response.json()) as Record<string, unknown>;
};
