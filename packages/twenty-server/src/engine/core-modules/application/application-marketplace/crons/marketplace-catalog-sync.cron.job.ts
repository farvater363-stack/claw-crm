import { Injectable, Logger } from '@nestjs/common';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { MARKETPLACE_CATALOG_SYNC_CRON_PATTERN } from 'src/engine/core-modules/application/application-marketplace/crons/constants/marketplace-catalog-sync-cron-pattern.constant';
import { MarketplaceCatalogSyncService } from 'src/engine/core-modules/application/application-marketplace/marketplace-catalog-sync.service';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

@Injectable()
@Processor(MessageQueue.cronQueue)
export class MarketplaceCatalogSyncCronJob {
  private readonly logger = new Logger(MarketplaceCatalogSyncCronJob.name);

  constructor(
    private readonly marketplaceCatalogSyncService: MarketplaceCatalogSyncService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  @Process(MarketplaceCatalogSyncCronJob.name)
  @SentryCronMonitor(
    MarketplaceCatalogSyncCronJob.name,
    MARKETPLACE_CATALOG_SYNC_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    // The repeatable job may already be registered from before the flag was
    // turned off, so registration alone does not stop the outbound sync.
    if (
      !this.twentyConfigService.get('MARKETPLACE_CATALOG_SYNC_CRON_ENABLED')
    ) {
      return;
    }

    this.logger.log('Starting marketplace catalog sync...');

    try {
      await this.marketplaceCatalogSyncService.syncCatalog();
      this.logger.log('Marketplace catalog sync completed successfully');
    } catch (error) {
      this.logger.error(
        `Marketplace catalog sync failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
