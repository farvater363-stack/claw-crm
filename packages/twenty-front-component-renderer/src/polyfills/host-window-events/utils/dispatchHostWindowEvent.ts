import { type HostWindowEvent } from '@/types/HostWindowEvent';

// A worker has no visibility or focus of its own; the host page's are replayed
// on the polyfilled document and window so components can listen as in a page.
export const dispatchHostWindowEvent = (
  { type, visibilityState }: HostWindowEvent,
  { document, window }: { document: EventTarget; window: EventTarget },
): void => {
  Object.defineProperty(document, 'visibilityState', {
    value: visibilityState,
    configurable: true,
  });
  Object.defineProperty(document, 'hidden', {
    value: visibilityState === 'hidden',
    configurable: true,
  });

  // In the worker the global Event is remote-dom's; its targets cannot take a native one.
  (type === 'visibilitychange' ? document : window).dispatchEvent(
    new Event(type),
  );
};
