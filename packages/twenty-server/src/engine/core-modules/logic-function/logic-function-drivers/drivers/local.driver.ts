import { promises as fs } from 'fs';
import { dirname, join } from 'path';

import { build } from 'esbuild';
import { NODE_ESM_CJS_BANNER } from 'twenty-shared/application';
import { isDefined } from 'twenty-shared/utils';

import {
  type LogicFunctionDriver,
  type LogicFunctionExecuteParams,
  type LogicFunctionExecuteResult,
  type LogicFunctionInstallPrebuiltBundleParams,
  type LogicFunctionTranspileParams,
  type LogicFunctionTranspileResult,
} from 'src/engine/core-modules/logic-function/logic-function-drivers/interfaces/logic-function-driver.interface';

import { LocalChildProcessRunnerService } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/services/local-child-process-runner.service';
import { LocalLayerManagerService } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/services/local-layer-manager.service';
import { LocalWarmProcessPoolService } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/services/local-warm-process-pool.service';
import { LocalPrebuiltBundleService } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/services/local-prebuilt-bundle.service';
import { type LocalDriverOptions } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/types/local-driver.type';
import { LAYER_BUILD_READY_SENTINEL } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/constants/local-driver.constant';
import { getLocalSdkLayerPath } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/utils/get-local-sdk-layer-path.util';
import { ConsoleListener } from 'src/engine/core-modules/logic-function/logic-function-drivers/utils/intercept-console';
import { TemporaryDirManager } from 'src/engine/core-modules/logic-function/logic-function-drivers/utils/temporary-dir-manager';
import { type LogicFunctionResourceService } from 'src/engine/core-modules/logic-function/logic-function-resource/logic-function-resource.service';
import { LogicFunctionExecutionStatus } from 'src/engine/metadata-modules/logic-function/dtos/logic-function-execution-result.dto';
import { LogicFunctionExecutionMode } from 'src/engine/metadata-modules/logic-function/logic-function.entity';
import {
  LogicFunctionException,
  LogicFunctionExceptionCode,
} from 'src/engine/metadata-modules/logic-function/logic-function.exception';
import { type FlatLogicFunction } from 'src/engine/metadata-modules/logic-function/types/flat-logic-function.type';
import { isLogicFunctionReadyForPrebuiltInstall } from 'src/engine/metadata-modules/logic-function/utils/is-logic-function-ready-for-prebuilt-install.util';

export { type LocalDriverOptions } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/types/local-driver.type';

export class LocalDriver implements LogicFunctionDriver {
  private readonly logicFunctionResourceService: LogicFunctionResourceService;
  private readonly layerManager: LocalLayerManagerService;
  private readonly childProcessRunner: LocalChildProcessRunnerService;
  private readonly prebuiltBundle: LocalPrebuiltBundleService;
  private readonly warmProcessPool: LocalWarmProcessPoolService | null;

  constructor(options: LocalDriverOptions) {
    this.logicFunctionResourceService = options.logicFunctionResourceService;
    this.layerManager = new LocalLayerManagerService(
      options.cacheLockService,
      options.logicFunctionResourceService,
      options.sdkClientArchiveService,
      options.workspaceCacheService,
    );
    this.childProcessRunner = new LocalChildProcessRunnerService();
    this.prebuiltBundle = new LocalPrebuiltBundleService(
      options.cacheLockService,
      options.logicFunctionResourceService,
    );
    this.warmProcessPool =
      options.reuseProcesses === true
        ? new LocalWarmProcessPoolService()
        : null;
  }

  async transpile({
    sourceCode,
    sourceFileName,
    builtFileName,
  }: LogicFunctionTranspileParams): Promise<LogicFunctionTranspileResult> {
    const temporaryDirManager = new TemporaryDirManager();
    const { sourceTemporaryDir } = await temporaryDirManager.init();

    try {
      const entryFilePath = join(sourceTemporaryDir, sourceFileName);
      const builtBundleFilePath = join(sourceTemporaryDir, builtFileName);

      await fs.mkdir(dirname(entryFilePath), { recursive: true });
      await fs.writeFile(entryFilePath, sourceCode, 'utf-8');
      await fs.mkdir(dirname(builtBundleFilePath), { recursive: true });

      await build({
        entryPoints: [entryFilePath],
        outfile: builtBundleFilePath,
        platform: 'node',
        format: 'esm',
        target: 'esnext',
        bundle: true,
        sourcemap: true,
        packages: 'external',
        banner: NODE_ESM_CJS_BANNER,
      });

      const builtCode = await fs.readFile(builtBundleFilePath, 'utf-8');

      return { builtCode };
    } finally {
      await temporaryDirManager.clean();
    }
  }

  async delete(): Promise<void> {}

  async deleteApplicationResources(): Promise<void> {}

  async installPrebuiltBundle(
    params: LogicFunctionInstallPrebuiltBundleParams,
  ): Promise<void> {
    await this.prebuiltBundle.installPrebuiltBundle(params);
  }

