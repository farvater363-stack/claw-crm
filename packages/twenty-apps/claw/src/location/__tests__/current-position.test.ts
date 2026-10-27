import { afterEach, describe, expect, it } from 'vitest';

import { getDevicePosition } from 'src/location/current-position';

const setHostApi = (hostApi: Record<string, unknown> | undefined) => {
  (globalThis as Record<string, unknown>).frontComponentHostCommunicationApi =
    hostApi;
};

describe('getDevicePosition', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)
      .frontComponentHostCommunicationApi;
  });

  it('is null outside a front component', async () => {
    setHostApi(undefined);

    await expect(getDevicePosition()).resolves.toBe(null);
  });

  it('is null on a server without the position bridge', async () => {
    setHostApi({ copyToClipboard: async () => {} });

    await expect(getDevicePosition()).resolves.toBe(null);
  });

  it('returns the located point', async () => {
    setHostApi({
      getCurrentPosition: async () => ({
        status: 'located',
        lat: 41.35,
        lng: 69.3,
        accuracyMeters: 20,
      }),
    });

    await expect(getDevicePosition()).resolves.toEqual({
      lat: 41.35,
      lng: 69.3,
    });
  });

  it('is null when the tablet refuses', async () => {
    setHostApi({
      getCurrentPosition: async () => ({ status: 'failed', reason: 'denied' }),
    });

    await expect(getDevicePosition()).resolves.toBe(null);
  });

  it('is null when the bridge call fails', async () => {
    setHostApi({
      getCurrentPosition: async () => {
        throw new Error('thread closed');
      },
    });

    await expect(getDevicePosition()).resolves.toBe(null);
  });
});
