import { useEffect } from 'react';

import { type FrontComponentThread } from '@/types/FrontComponentThread';
import { type HostWindowEvent } from '@/types/HostWindowEvent';

type FrontComponentHostWindowEventsEffectProps = {
  thread: FrontComponentThread;
};

export const FrontComponentHostWindowEventsEffect = ({
  thread,
}: FrontComponentHostWindowEventsEffectProps) => {
  useEffect(() => {
    const forward = (event: Event) => {
      thread.imports
        .dispatchHostWindowEvent({
          type: event.type as HostWindowEvent['type'],
          visibilityState: document.visibilityState,
        })
        .catch(() => {});
    };

    document.addEventListener('visibilitychange', forward);
    window.addEventListener('focus', forward);

    return () => {
      document.removeEventListener('visibilitychange', forward);
      window.removeEventListener('focus', forward);
    };
  }, [thread]);

  return null;
};
