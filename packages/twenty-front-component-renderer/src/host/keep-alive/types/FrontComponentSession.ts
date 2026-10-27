import { type RemoteReceiver } from '@remote-dom/core/receivers';

import { type GeometryTracker } from '@/host/geometry/types/GeometryTracker';
import { type FrontComponentMediaSessionHost } from '@/host/media/types/FrontComponentMediaSessionHost';
import { type FrontComponentThread } from '@/types/FrontComponentThread';

export type FrontComponentSession = {
  receiver: RemoteReceiver;
  thread: FrontComponentThread;
  geometryTracker: GeometryTracker;
  // The sandbox reports errors to whichever mount currently shows the session
  errorSink: { current: (error: Error) => void };
  mediaSessionHostSink: { current: FrontComponentMediaSessionHost } | null;
  destroy: () => void;
};
