import {
  type ExpenseCategory,
  expenseCategoryLabel,
  type MoneyEntryKind,
  type Wallet,
} from 'src/constants/select-options';
import { type RecurringRecord, walletLabel } from 'src/money/money-books';
import { parseOptionalMoney } from 'src/prices/prices-screen';
import { formatMoney } from 'src/ui/format';

type Errors = Record<string, string>;

type Built<TData> = { ok: true; data: TData } | { ok: false; errors: Errors };

export type NewMoneyEntry = {
  kind: MoneyEntryKind;
  name: string;
  amount: number;
  wallet: Wallet;
  date: string;
  category: ExpenseCategory | null;
  comment: string | null;
  orderId: string | null;
  workerId: string | null;
  recurringExpenseId: string | null;
  countedAmount: number | null;
};

const ENTRY_DEFAULTS = {
  category: null,
  comment: null,
  orderId: null,
  workerId: null,
  recurringExpenseId: null,
  countedAmount: null,
} as const;

const parseAmount = (raw: string) => {
  const parsed = parseOptionalMoney(raw);

  return parsed.ok && parsed.value !== null && parsed.value > 0
    ? { ok: true as const, value: parsed.value }
    : { ok: false as const, error: 'Введите сумму' };
};

const withComment = (title: string, comment: string | null) =>
  comment === null ? title : `${title}, ${comment}`;

export type RecordDirection = 'EXPENSE' | 'INCOME' | 'OWNER_DRAW';

export const RECORD_DIRECTIONS: { value: RecordDirection; label: string }[] = [
  { value: 'EXPENSE', label: 'Расход' },
  { value: 'INCOME', label: 'Приход' },
  { value: 'OWNER_DRAW', label: 'Взял себе' },
];

export type RecordDraft = {
  direction: RecordDirection;
  amount: string;
  category: ExpenseCategory | '';
  wallet: Wallet;
  date: string;
  comment: string;
  orderId: string;
};

export const emptyRecord = (today: string): RecordDraft => ({
  direction: 'EXPENSE',
  amount: '',
  category: '',
  wallet: 'CASH',
  date: today,
  comment: '',
  orderId: '',
});

// The name is what the ledger shows: «Бензин, Дамас», «Взял себе».
export const buildRecord = (draft: RecordDraft): Built<NewMoneyEntry> => {
  const errors: Errors = {};
  const amount = parseAmount(draft.amount);
  const isExpense = draft.direction === 'EXPENSE';

  if (!amount.ok) errors.amount = amount.error;
  if (isExpense && draft.category === '') errors.category = 'Выберите, на что';
  if (draft.date === '') errors.date = 'Выберите дату';

  if (!amount.ok || Object.keys(errors).length > 0) return { ok: false, errors };

  const comment = draft.comment.trim() || null;
  const category = isExpense && draft.category !== '' ? draft.category : null;
  const title =
    draft.direction === 'EXPENSE'
      ? expenseCategoryLabel(category)
      : draft.direction === 'INCOME'
        ? 'Приход'
        : 'Взял себе';

  return {
    ok: true,
    data: {
      ...ENTRY_DEFAULTS,
      kind: draft.direction,
      name: withComment(title, comment),
      amount: amount.value,
      wallet: draft.wallet,
      date: draft.date,
      category,
      comment,
      orderId: isExpense && draft.orderId !== '' ? draft.orderId : null,
    },
  };
};

export type DifferenceChoice = 'FORGOTTEN' | 'NOT_FOUND';

export type RecountDraft = {
  wallet: Wallet;
  counted: string;
  choice: DifferenceChoice;
  category: ExpenseCategory | '';
  comment: string;
};

export const emptyRecount = (wallet: Wallet = 'CASH'): RecountDraft => ({
  wallet,
  counted: '',
  choice: 'FORGOTTEN',
  category: '',
  comment: '',
});

// What the count differs by; null until a sum is typed.
export const recountDifference = (
  draft: RecountDraft,
  expected: number,
): number | null => {
  const counted = parseOptionalMoney(draft.counted);

  return counted.ok && counted.value !== null ? counted.value - expected : null;
};

