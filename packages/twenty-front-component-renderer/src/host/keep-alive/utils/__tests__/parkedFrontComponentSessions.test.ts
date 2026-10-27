import { type FrontComponentSession } from '@/host/keep-alive/types/FrontComponentSession';
import {
  claimFrontComponentSession,
  parkFrontComponentSession,
} from '@/host/keep-alive/utils/parkedFrontComponentSessions';

const createSession = () =>
  ({ destroy: jest.fn() }) as unknown as FrontComponentSession;

describe('parked front component sessions', () => {
  afterEach(() => {
    for (const key of ['a', 'b', 'c', 'd']) {
      claimFrontComponentSession(key);
    }
  });

  it('hands a parked session to the next mount with the same key, once', () => {
    const session = createSession();

    parkFrontComponentSession('a', session);

    expect(claimFrontComponentSession('b')).toBeUndefined();
    expect(claimFrontComponentSession('a')).toBe(session);
    expect(claimFrontComponentSession('a')).toBeUndefined();
    expect(session.destroy).not.toHaveBeenCalled();
  });

  it('destroys the oldest session beyond three', () => {
    const sessions = [createSession(), createSession(), createSession()];
    const newest = createSession();

    sessions.forEach((session, index) =>
      parkFrontComponentSession(['a', 'b', 'c'][index], session),
    );
    parkFrontComponentSession('d', newest);

    expect(sessions[0].destroy).toHaveBeenCalled();
    expect(claimFrontComponentSession('a')).toBeUndefined();
    expect(claimFrontComponentSession('d')).toBe(newest);
  });

  it('destroys a session replaced under its key, but not when parked twice', () => {
    const first = createSession();
    const second = createSession();

    parkFrontComponentSession('a', first);
    parkFrontComponentSession('a', first);
    expect(first.destroy).not.toHaveBeenCalled();

    parkFrontComponentSession('a', second);
    expect(first.destroy).toHaveBeenCalled();
    expect(claimFrontComponentSession('a')).toBe(second);
  });
});
