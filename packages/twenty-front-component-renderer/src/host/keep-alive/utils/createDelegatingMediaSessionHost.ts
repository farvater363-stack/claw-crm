import { type FrontComponentMediaSessionHost } from '@/host/media/types/FrontComponentMediaSessionHost';

// The thread keeps the host it was created with; a resumed screen points this
// at its own mount, so recordings, indicators and permission prompts belong
// to the screen on view and stop with it
export const createDelegatingMediaSessionHost = (mediaSessionHostSink: {
  current: FrontComponentMediaSessionHost;
}): FrontComponentMediaSessionHost =>
  new Proxy({} as FrontComponentMediaSessionHost, {
    get: (_target, property) => {
      const value =
        mediaSessionHostSink.current[
          property as keyof FrontComponentMediaSessionHost
        ];

      return typeof value === 'function'
        ? value.bind(mediaSessionHostSink.current)
        : value;
    },
  });