  async getInstalledBundleChecksum(
    flatLogicFunction: FlatLogicFunction,
  ): Promise<string | null> {
    return this.prebuiltBundle.getInstalledBundleChecksum(flatLogicFunction);
  }

  async execute({
    flatLogicFunction,
    flatApplication,
    applicationUniversalIdentifier,
    payload,
    context,
    env,
    timeoutMs = 900_000,
    forceExecutionMode,
  }: LogicFunctionExecuteParams): Promise<LogicFunctionExecuteResult> {
    const executionMode = forceExecutionMode ?? flatLogicFunction.executionMode;

    if (
      executionMode === LogicFunctionExecutionMode.PREBUILT &&
      !isLogicFunctionReadyForPrebuiltInstall(flatLogicFunction)
    ) {
      throw new LogicFunctionException(
        `Cannot run logic function '${flatLogicFunction.id}' in PREBUILT mode: bundle is not installed`,
        LogicFunctionExceptionCode.LOGIC_FUNCTION_PREBUILT_BUNDLE_NOT_INSTALLED,
      );
    }

    await this.layerManager.ensureDepsLayer({
      flatApplication,
      applicationUniversalIdentifier,
    });
    await this.layerManager.ensureSdkLayer({
      flatApplication,
      applicationUniversalIdentifier,
    });

    if (isDefined(this.warmProcessPool)) {
      return this.executeInWarmProcess({
        warmProcessPool: this.warmProcessPool,
        flatLogicFunction,
        flatApplication,
        applicationUniversalIdentifier,
        payload,
        context,
        env: env ?? {},
        timeoutMs,
        executionMode,
      });
    }

    const startTime = Date.now();
    const temporaryDirManager = new TemporaryDirManager();

    try {
      const { sourceTemporaryDir } = await temporaryDirManager.init();

      await this.childProcessRunner.assembleNodeModules({
        sourceTemporaryDir,
        flatApplication,
        applicationUniversalIdentifier,
      });

      const inMemoryBuiltHandlerPath =
        executionMode === LogicFunctionExecutionMode.PREBUILT
          ? await this.prebuiltBundle.copyPrebuiltBundleIntoExecutionDir({
              flatLogicFunction,
              sourceTemporaryDir,
            })
          : await this.logicFunctionResourceService.copyBuiltCodeInMemory({
              workspaceId: flatLogicFunction.workspaceId,
              applicationUniversalIdentifier,
              builtHandlerPath: flatLogicFunction.builtHandlerPath,
              inMemoryDestinationPath: sourceTemporaryDir,
            });

      let logs = '';
      const consoleListener = new ConsoleListener();

      consoleListener.intercept((type, args) => {
        const formattedArgs = args.map((arg) => {
          if (typeof arg === 'object' && arg !== null) {
            const seen = new WeakSet();

            return JSON.stringify(
              arg,
              (_key, value) => {
                if (typeof value === 'object' && value !== null) {
                  if (seen.has(value)) {
                    return '[Circular]';
                  }
                  seen.add(value);
                }

                return value;
              },
              2,
            );
          }

          return arg;
        });

        const formattedType = type === 'log' ? 'info' : type;

        logs += `${new Date().toISOString()} ${formattedType.toUpperCase()} ${formattedArgs.join(' ')}\n`;
      });

      try {
        const runnerPath = await this.childProcessRunner.writeBootstrapRunner({
          dir: sourceTemporaryDir,
          builtFileAbsPath: inMemoryBuiltHandlerPath,
          handlerName: flatLogicFunction.handlerName,
        });

        const { ok, result, errorType, error, stack, stdout, stderr } =
          await this.childProcessRunner.runChildWithEnv({
            runnerPath,
            env: env ?? {},
            payload,
            context,
            timeoutMs,
          });

        if (stdout)
          logs +=
            stdout
              .split('\n')
              .filter(Boolean)
              .map((l) => `${new Date().toISOString()} INFO ${l}`)
              .join('\n') + '\n';
        if (stderr)
          logs +=
            stderr
              .split('\n')
              .filter(Boolean)
              .map((l) => `${new Date().toISOString()} ERROR ${l}`)
              .join('\n') + '\n';

        const duration = Date.now() - startTime;

        if (ok) {
          return {
            data: (result ?? null) as object | null,
            logs,
            duration,
            billedDurationMs: duration,
            status: LogicFunctionExecutionStatus.SUCCESS,
          };
        }

        return {
          data: null,
          logs,
          duration,
          billedDurationMs: duration,
          error: {
            errorType: errorType ?? 'UnhandledError',
            errorMessage: error || 'Unknown error',
            stackTrace: stack ? String(stack).split('\n') : [],
          },
          status: LogicFunctionExecutionStatus.ERROR,
        };
      } finally {
        consoleListener.release();
      }
    } finally {
      await temporaryDirManager.clean();
    }
  }

