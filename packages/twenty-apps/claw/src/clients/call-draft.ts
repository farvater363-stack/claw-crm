import { type CallBack, callBackAfterCall } from 'src/clients/client-summary';
import {
  CALL_BACK_REASON_OPTIONS,
  CALL_RESULT_OPTIONS,
  type CallResult,
} from 'src/constants/select-options';
import { addDays } from 'src/pricing/dates';
import { formatDayMonth } from 'src/ui/format';

export type CallDraft = {
  result: CallResult | null;
  note: string;
  nextCallAt: string;
};

export const EMPTY_CALL_DRAFT: CallDraft = {
  result: null,
  note: '',
  nextCallAt: '',
};

// The days the form offers in one tap; any other is typed.
export const NEXT_CALL_CHOICES = [
  { days: 1, label: 'Завтра' },
  { days: 3, label: 'Через 3 дня' },
  { days: 7, label: 'Через неделю' },
  { days: 30, label: 'Через месяц' },
] as const;

export const nextCallDay = (today: string, days: number): string =>
  addDays(today, days);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const checkCallDraft = (
  draft: CallDraft,
  today: string,
): string | null => {
  if (draft.result === null) return 'Выберите, чем закончился звонок';

  if (draft.nextCallAt !== '' && !ISO_DAY.test(draft.nextCallAt)) {
    return 'Дата не распознана. Выберите её в календаре';
  }

  if (draft.nextCallAt !== '' && draft.nextCallAt < today) {
    return 'Дата уже прошла. Выберите сегодня или позже';
  }

  return null;
};

export const callName = (today: string): string =>
  `Звонок ${formatDayMonth(today)}`;

export type CallInput = {
  id: string;
  name: string;
  personId: string;
  orderId: string | null;
  result: CallResult;
  note: string | null;
  nextCallAt: string | null;
};

export const buildCallInput = ({
  id,
  personId,
  orderId,
  draft,
  today,
}: {
  id: string;
  personId: string;
  orderId: string | null;
  draft: CallDraft & { result: CallResult };
  today: string;
}): CallInput => ({
  id,
  name: callName(today),
  personId,
  orderId,
  result: draft.result,
  note: draft.note.trim() === '' ? null : draft.note.trim(),
  nextCallAt: draft.nextCallAt === '' ? null : draft.nextCallAt,
});

// What the screen shows at once; the trigger writes the same a moment later.
export const callBackAfterDraft = (draft: CallDraft): CallBack =>
  callBackAfterCall({
    result: draft.result,
    nextCallAt: draft.nextCallAt === '' ? null : draft.nextCallAt,
  });

export const callResultLabel = (value: string | null): string | null =>
  CALL_RESULT_OPTIONS.find((option) => option.value === value)?.label ?? null;

export const callBackReasonLabel = (value: string | null): string | null =>
  CALL_BACK_REASON_OPTIONS.find((option) => option.value === value)?.label ??
  null;
