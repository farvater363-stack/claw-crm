import { describe, expect, it } from 'vitest';

import {
  AWAITING_MEASUREMENT_STATUSES,
  BOARD_STATUSES,
  isInProduction,
  isInstalled,
  isMeasured,
  isReserving,
  isSentToInstallation,
  isStatusIn,
  isWrittenOff,
  MEASURER_BOARD_STATUSES,
  READY_AT_STATUSES,
  RESERVING_STATUSES,
  STATUSES_HOLDING_MATERIAL,
  STATUSES_WITHOUT_DEADLINE,
  WORKSHOP_STATUSES,
  WRITTEN_OFF_STATUSES,
} from 'src/constants/order-status-sets';
import { ORDER_STATUS_OPTIONS } from 'src/constants/select-options';

describe('order status sets', () => {
  it('reserves material only while the order is measured', () => {
    expect(RESERVING_STATUSES).toEqual(['MEASURED']);
    expect(isReserving('MEASURED')).toBe(true);
    expect(isReserving('PRODUCTION')).toBe(false);
    expect(isReserving(null)).toBe(false);
  });

  it('resyncs orders that hold reserved or freshly written-off material', () => {
    expect(STATUSES_HOLDING_MATERIAL).toEqual([
      'MEASURED',
      'PRODUCTION',
      'QUALITY_CHECK',
    ]);
  });

  it('counts material as written off from production to installed', () => {
    expect(WRITTEN_OFF_STATUSES).toEqual([
      'PRODUCTION',
      'QUALITY_CHECK',
      'INSTALLED',
    ]);
    expect(isWrittenOff('QUALITY_CHECK')).toBe(true);
    expect(isWrittenOff('MEASURED')).toBe(false);
    expect(isWrittenOff('CANCELLED')).toBe(false);
    expect(isWrittenOff(null)).toBe(false);
  });

  it('stamps the ready date when the order is sent to installation or installed', () => {
    expect(READY_AT_STATUSES).toEqual(['QUALITY_CHECK', 'INSTALLED']);
  });

  it('has no deadline state once the order left the workshop or was cancelled', () => {
    expect(STATUSES_WITHOUT_DEADLINE).toEqual([
      'QUALITY_CHECK',
      'INSTALLED',
      'CANCELLED',
    ]);
  });

  it('shows six columns on the board, in the order of the path', () => {
    expect(BOARD_STATUSES).toEqual([
      'NEW',
      'MEASUREMENT_SCHEDULED',
      'MEASURED',
      'PRODUCTION',
      'QUALITY_CHECK',
      'INSTALLED',
    ]);
  });

  it('shows the measurer two columns and lists what waits for him', () => {
    expect(MEASURER_BOARD_STATUSES).toEqual([
      'MEASUREMENT_SCHEDULED',
      'MEASURED',
    ]);
    expect(AWAITING_MEASUREMENT_STATUSES).toEqual(['MEASUREMENT_SCHEDULED']);
  });

  it('names the two statuses the triggers stamp a date for', () => {
    expect(isMeasured('MEASURED')).toBe(true);
    expect(isMeasured('MEASUREMENT_SCHEDULED')).toBe(false);
    expect(isMeasured(null)).toBe(false);
    expect(isInstalled('INSTALLED')).toBe(true);
    expect(isInstalled('QUALITY_CHECK')).toBe(false);
    expect(isInstalled(null)).toBe(false);
  });

  it('shows the workshop the orders it builds and the ones it sent on', () => {
    expect(WORKSHOP_STATUSES).toEqual(['PRODUCTION', 'QUALITY_CHECK']);
    expect(isInProduction('PRODUCTION')).toBe(true);
    expect(isInProduction('QUALITY_CHECK')).toBe(false);
    expect(isInProduction(null)).toBe(false);
    expect(isSentToInstallation('QUALITY_CHECK')).toBe(true);
    expect(isSentToInstallation('PRODUCTION')).toBe(false);
    expect(isSentToInstallation(null)).toBe(false);
  });

  it('tests membership for a status read from a record', () => {
    expect(isStatusIn(READY_AT_STATUSES, 'INSTALLED')).toBe(true);
    expect(isStatusIn(READY_AT_STATUSES, 'NEW')).toBe(false);
    expect(isStatusIn(READY_AT_STATUSES, 'NOT_A_STATUS')).toBe(false);
    expect(isStatusIn(READY_AT_STATUSES, null)).toBe(false);
  });

  it('uses only statuses that exist as options', () => {
    const values: string[] = ORDER_STATUS_OPTIONS.map(({ value }) => value);

    for (const status of [
      ...RESERVING_STATUSES,
      ...WRITTEN_OFF_STATUSES,
      ...READY_AT_STATUSES,
      ...STATUSES_WITHOUT_DEADLINE,
      ...BOARD_STATUSES,
      ...MEASURER_BOARD_STATUSES,
      ...AWAITING_MEASUREMENT_STATUSES,
      ...WORKSHOP_STATUSES,
    ]) {
      expect(values).toContain(status);
    }
  });
});
