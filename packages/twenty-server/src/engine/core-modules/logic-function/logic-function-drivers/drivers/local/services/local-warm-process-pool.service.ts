import { type ChildProcess, spawn } from 'node:child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

import { type LogicFunctionExecutionContext } from 'twenty-shared/logic-function';

import { type TemporaryDirManager } from 'src/engine/core-modules/logic-function/logic-function-drivers/utils/temporary-dir-manager';
import { HANDLER_NAME_REGEX } from 'src/engine/metadata-modules/logic-function/constants/handler.contant';

// A warm process skips the node start and the import of the function bundle
// and its SDK client, about half a second per run on a small server.
const MAX_IDLE_PROCESSES_PER_KEY = 2;
const MAX_IDLE_PROCESSES = 12;
const IDLE_PROCESS_TTL_MS = 10 * 60 * 1000;

export type WarmProcessRunResult = {
  ok: boolean;
  result?: unknown;
  errorType?: string;
  error?: string;
  stack?: string;
  logs: string;
  // False when the process must not serve another run
  isReusable: boolean;
};

type WarmProcess = {
  key: string;
  child: ChildProcess;
  temporaryDirManager: TemporaryDirManager;
  idleTimer?: ReturnType<typeof setTimeout>;
};

// Runs every 'run' message it gets, one at a time, with that run's env and
// console output, and stays alive for the next one.
const buildPersistentRunnerCode = ({
  builtFileAbsPath,
  handlerName,
}: {
  builtFileAbsPath: string;
  handlerName: string;
}) => `
  // Auto-generated. Do not edit.
  const { pathToFileURL } = require('node:url');
  const { format } = require('node:util');

  const handlerPromise = import(pathToFileURL(${JSON.stringify(builtFileAbsPath)}).href).then((mod) => {
    const handlerFn = mod?.${handlerName.split('.').join('?.')};
    if (typeof handlerFn !== 'function') {
      throw new Error('Export "' + ${JSON.stringify(handlerName)} + '" not found in function bundle');
    }
    return handlerFn;
  });
  handlerPromise.catch(() => {});

  const LEVELS = { log: 'INFO', info: 'INFO', debug: 'DEBUG', warn: 'WARN', error: 'ERROR' };
  let runEnvKeys = [];

  process.on('message', async (msg) => {
    if (!msg || msg.type !== 'run') return;

    let logs = '';
    const originalConsole = {};
    for (const [method, level] of Object.entries(LEVELS)) {
      originalConsole[method] = console[method];
      console[method] = (...args) => {
        logs += new Date().toISOString() + ' ' + level + ' ' + format(...args) + '\\n';
      };
    }

    for (const key of runEnvKeys) delete process.env[key];
    runEnvKeys = Object.keys(msg.env || {});
    Object.assign(process.env, msg.env || {});

    try {
      const handlerFn = await handlerPromise;
      const result = await handlerFn(msg.payload, msg.context);
      process.send({ ok: true, result, logs });
    } catch (error) {
      process.send({
        ok: false,
        errorType: error instanceof Error ? error.name : 'Error',
        error: error instanceof Error ? error.message : String(error),
        stack: error?.stack,
        logs,
      });
    } finally {
      Object.assign(console, originalConsole);
    }
  });
`;

export class LocalWarmProcessPool {
  private readonly idleProcessesByKey = new Map<string, WarmProcess[]>();

