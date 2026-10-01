import {
  type DeadlineState,
  ORDER_STATUS_OPTIONS,
} from 'src/constants/select-options';

// Once an order is Готов the workshop's deadline no longer applies.
export const STATUSES_WITHOUT_DEADLINE: readonly string[] = [
  'READY',
  'INSTALLED',
  'CLOSED',
  'CANCELLED',
];

export const OPEN_STATUSES = ORDER_STATUS_OPTIONS.map(
  ({ value }) => value,
).filter((value) => !STATUSES_WITHOUT_DEADLINE.includes(value));

export const computeDeadlineState = ({
  status,
  deadline,
  today,
}: {
  status: string | null;
  deadline: string | null;
  today: string;
}): DeadlineState | null => {
  if (deadline === null) return null;
  if (status !== null && STATUSES_WITHOUT_DEADLINE.includes(status))
    return null;
  if (deadline < today) return 'OVERDUE';
  if (deadline === today) return 'DUE_TODAY';

  return 'ON_TIME';
};
