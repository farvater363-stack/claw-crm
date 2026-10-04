import {
  isStatusIn,
  STATUSES_WITHOUT_DEADLINE,
} from 'src/constants/order-status-sets';
import { type DeadlineState } from 'src/constants/select-options';

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
  if (isStatusIn(STATUSES_WITHOUT_DEADLINE, status)) return null;
  if (deadline < today) return 'OVERDUE';
  if (deadline === today) return 'DUE_TODAY';

  // An order on time has no state: the board marks only what needs attention.
  return null;
};
