export type HostWindowEvent = {
  type: 'visibilitychange' | 'focus';
  visibilityState: DocumentVisibilityState;
};
