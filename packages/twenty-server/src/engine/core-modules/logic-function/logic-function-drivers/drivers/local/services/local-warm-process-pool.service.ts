import { type ChildProcess, spawn } from 'node:child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

import { type LogicFunctionExecutionContext } from 'twenty-shared/logic-function';
import { isDefined } from 'twenty-shared/utils';

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
  // stdout and stderr of the current run, for runs that end without a result
  output: string;
};

// Runs every 'run' message it gets, one at a time, with that run's env and
// console output, and stays alive for the next one. The bundle is imported on
// the first run, after its env is set, for modules that read env at import.
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

  const loadHandler = () => import(pathToFileURL(${JSON.stringify(builtFileAbsPath)}).href).then((mod) => {
    const handlerFn = mod?.${handlerName.split('.').join('?.')};
    if (typeof handlerFn !== 'function') {
      throw new Error('Export "' + ${JSON.stringify(handlerName)} + '" not found in function bundle');
    }
    return handlerFn;
  });

  const LEVELS = { log: 'INFO', info: 'INFO', debug: 'DEBUG', warn: 'WARN', error: 'ERROR' };
  let handlerPromise = null;
  let isRunning = false;

  // Work a run left behind must not fail a later, unrelated run: an idle
  // process exits instead, and the pool never hands it out again
  const exitWhenIdle = (error) => {
    if (!isRunning) {
      process.stderr.write(String(error?.stack ?? error) + '\\n', () => process.exit(1));
    }
  };
  process.on('unhandledRejection', exitWhenIdle);
  process.on('uncaughtException', exitWhenIdle);

  process.on('message', async (msg) => {
    if (!msg || msg.type !== 'run') return;
    isRunning = true;

    let logs = '';
    const originalConsole = {};
    for (const [method, level] of Object.entries(LEVELS)) {
      originalConsole[method] = console[method];
      console[method] = (...args) => {
        const timestamp = new Date().toISOString();
        for (const line of format(...args).split('\\n')) {
          logs += timestamp + ' ' + level + ' ' + line + '\\n';
        }
      };
    }

    const runEnv = msg.env || {};
    const shadowedEnv = {};
    for (const key of Object.keys(runEnv)) {
      shadowedEnv[key] = process.env[key];
      process.env[key] = runEnv[key];
    }

    try {
      handlerPromise ??= loadHandler();
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
      for (const [key, value] of Object.entries(shadowedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      Object.assign(console, originalConsole);
      isRunning = false;
    }
  });
`;

export class LocalWarmProcessPoolService {
  private readonly idleProcessesByKey = new Map<string, WarmProcess[]>();

  async spawn({
    key,
    temporaryDirManager,
    sourceTemporaryDir,
    builtFileAbsPath,
    handlerName,
  }: {
    key: string;
    temporaryDirManager: TemporaryDirManager;
    sourceTemporaryDir: string;
    builtFileAbsPath: string;
    handlerName: string;
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

    // Strip NODE_OPTIONS to prevent tsx loader from being inherited
    const { NODE_OPTIONS: _nodeOptions, ...cleanProcessEnv } = process.env;

    const child = spawn(process.execPath, [runnerPath], {
      env: cleanProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    const warmProcess: WarmProcess = {
      key,
      child,
      temporaryDirManager,
      output: '',
    };

    const appendOutput = (level: 'INFO' | 'ERROR') => (chunk: Buffer) => {
      const timestamp = new Date().toISOString();

      warmProcess.output += String(chunk)
        .split('\n')
        .filter(Boolean)
        .map((line) => `${timestamp} ${level} ${line}\n`)
        .join('');
    };

    child.stdout?.on('data', appendOutput('INFO'));
    child.stderr?.on('data', appendOutput('ERROR'));

    child.once('exit', () => {
      this.forget(warmProcess);
      void temporaryDirManager.clean();
    });

    return warmProcess;
  }

  acquire(key: string): WarmProcess | undefined {
    const idleProcesses = this.idleProcessesByKey.get(key);
    const warmProcess = idleProcesses?.pop();

    if (idleProcesses?.length === 0) {
      this.idleProcessesByKey.delete(key);
    }

    if (isDefined(warmProcess?.idleTimer)) {
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

    warmProcess.output = '';

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
          logs: warmProcess.output,
          isReusable: false,
        });

      const timeout = setTimeout(() => {
        settle({
          ok: false,
          error: `Timed out after ${timeoutMs}ms`,
          logs: warmProcess.output,
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
    if (isDefined(warmProcess.idleTimer)) {
      clearTimeout(warmProcess.idleTimer);
      warmProcess.idleTimer = undefined;
    }

    const idleProcesses = this.idleProcessesByKey.get(warmProcess.key);

    if (!isDefined(idleProcesses)) return;

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
