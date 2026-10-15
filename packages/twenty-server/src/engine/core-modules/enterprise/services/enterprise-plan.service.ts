/* @license Enterprise */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { type EnterpriseLicenseInfo } from 'src/engine/core-modules/enterprise/types/organization-key-payload.type';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';

// Claw CRM is licensed under its own agreement with Twenty, so every
// enterprise feature is on and nothing is reported to Twenty's license server.
@Injectable()
export class EnterprisePlanService {
  static readonly ENTERPRISE_KEY_BOUND_TO_ANOTHER_SERVER_CODE =
    'ENTERPRISE_KEY_BOUND_TO_ANOTHER_SERVER';

  static readonly ENTERPRISE_VALIDITY_TOKEN_RATE_LIMITED_CODE =
    'ENTERPRISE_VALIDITY_TOKEN_RATE_LIMITED';

  constructor(
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
  ) {}

  hasValidSignedEnterpriseKey(): boolean {
    return true;
  }

  hasValidEnterpriseValidityToken(): boolean {
    return true;
  }

  async isValidWithFreshToken(): Promise<boolean> {
    return true;
  }

  isValid(): boolean {
    return true;
  }

  isValidEnterpriseKeyFormat(_key: string): boolean {
    return true;
  }

  async getLicenseInfo(): Promise<EnterpriseLicenseInfo> {
    return {
      isValid: true,
      licensee: 'Claw CRM',
      expiresAt: null,
      subscriptionId: null,
    };
  }

  async setEnterpriseKey(_enterpriseKey: string): Promise<void> {}

  getLastRefreshRejectionCode(): string | null {
    return null;
  }

  async refreshValidityToken(): Promise<boolean> {
    return true;
  }

  async getBillableSeatCount(): Promise<number> {
    const result = await this.userWorkspaceRepository
      .createQueryBuilder('userWorkspace')
      .select('COUNT(DISTINCT "userWorkspace"."userId")', 'distinctUserCount')
      .where('"userWorkspace"."deletedAt" IS NULL')
      .getRawOne<{ distinctUserCount: string }>();

    return Math.max(1, Number(result?.distinctUserCount ?? 0));
  }

  async reportSeats(_seatCount: number): Promise<boolean> {
    return true;
  }

  async releaseServerBinding(): Promise<boolean> {
    return true;
  }

  async getSubscriptionStatus(): Promise<{
    status: string;
    licensee: string | null;
    expiresAt: Date | null;
    cancelAt: Date | null;
    currentPeriodEnd: Date | null;
    isCancellationScheduled: boolean;
  } | null> {
    return null;
  }

  async getPortalUrl(_returnUrl?: string): Promise<string | null> {
    return null;
  }

  async getCheckoutUrl(
    _billingInterval: 'monthly' | 'yearly' = 'monthly',
    _seatCount: number,
  ): Promise<string | null> {
    return null;
  }
}