  async spawn({
    key,
    temporaryDirManager,
    sourceTemporaryDir,
    builtFileAbsPath,
    handlerName,
    env,
  }: {
    key: string;
    temporaryDirManager: TemporaryDirManager;
    sourceTemporaryDir: string;
    builtFileAbsPath: string;
    handlerName: string;
    env: Record<string, string>;
  }): Promise<WarmProcess> {
    if (!HANDLER_NAME_REGEX.test(handlerName)) {
      throw new Error(
        `Invalid handlerName "${handlerName}": must be a valid JavaScript identifier or dotted path`,
      );
    }

    const runnerPath = join(sourceTemporaryDir, '__warm_runner.cjs');

    await fs.writeFile(
      runnerPath,
      buildPersistentRunnerCode({ builtFileAbsPath, handlerName }),
      'utf8',
    );

    // Strip NODE_OPTIONS to prevent tsx loader from being inherited. The first
    // run's env is also set at start, for modules that read it at import time.
    const { NODE_OPTIONS: _n1, ...cleanProcessEnv } = process.env;
    const { NODE_OPTIONS: _n2, ...cleanUserEnv } = env;

    const child = spawn(process.execPath, [runnerPath], {
      env: { ...cleanProcessEnv, ...cleanUserEnv },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    // Output outside a run (a crash) has no execution to belong to
    child.stdout?.resume();
    child.stderr?.resume();

    const warmProcess: WarmProcess = { key, child, temporaryDirManager };

    child.once('exit', () => this.forget(warmProcess));

    return warmProcess;
  }

  acquire(key: string): WarmProcess | undefined {
    const idleProcesses = this.idleProcessesByKey.get(key);
    const warmProcess = idleProcesses?.pop();

    if (idleProcesses?.length === 0) {
      this.idleProcessesByKey.delete(key);
    }

    if (warmProcess?.idleTimer !== undefined) {
      clearTimeout(warmProcess.idleTimer);
      warmProcess.idleTimer = undefined;
    }

    return warmProcess;
  }

  run(
    warmProcess: WarmProcess,
    {
      payload,
      context,
      env,
      timeoutMs,
    }: {
      payload: unknown;
      context: LogicFunctionExecutionContext;
      env: Record<string, string>;
      timeoutMs: number;
    },
  ): Promise<WarmProcessRunResult> {
    const { child } = warmProcess;

    return new Promise((resolve) => {
      let settled = false;

      const settle = (result: WarmProcessRunResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        child.off('message', onMessage);
        child.off('exit', onExit);
        resolve(result);
      };

      const onMessage = (message: Omit<WarmProcessRunResult, 'isReusable'>) =>
        settle({ ...message, logs: message.logs ?? '', isReusable: true });

      const onExit = (code: number | null) =>
        settle({
          ok: false,
          error: `Exited with code ${code}`,
          logs: '',
          isReusable: false,
        });

      const timeout = setTimeout(() => {
        settle({
          ok: false,
          error: `Timed out after ${timeoutMs}ms`,
          logs: '',
          isReusable: false,
        });
      }, timeoutMs);

      child.on('message', onMessage);
      child.once('exit', onExit);

      const { NODE_OPTIONS: _nodeOptions, ...runEnv } = env;

      child.send({ type: 'run', payload, context, env: runEnv }, (error) => {
        if (error) {
          settle({
            ok: false,
            error: error.message,
            logs: '',
            isReusable: false,
          });
        }
      });
    });
  }

  release(warmProcess: WarmProcess): void {
    const idleProcesses = this.idleProcessesByKey.get(warmProcess.key) ?? [];

    if (idleProcesses.length >= MAX_IDLE_PROCESSES_PER_KEY) {
      void this.discard(warmProcess);

      return;
    }

    idleProcesses.push(warmProcess);
    this.idleProcessesByKey.set(warmProcess.key, idleProcesses);
    warmProcess.idleTimer = setTimeout(
      () => void this.discard(warmProcess),
      IDLE_PROCESS_TTL_MS,
    );
    warmProcess.idleTimer.unref?.();

    this.evictBeyondLimit();
  }

  async discard(warmProcess: WarmProcess): Promise<void> {
    this.forget(warmProcess);
    warmProcess.child.kill('SIGKILL');
    await warmProcess.temporaryDirManager.clean();
  }

  private forget(warmProcess: WarmProcess): void {
    if (warmProcess.idleTimer !== undefined) {
      clearTimeout(warmProcess.idleTimer);
      warmProcess.idleTimer = undefined;
    }

    const idleProcesses = this.idleProcessesByKey.get(warmProcess.key);

    if (idleProcesses === undefined) return;

    const remaining = idleProcesses.filter(
      (idleProcess) => idleProcess !== warmProcess,
    );

    if (remaining.length === 0) {
      this.idleProcessesByKey.delete(warmProcess.key);
    } else {
      this.idleProcessesByKey.set(warmProcess.key, remaining);
    }
  }

  // Map and array order are insertion order, so the oldest idle go first
  private evictBeyondLimit(): void {
    const idleProcesses = [...this.idleProcessesByKey.values()].flat();

    for (const warmProcess of idleProcesses.slice(
      0,
      Math.max(0, idleProcesses.length - MAX_IDLE_PROCESSES),
    )) {
      void this.discard(warmProcess);
    }
  }
}