// The first count of a wallet sets where it starts. A later one that comes
// up short is either a расход nobody wrote down, recorded as one, or money
// not found, which stays as its own line; either way the records then match
// the count.
export const buildRecount = ({
  draft,
  expected,
  isFirst,
  today,
}: {
  draft: RecountDraft;
  expected: number;
  isFirst: boolean;
  today: string;
}): Built<NewMoneyEntry[]> => {
  const counted = parseOptionalMoney(draft.counted);

  if (!counted.ok || counted.value === null) {
    return { ok: false, errors: { counted: 'Введите, сколько насчитали' } };
  }

  const difference = counted.value - expected;
  const isForgotten = !isFirst && difference < 0 && draft.choice === 'FORGOTTEN';

  if (isForgotten && draft.category === '') {
    return { ok: false, errors: { category: 'Выберите, на что ушли деньги' } };
  }

  const comment = draft.comment.trim() || null;
  const recount: NewMoneyEntry = {
    ...ENTRY_DEFAULTS,
    kind: isFirst ? 'OPENING_BALANCE' : 'COUNT_DIFFERENCE',
    name: isFirst
      ? `Начальный остаток · ${walletLabel(draft.wallet)}`
      : isForgotten
        ? `Пересчёт · ${walletLabel(draft.wallet)}, внесён забытый расход`
        : difference === 0
          ? `Пересчёт · ${walletLabel(draft.wallet)}, сошлось`
          : difference < 0
            ? `Не нашли при пересчёте · ${walletLabel(draft.wallet)}`
            : `Лишние при пересчёте · ${walletLabel(draft.wallet)}`,
    amount: isForgotten ? 0 : difference,
    wallet: draft.wallet,
    date: today,
    comment: isForgotten ? null : comment,
    countedAmount: counted.value,
  };

  if (!isForgotten || draft.category === '') {
    return { ok: true, data: [recount] };
  }

  return {
    ok: true,
    data: [
      {
        ...ENTRY_DEFAULTS,
        kind: 'EXPENSE',
        name: withComment(expenseCategoryLabel(draft.category), comment),
        amount: -difference,
        wallet: draft.wallet,
        date: today,
        category: draft.category,
        comment,
      },
      recount,
    ],
  };
};

export type RecurringDraft = {
  // Null for a new one
  id: string | null;
  name: string;
  amount: string;
  dayOfMonth: string;
  wallet: Wallet;
  category: ExpenseCategory | '';
};

export const emptyRecurring = (): RecurringDraft => ({
  id: null,
  name: '',
  amount: '',
  dayOfMonth: '',
  wallet: 'CASH',
  category: '',
});

export type RecurringEntry = {
  name: string;
  amount: number;
  dayOfMonth: number;
  wallet: Wallet;
  category: ExpenseCategory;
};

export const buildRecurring = (
  draft: RecurringDraft,
): Built<RecurringEntry> => {
  const errors: Errors = {};
  const name = draft.name.trim();
  const amount = parseAmount(draft.amount);
  const day = Number(draft.dayOfMonth.trim());

  if (name === '') errors.name = 'Введите название';
  if (!amount.ok) errors.amount = amount.error;
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    errors.dayOfMonth = 'Введите число от 1 до 31';
  }
  if (draft.category === '') errors.category = 'Выберите, на что';

  if (!amount.ok || draft.category === '' || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      name,
      amount: amount.value,
      dayOfMonth: day,
      wallet: draft.wallet,
      category: draft.category,
    },
  };
};

// «Оплачено»: the month's расход at the usual sum, from the usual wallet.
export const recurringPayment = (
  recurring: RecurringRecord,
  date: string,
  amount = recurring.amount ?? 0,
): NewMoneyEntry => ({
  ...ENTRY_DEFAULTS,
  kind: 'EXPENSE',
  name: recurring.name,
  amount,
  wallet: recurring.wallet ?? 'CASH',
  date,
  category: recurring.category ?? 'OTHER',
  recurringExpenseId: recurring.id,
});

export type PayRecurringDraft = {
  recurringId: string;
  amount: string;
  wallet: Wallet;
  date: string;
};

export const buildRecurringPayment = (
  draft: PayRecurringDraft,
  recurring: RecurringRecord,
): Built<NewMoneyEntry> => {
  const amount = parseAmount(draft.amount);

  if (!amount.ok) return { ok: false, errors: { amount: amount.error } };
  if (draft.date === '') return { ok: false, errors: { date: 'Выберите дату' } };

  return {
    ok: true,
    data: {
      ...recurringPayment(recurring, draft.date, amount.value),
      wallet: draft.wallet,
    },
  };
};

export type HandoverDraft = {
  workerId: string;
  amount: string;
  wallet: Wallet;
  date: string;
};

export const buildHandover = (
  draft: HandoverDraft,
  holders: { workerId: string; name: string; amount: number }[],
): Built<NewMoneyEntry> => {
  const errors: Errors = {};
  const holder = holders.find((item) => item.workerId === draft.workerId);
  const amount = parseAmount(draft.amount);

  if (holder === undefined) errors.worker = 'Выберите, кто сдал';
  if (!amount.ok) errors.amount = amount.error;
  else if (holder !== undefined && amount.value > holder.amount) {
    errors.amount = `У него только ${formatMoney(holder.amount)}`;
  }
  if (draft.date === '') errors.date = 'Выберите дату';

  if (holder === undefined || !amount.ok || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      ...ENTRY_DEFAULTS,
      kind: 'HANDOVER',
      name: `Сдал деньги · ${holder.name}`,
      amount: amount.value,
      wallet: draft.wallet,
      date: draft.date,
      workerId: holder.workerId,
    },
  };
};
