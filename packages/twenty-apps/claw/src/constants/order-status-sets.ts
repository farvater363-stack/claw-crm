import {
  ORDER_STATUS_OPTIONS,
  type OrderStatus,
} from 'src/constants/select-options';

// The only file that names a status in logic. Everything else imports from here,
// so a change of the order's path is made in one place.

export const RESERVING_STATUSES: readonly OrderStatus[] = ['MEASURED'];

export const WRITTEN_OFF_STATUSES: readonly OrderStatus[] = [
  'PRODUCTION',
  'QUALITY_CHECK',
  'INSTALLED',
];

export const READY_AT_STATUSES: readonly OrderStatus[] = [
  'QUALITY_CHECK',
  'INSTALLED',
];

export const STATUSES_WITHOUT_DEADLINE: readonly OrderStatus[] = [
  'QUALITY_CHECK',
  'INSTALLED',
  'CANCELLED',
];

export const BOARD_STATUSES: readonly OrderStatus[] = [
  'NEW',
  'MEASUREMENT_SCHEDULED',
  'MEASURED',
  'PRODUCTION',
  'QUALITY_CHECK',
  'INSTALLED',
];

export const MEASURER_BOARD_STATUSES: readonly OrderStatus[] = [
  'MEASUREMENT_SCHEDULED',
  'MEASURED',
];

export const AWAITING_MEASUREMENT_STATUSES: readonly OrderStatus[] = [
  'MEASUREMENT_SCHEDULED',
];

// Orders that hold reserved or freshly written-off material. An installed
// order is settled and is left out, so the nightly resync stays small.
export const STATUSES_HOLDING_MATERIAL: readonly OrderStatus[] = [
  'MEASURED',
  'PRODUCTION',
  'QUALITY_CHECK',
];

// A status read from a record is a plain string, and it may be empty.
export const isStatusIn = (
  statuses: readonly OrderStatus[],
  status: string | null,
): boolean => statuses.some((candidate) => candidate === status);

export const OPEN_STATUSES = ORDER_STATUS_OPTIONS.map(
  ({ value }) => value,
).filter((value) => !isStatusIn(STATUSES_WITHOUT_DEADLINE, value));

export const isReserving = (status: string | null): boolean =>
  isStatusIn(RESERVING_STATUSES, status);

export const isWrittenOff = (status: string | null): boolean =>
  isStatusIn(WRITTEN_OFF_STATUSES, status);

export const isMeasured = (status: string | null): boolean =>
  status === 'MEASURED';

export const isInstalled = (status: string | null): boolean =>
  status === 'INSTALLED';
