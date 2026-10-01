import { type DeadlineState } from 'src/constants/select-options';

// Once an order is Готов the workshop's deadline no longer applies.
const STATUSES_WITHOUT_DEADLINE = new Set([
  'READY',
  'INSTALLED',
  'CLOSED',
  'CANCELLED',
]);

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
  if (status !== null && STATUSES_WITHOUT_DEADLINE.has(status)) return null;
  if (deadline < today) return 'OVERDUE';
  if (deadline === today) return 'DUE_TODAY';

  return 'ON_TIME';
};