  private async executeInWarmProcess({
    warmProcessPool,
    flatLogicFunction,
    flatApplication,
    applicationUniversalIdentifier,
    payload,
    context,
    env,
    timeoutMs,
    executionMode,
  }: Pick<
    LogicFunctionExecuteParams,
    | 'flatLogicFunction'
    | 'flatApplication'
    | 'applicationUniversalIdentifier'
    | 'payload'
    | 'context'
  > & {
    warmProcessPool: LocalWarmProcessPoolService;
    env: Record<string, string>;
    timeoutMs: number;
    executionMode: LogicFunctionExecutionMode;
  }): Promise<LogicFunctionExecuteResult> {
    const startTime = Date.now();
    const key = await this.buildWarmProcessKey({
      flatLogicFunction,
      flatApplication,
      applicationUniversalIdentifier,
      executionMode,
    });

    const warmProcess =
      warmProcessPool.acquire(key) ??
      (await this.spawnWarmProcess({
        warmProcessPool,
        key,
        flatLogicFunction,
        flatApplication,
        applicationUniversalIdentifier,
        env,
        executionMode,
      }));

    const { isReusable, ok, result, errorType, error, stack, logs } =
      await warmProcessPool.run(warmProcess, {
        payload,
        context,
        env,
        timeoutMs,
      });

    if (isReusable) {
      warmProcessPool.release(warmProcess);
    } else {
      await warmProcessPool.discard(warmProcess);
    }

    const duration = Date.now() - startTime;

    if (ok) {
      return {
        data: (result ?? null) as object | null,
        logs,
        duration,
        billedDurationMs: duration,
        status: LogicFunctionExecutionStatus.SUCCESS,
      };
    }

    return {
      data: null,
      logs,
      duration,
      billedDurationMs: duration,
      error: {
        errorType: errorType ?? 'UnhandledError',
        errorMessage: error || 'Unknown error',
        stackTrace: stack ? String(stack).split('\n') : [],
      },
      status: LogicFunctionExecutionStatus.ERROR,
    };
  }

  private async spawnWarmProcess({
    warmProcessPool,
    key,
    flatLogicFunction,
    flatApplication,
    applicationUniversalIdentifier,
    env,
    executionMode,
  }: Pick<
    LogicFunctionExecuteParams,
    'flatLogicFunction' | 'flatApplication' | 'applicationUniversalIdentifier'
  > & {
    warmProcessPool: LocalWarmProcessPoolService;
    key: string;
    env: Record<string, string>;
    executionMode: LogicFunctionExecutionMode;
  }) {
    const temporaryDirManager = new TemporaryDirManager();
    const { sourceTemporaryDir } = await temporaryDirManager.init();

    try {
      await this.childProcessRunner.assembleNodeModules({
        sourceTemporaryDir,
        flatApplication,
        applicationUniversalIdentifier,
      });

      const builtFileAbsPath =
        executionMode === LogicFunctionExecutionMode.PREBUILT
          ? await this.prebuiltBundle.copyPrebuiltBundleIntoExecutionDir({
              flatLogicFunction,
              sourceTemporaryDir,
            })
          : await this.logicFunctionResourceService.copyBuiltCodeInMemory({
              workspaceId: flatLogicFunction.workspaceId,
              applicationUniversalIdentifier,
              builtHandlerPath: flatLogicFunction.builtHandlerPath,
              inMemoryDestinationPath: sourceTemporaryDir,
            });

      return await warmProcessPool.spawn({
        key,
        temporaryDirManager,
        sourceTemporaryDir,
        builtFileAbsPath,
        handlerName: flatLogicFunction.handlerName,
      });
    } catch (error) {
      await temporaryDirManager.clean();

      throw error;
    }
  }

  // Everything a warm process has loaded: the function code, its deps layer
  // and the SDK client layer, which is rebuilt when the workspace schema
  // changes (its ready marker is rewritten then).
  private async buildWarmProcessKey({
    flatLogicFunction,
    flatApplication,
    applicationUniversalIdentifier,
    executionMode,
  }: Pick<
    LogicFunctionExecuteParams,
    'flatLogicFunction' | 'flatApplication' | 'applicationUniversalIdentifier'
  > & { executionMode: LogicFunctionExecutionMode }): Promise<string> {
    // A layer rebuilt by another job right now gets a key of its own, so the
    // run starts a fresh process instead of failing
    const sdkLayerBuiltAt = await fs
      .stat(
        join(
          getLocalSdkLayerPath({
            workspaceId: flatApplication.workspaceId,
            applicationUniversalIdentifier,
          }),
          LAYER_BUILD_READY_SENTINEL,
        ),
      )
      .then(({ mtimeMs }) => String(mtimeMs))
      .catch(() => `rebuilding-${Date.now()}`);

    return [
      flatLogicFunction.workspaceId,
      applicationUniversalIdentifier,
      flatLogicFunction.id,
      flatLogicFunction.checksum ?? String(flatLogicFunction.updatedAt),
      flatLogicFunction.builtHandlerPath,
      flatLogicFunction.handlerName,
      executionMode,
      flatApplication.yarnLockChecksum ?? 'default',
      sdkLayerBuiltAt,
    ].join('|');
  }
}
