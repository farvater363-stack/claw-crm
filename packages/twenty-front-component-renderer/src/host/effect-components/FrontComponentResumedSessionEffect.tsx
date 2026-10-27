import { useEffect } from 'react';

import { type FrontComponentSession } from '@/host/keep-alive/types/FrontComponentSession';
import {
  claimFrontComponentSession,
  parkFrontComponentSession,
} from '@/host/keep-alive/utils/parkedFrontComponentSessions';
import { setFrontComponentSessionVisibility } from '@/host/keep-alive/utils/setFrontComponentSessionVisibility';

type FrontComponentResumedSessionEffectProps = {
  session: FrontComponentSession;
  sessionKey: string;
  setError: (error: Error) => void;
};

export const FrontComponentResumedSessionEffect = ({
  session,
  sessionKey,
  setError,
}: FrontComponentResumedSessionEffectProps) => {
  useEffect(() => {
    // A remount (React strict mode) finds the session parked by its own cleanup
    claimFrontComponentSession(sessionKey);
    session.errorSink.current = setError;
    // Lets the component refresh what it shows, as on a return to the tab
    setFrontComponentSessionVisibility(session, 'visible');

    return () => {
      setFrontComponentSessionVisibility(session, 'hidden');
      parkFrontComponentSession(sessionKey, session);
    };
  }, [session, sessionKey, setError]);

  return null;
};
