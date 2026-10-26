import { describe, expect, it, vi } from 'vitest';

import { handler } from 'src/logic-functions/my-worker';
import { findWorkerIdByLogin } from 'src/recalc/find-worker-by-login';

vi.mock('src/recalc/create-recalc-client', () => ({
  createRecalcClient: vi.fn(() => ({})),
}));
vi.mock('src/recalc/find-worker-by-login', () => ({
  findWorkerIdByLogin: vi.fn(async (_client: unknown, memberId: string) =>
    memberId === 'member-measurer' ? 'worker-measurer' : null,
  ),
}));

const contextOf = (workspaceMemberId: string | null) => ({
  retryCount: 0,
  maxRetries: 0,
  workspaceId: 'workspace-1',
  userWorkspaceId: null,
  workspaceMemberId,
});

describe('my-worker route', () => {
  it("answers with the caller's own worker", async () => {
    expect(await handler({}, contextOf('member-measurer'))).toEqual({
      workerId: 'worker-measurer',
    });
  });

  it('answers null for a caller who is no worker', async () => {
    expect(await handler({}, contextOf('member-manager'))).toEqual({
      workerId: null,
    });
  });

  it('takes the caller from the token, never from the request', async () => {
    expect(
      await handler(
        { workspaceMemberId: 'member-measurer' },
        contextOf('member-manager'),
      ),
    ).toEqual({ workerId: null });
  });

  it('looks nobody up when the token names no member', async () => {
    vi.mocked(findWorkerIdByLogin).mockClear();

    expect(await handler({}, contextOf(null))).toEqual({ workerId: null });
    expect(findWorkerIdByLogin).not.toHaveBeenCalled();
  });
});
