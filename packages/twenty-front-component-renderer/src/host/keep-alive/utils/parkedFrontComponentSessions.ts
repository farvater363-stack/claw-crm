import { isDefined } from 'twenty-shared/utils';

import { type FrontComponentSession } from '@/host/keep-alive/types/FrontComponentSession';

// Each parked session holds a worker with its SDK client and React tree, so
// only the screens opened most recently stay warm.
const MAX_PARKED_SESSIONS = 3;

const parkedSessions = new Map<string, FrontComponentSession>();

export const parkFrontComponentSession = (
  key: string,
  session: FrontComponentSession,
): void => {
  const replacedSession = parkedSessions.get(key);

  if (isDefined(replacedSession) && replacedSession !== session) {
    replacedSession.destroy();
  }

  parkedSessions.delete(key);
  parkedSessions.set(key, session);

  for (const [oldestKey, oldestSession] of parkedSessions) {
    if (parkedSessions.size <= MAX_PARKED_SESSIONS) {
      break;
    }

    oldestSession.destroy();
    parkedSessions.delete(oldestKey);
  }
};

export const claimFrontComponentSession = (
  key: string,
): FrontComponentSession | undefined => {
  const session = parkedSessions.get(key);

  parkedSessions.delete(key);

  return session;
};
