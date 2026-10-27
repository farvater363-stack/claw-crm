import { promises as fs } from 'fs';
import { join } from 'path';

import { LocalWarmProcessPoolService } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/services/local-warm-process-pool.service';
import { TemporaryDirManager } from 'src/engine/core-modules/logic-function/logic-function-drivers/utils/temporary-dir-manager';

const HANDLER_SOURCE = `
export const main = async (payload) => {
  if (payload.action === 'throw') throw new Error('handler failed');
  if (payload.action === 'hang') await new Promise(() => {});
  if (payload.action === 'crash') process.exit(3);
  if (payload.action === 'home') return { home: process.env.HOME };
  if (payload.action === 'leave-rejection') {
    setTimeout(() => Promise.reject(new Error('late failure')), 50);
    return {};
  }
  if (payload.action === 'log-then-hang') {
    console.error('about to hang');
    process.stderr.write('raw stderr\\n');
    await new Promise(() => {});
  }
  console.log('run for', process.env.RUN_USER);
  return { pid: process.pid, user: process.env.RUN_USER, leftover: process.env.ONLY_FIRST_RUN ?? null };
};
`;

const context = {
  retryCount: 0,
  maxRetries: 0,
  workspaceId: 'workspace-1',
  userWorkspaceId: null,
  workspaceMemberId: null,
};

describe('LocalWarmProcessPoolService', () => {
  const pool = new LocalWarmProcessPoolService();

  // Real child processes run against real clocks
  beforeAll(() => jest.useRealTimers());

  const spawnWarmProcess = async (key: string) => {
    const temporaryDirManager = new TemporaryDirManager();
    const { sourceTemporaryDir } = await temporaryDirManager.init();
    const builtFileAbsPath = join(sourceTemporaryDir, 'handler.mjs');

    await fs.writeFile(builtFileAbsPath, HANDLER_SOURCE, 'utf8');

    return pool.spawn({
      key,
      temporaryDirManager,
      sourceTemporaryDir,
      builtFileAbsPath,
      handlerName: 'main',
    });
  };

  const run = (
    warmProcess: Awaited<ReturnType<typeof spawnWarmProcess>>,
    action: string,
    env: Record<string, string>,
    timeoutMs = 5_000,
  ) => pool.run(warmProcess, { payload: { action }, context, env, timeoutMs });

  it('serves later runs from the same process with each run its own env and logs', async () => {
    const warmProcess = await spawnWarmProcess('reuse');

    const first = await run(warmProcess, 'ok', {
      RUN_USER: 'first',
      ONLY_FIRST_RUN: 'yes',
    });

    pool.release(warmProcess);

    const reused = pool.acquire('reuse');

    expect(reused).toBe(warmProcess);

    const second = await run(warmProcess, 'ok', { RUN_USER: 'second' });

    expect(first).toMatchObject({ ok: true, isReusable: true });
    expect(second.result).toEqual({
      pid: (first.result as { pid: number }).pid,
      user: 'second',
      leftover: null,
    });
    expect(second.logs).toMatch(/INFO run for second\n$/);
    expect(second.logs).not.toMatch(/first/);

    await pool.discard(warmProcess);
  });

  it('keeps a process whose handler threw, and reports the error', async () => {
    const warmProcess = await spawnWarmProcess('throw');

    expect(await run(warmProcess, 'throw', {})).toMatchObject({
      ok: false,
      error: 'handler failed',
      isReusable: true,
    });
    expect((await run(warmProcess, 'ok', {})).ok).toBe(true);

    await pool.discard(warmProcess);
  });

  it('marks a process that timed out or exited as not reusable', async () => {
    const hanging = await spawnWarmProcess('hang');
    const crashing = await spawnWarmProcess('crash');

    expect(await run(hanging, 'hang', {}, 300)).toMatchObject({
      ok: false,
      error: 'Timed out after 300ms',
      isReusable: false,
    });
    expect(await run(crashing, 'crash', {})).toMatchObject({
      ok: false,
      isReusable: false,
    });

    await pool.discard(hanging);
    await pool.discard(crashing);
  });

  it('hands out nothing for a key without an idle process', () => {
    expect(pool.acquire('unknown')).toBeUndefined();
  });

  it("restores a server env var that a run's env shadowed", async () => {
    const warmProcess = await spawnWarmProcess('shadow');

    await run(warmProcess, 'ok', { HOME: '/shadowed' });

    expect((await run(warmProcess, 'home', {})).result).toEqual({
      home: process.env.HOME,
    });

    await pool.discard(warmProcess);
  });

  it('never hands out an idle process that work from an earlier run broke', async () => {
    const warmProcess = await spawnWarmProcess('leftover');

    expect((await run(warmProcess, 'leave-rejection', {})).ok).toBe(true);
    pool.release(warmProcess);

    await new Promise((resolve) => warmProcess.child.once('exit', resolve));

    expect(pool.acquire('leftover')).toBeUndefined();
  });

  it("keeps a timed-out run's raw output", async () => {
    const warmProcess = await spawnWarmProcess('silent-hang');
    const timedOut = await run(warmProcess, 'log-then-hang', {}, 1_000);

    expect(timedOut.logs).toMatch(/ERROR raw stderr/);

    await pool.discard(warmProcess);
  });
});
