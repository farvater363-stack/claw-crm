import { type MapCenter } from 'src/location/location';

type GetCurrentPositionResult =
  | { status: 'located'; lat: number; lng: number; accuracyMeters: number }
  | { status: 'failed'; reason: string };

// ponytail: the app bundles twenty-sdk 2.43.0, which predates the fork's
// getCurrentPosition export, so this reads the worker global the SDK reads.
// Import getCurrentPosition from 'twenty-sdk/front-component' once claw moves
// to an SDK that has it.
export const getDevicePosition = async (): Promise<MapCenter | null> => {
  const hostApi = (globalThis as Record<string, unknown>)
    .frontComponentHostCommunicationApi as
    | { getCurrentPosition?: () => Promise<GetCurrentPositionResult> }
    | undefined;

  if (hostApi?.getCurrentPosition === undefined) return null;

  try {
    const result = await hostApi.getCurrentPosition();

    return result.status === 'located'
      ? { lat: result.lat, lng: result.lng }
      : null;
  } catch {
    return null;
  }
};
