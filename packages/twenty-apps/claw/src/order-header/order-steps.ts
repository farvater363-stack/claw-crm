import { BOARD_STATUSES, isInstalled } from 'src/constants/order-status-sets';
import {
  ORDER_MATERIAL_STATE_OPTIONS,
  ORDER_STATUS_OPTIONS,
  type OrderStatus,
  type PaymentMethod,
} from 'src/constants/select-options';
import { parseOptionalMoney } from 'src/prices/prices-screen';
import { formatMoney, formatWhole } from 'src/ui/format';
import { type Tone } from 'src/ui/tokens';

export type StepAsk =
  'MEASURER_AND_DATE' | 'MASTER' | 'INSTALLER_OPTIONAL' | 'INSTALLER' | null;

export type StepAction = {
  label: string;
  nextStatus: OrderStatus | null;
  opensMeasurementForm: boolean;
  ask: StepAsk;
};

// Besides order-status-sets.ts this table is the one place that spells a
// status; other modules take a single status from here.
export const STEP_STATUS = {
  production: 'PRODUCTION',
  sent: 'QUALITY_CHECK',
  installed: 'INSTALLED',
  cancelled: 'CANCELLED',
} as const satisfies Record<string, OrderStatus>;

export const ORDER_STEPS: readonly { status: OrderStatus; label: string }[] =
  BOARD_STATUSES.map((status) => ({
    status,
    label:
      ORDER_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
      status,
  }));

export const nextStepOf = ({
  status,
  hasMaster,
  hasInstaller,
}: {
  status: string | null;
  hasMaster: boolean;
  hasInstaller: boolean;
}): StepAction | null => {
  switch (status) {
    case 'NEW':
      return {
        label: 'Назначить замер',
        nextStatus: 'MEASUREMENT_SCHEDULED',
        opensMeasurementForm: false,
        ask: 'MEASURER_AND_DATE',
      };
    case 'MEASUREMENT_SCHEDULED':
      // The measurement form writes MEASURED itself, with the openings and the price
      return {
        label: 'Замер сделан',
        nextStatus: null,
        opensMeasurementForm: true,
        ask: null,
      };
    case 'MEASURED':
      return {
        label: 'В производство',
        nextStatus: STEP_STATUS.production,
        opensMeasurementForm: false,
        ask: hasMaster ? null : 'MASTER',
      };
    case STEP_STATUS.production:
      return {
        label: 'Отправить на установку',
        nextStatus: STEP_STATUS.sent,
        opensMeasurementForm: false,
        ask: hasInstaller ? null : 'INSTALLER_OPTIONAL',
      };
    case STEP_STATUS.sent:
      return {
        label: 'Установлен',
        nextStatus: STEP_STATUS.installed,
        opensMeasurementForm: false,
        ask: hasInstaller ? null : 'INSTALLER',
      };
    default:
      return null;
  }
};

export const currentStepKey = (status: string | null): OrderStatus | null =>
  ORDER_STEPS.find((step) => step.status === status)?.status ?? null;

export const canCancel = (status: string | null): boolean =>
  status !== STEP_STATUS.cancelled;

export const moneySentence = ({
  total,
  paid,
  balance,
}: {
  total: number | null;
  paid: number | null;
  balance: number | null;
}): string => {
  if (total === null) return 'Цену назовёт менеджер';

  const paidSoFar = paid ?? 0;

  return `Итого ${formatMoney(total)} · оплачено ${formatWhole(paidSoFar)} · остаток ${formatWhole(balance ?? total - paidSoFar)}`;
};

const MATERIAL_TONES: Record<string, Tone> = {
  ENOUGH: 'neutral',
  SHORTAGE: 'danger',
  NO_NORM: 'warning',
};

export const materialSentence = ({
  state,
  note,
}: {
  state: string | null;
  note: string | null;
}): { text: string; tone: Tone } | null => {
  if (state === null) return null;

  const written = note?.trim() ?? '';
  const label =
    ORDER_MATERIAL_STATE_OPTIONS.find((option) => option.value === state)
      ?.label ?? state;

  return {
    text: written !== '' ? written : `Материал: ${label.toLowerCase()}`,
    tone: MATERIAL_TONES[state] ?? 'neutral',
  };
};

export const balanceWarning = ({
  status,
  balance,
}: {
  status: string | null;
  balance: number | null;
}): string | null =>
  isInstalled(status) && balance !== null && balance > 0
    ? `Остаток ${formatMoney(balance)}`
    : null;

export type StepDraft = {
  measurerId: string;
  measurementDate: string;
  masterId: string;
  installerId: string;
};

export type StepWrite = {
  status: OrderStatus;
  measurerId?: string;
  measurementDate?: string;
  masterId?: string;
  installerId?: string;
};

type StepWriteResult =
  { ok: true; data: StepWrite } | { ok: false; error: string };

const refuse = (error: string): StepWriteResult => ({ ok: false, error });

export const buildStepWrite = ({
  nextStatus,
  ask,
  draft,
}: {
  nextStatus: OrderStatus;
  ask: StepAsk;
  draft: StepDraft;
}): StepWriteResult => {
  if (ask === 'MEASURER_AND_DATE') {
    if (draft.measurerId === '') return refuse('Выберите замерщика');

    // The input gives local wall time without a zone
    const date = new Date(draft.measurementDate);

    if (draft.measurementDate === '' || Number.isNaN(date.getTime())) {
      return refuse('Укажите дату и время замера');
    }

    return {
      ok: true,
      data: {
        status: nextStatus,
        measurerId: draft.measurerId,
        measurementDate: date.toISOString(),
      },
    };
  }

  if (ask === 'MASTER') {
    return draft.masterId === ''
      ? refuse('Выберите мастера')
      : { ok: true, data: { status: nextStatus, masterId: draft.masterId } };
  }

  if (ask === 'INSTALLER' && draft.installerId === '') {
    return refuse('Выберите установщика');
  }

  if (
    (ask === 'INSTALLER' || ask === 'INSTALLER_OPTIONAL') &&
    draft.installerId !== ''
  ) {
    return {
      ok: true,
      data: { status: nextStatus, installerId: draft.installerId },
    };
  }

  return { ok: true, data: { status: nextStatus } };
};

export const buildPayment = ({
  amount,
  method,
  comment,
  today,
}: {
  amount: string;
  method: PaymentMethod;
  comment: string;
  today: string;
}):
  | {
      ok: true;
      data: {
        amount: number;
        method: PaymentMethod;
        comment: string;
        paidOn: string;
      };
    }
  | { ok: false; error: string } => {
  const parsed = parseOptionalMoney(amount);

  if (!parsed.ok || parsed.value === null || parsed.value <= 0) {
    return { ok: false, error: 'Введите число больше нуля' };
  }

  return {
    ok: true,
    data: {
      amount: parsed.value,
      method,
      comment: comment.trim(),
      paidOn: today,
    },
  };
};
