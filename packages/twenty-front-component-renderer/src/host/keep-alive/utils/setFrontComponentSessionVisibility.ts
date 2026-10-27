import { type FrontComponentSession } from '@/host/keep-alive/types/FrontComponentSession';

export const setFrontComponentSessionVisibility = (
  session: Pick<FrontComponentSession, 'thread'>,
  visibilityState: DocumentVisibilityState,
): void => {
  session.thread.imports
    .dispatchHostWindowEvent({ type: 'visibilitychange', visibilityState })
    .catch(() => {});
};
