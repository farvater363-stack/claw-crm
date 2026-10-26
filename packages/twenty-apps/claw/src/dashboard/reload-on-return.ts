import { useEffect } from 'react';

// Coming back to the tab fires both events at once; one reload is enough.
const SAME_RETURN_MILLISECONDS = 1_000;

type ReturnTargets = {
  document: Pick<Document, 'visibilityState'> & EventTarget;
  window: EventTarget;
};

// The host forwards its page's visibility and focus into the worker, so a
// screen left open picks up what others changed meanwhile.
export const listenForReturn = (
  onReturn: () => void,
  { document, window }: ReturnTargets = globalThis,
): (() => void) => {
  let lastReturnAt = -Infinity;

  const handleReturn = () => {
    if (document.visibilityState === 'hidden') return;

    const now = Date.now();

    if (now - lastReturnAt < SAME_RETURN_MILLISECONDS) return;

    lastReturnAt = now;
    onReturn();
  };

  document.addEventListener('visibilitychange', handleReturn);
  window.addEventListener('focus', handleReturn);

  return () => {
    document.removeEventListener('visibilitychange', handleReturn);
    window.removeEventListener('focus', handleReturn);
  };
};

export const useReloadOnReturn = (reload: () => void) => {
  useEffect(() => listenForReturn(reload), [reload]);
};
