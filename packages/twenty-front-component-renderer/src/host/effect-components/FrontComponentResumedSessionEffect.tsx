import { useEffect } from 'react';

import { isDefined } from 'twenty-shared/utils';

import { type FrontComponentSession } from '@/host/keep-alive/types/FrontComponentSession';
import { type FrontComponentMediaSessionHost } from '@/host/media/types/FrontComponentMediaSessionHost';
import {
  claimFrontComponentSession,
  parkFrontComponentSession,
} from '@/host/keep-alive/utils/parkedFrontComponentSessions';
import { setFrontComponentSessionVisibility } from '@/host/keep-alive/utils/setFrontComponentSessionVisibility';

type FrontComponentResumedSessionEffectProps = {
  session: FrontComponentSession;
  sessionKey: string;
  mediaSessionHost?: FrontComponentMediaSessionHost;
  setError: (error: Error) => void;
};

export const FrontComponentResumedSessionEffect = ({
  session,
  sessionKey,
  mediaSessionHost,
  setError,
}: FrontComponentResumedSessionEffectProps) => {
  useEffect(() => {
    // A remount (React strict mode) finds the session parked by its own cleanup
    claimFrontComponentSession(sessionKey);
    session.errorSink.current = setError;

    if (
      isDefined(session.mediaSessionHostSink) &&
      isDefined(mediaSessionHost)
    ) {
      session.mediaSessionHostSink.current = mediaSessionHost;
    }

    // Lets the component refresh what it shows, as on a return to the tab
    setFrontComponentSessionVisibility(session, 'visible');

    return () => {
      setFrontComponentSessionVisibility(session, 'hidden');
      parkFrontComponentSession(sessionKey, session);
    };
  }, [session, sessionKey, mediaSessionHost, setError]);

  return null;
};
