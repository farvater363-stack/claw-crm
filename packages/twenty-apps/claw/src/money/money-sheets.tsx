import { type ReactNode } from 'react';

import {
  EXPENSE_CATEGORY_OPTIONS,
  WALLET_OPTIONS,
  type Wallet,
} from 'src/constants/select-options';
import { type CashHolder } from 'src/money/money-books';
import {
  type DifferenceChoice,
  type EntrySumDraft,
  type HandoverDraft,
  type PayRecurringDraft,
  RECORD_DIRECTIONS,
  type RecordDraft,
  type RecountDraft,
  recountDifference,
  type RecurringDraft,
} from 'src/money/money-forms';
import { ChipGrid, MutedNote, signed } from 'src/money/money-views';
import { formatMoney, formatWhole } from 'src/ui/format';
import {
  AmountLine,
  Button,
  Columns,
  DeleteAction,
  Field,
  FilePicker,
  Hint,
  Link,
  SelectInput,
  Sheet,
  TabStrip,
  TextInput,
} from 'src/ui/kit';

type Errors = Record<string, string>;

const WALLETS = WALLET_OPTIONS.map(({ value, label }) => ({ value, label }));

const SaveFooter = ({
  text,
  isSaving,
  failure,
  note,
  extra,
  onSave,
}: {
  text: string;
  isSaving: boolean;
  failure?: ReactNode;
  note?: string;
  extra?: ReactNode;
  onSave: () => void;
}) => (
  <>
    <Button variant="primary" isWideOnPhone isBusy={isSaving} onClick={onSave}>
      {text}
    </Button>
    {extra}
    {failure}
    {note ? <MutedNote text={note} /> : null}
  </>
);

const WalletField = ({
  label = 'Откуда',
  value,
  onChange,
}: {
  label?: string;
  value: Wallet;
  onChange: (wallet: Wallet) => void;
}) => (
  <Field label={label}>
    <TabStrip value={value} options={WALLETS} onChange={onChange} />
  </Field>
);

const MoneyField = ({
  label,
  value,
  error,
  onChange,
  onEnter,
  onCancel,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  onCancel: () => void;
}) => (
  <Field label={label} error={error}>
    <TextInput
      label={label}
      inputMode="numeric"
      isMoney
      isLarge
      value={value}
      suffix="сум"
      onChange={onChange}
      onEnter={onEnter}
      onCancel={onCancel}
    />
  </Field>
);

const DateField = ({
  value,
  error,
  onChange,
  onCancel,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onCancel: () => void;
}) => (
  <Field label="Дата" error={error}>
    <TextInput
      type="date"
      label="Дата"
      value={value}
      onChange={onChange}
      onCancel={onCancel}
    />
  </Field>
);

const CategoryField = ({
  value,
  error,
  onChange,
}: {
  value: RecordDraft['category'];
  error?: string;
  onChange: (value: RecordDraft['category']) => void;
}) => (
  <Field label="На что" error={error}>
    <ChipGrid
      value={value}
      options={EXPENSE_CATEGORY_OPTIONS}
      onChange={onChange}
    />
  </Field>
);

const DeleteEntry = ({
  isBusy,
  onDelete,
}: {
  isBusy: boolean;
  onDelete: () => void;
}) => (
  <DeleteAction
    text="Удалить запись"
    question="Удалить эту запись? Суммы в кассе пересчитаются."
    isBusy={isBusy}
    onConfirm={onDelete}
  />
);

export const RecordSheet = ({
  draft,
  errors,
  orders,
  photoNames,
  isSaving,
  failure,
  onChange,
  onPickPhotos,
  onSave,
  onDelete,
  isDeleting = false,
  onClose,
}: {
  draft: RecordDraft;
  errors: Errors;
  orders: { id: string; name: string }[];
  photoNames: string[];
  isSaving: boolean;
  failure?: ReactNode;
  onChange: (draft: RecordDraft) => void;
  onPickPhotos: (files: File[]) => void;
  onSave: () => void;
  // Only for an entry already written, which the form then changes
  onDelete?: () => void;
  isDeleting?: boolean;
  onClose: () => void;
}) => {
  const set = (patch: Partial<RecordDraft>) => onChange({ ...draft, ...patch });
  const isExpense = draft.direction === 'EXPENSE';
  const isEdit = onDelete !== undefined;

  return (
    <Sheet
      title={isEdit ? 'Изменить запись' : 'Записать'}
      isBusy={isSaving || isDeleting}
      onClose={onClose}
      footer={
        <SaveFooter
          text={isEdit ? 'Сохранить' : 'Записать'}
          isSaving={isSaving}
          failure={failure}
          note={
            isEdit
              ? undefined
              : 'Оплаты клиентов, ЗП и покупки на склад сюда вносить не надо, они уже есть.'
          }
          extra={
            onDelete ? (
              <DeleteEntry isBusy={isDeleting} onDelete={onDelete} />
            ) : null
          }
          onSave={onSave}
        />
      }
    >
      <TabStrip
        value={draft.direction}
        options={RECORD_DIRECTIONS}
        onChange={(direction) => set({ direction })}
      />
      <MoneyField
        label="Сумма, сум"
        value={draft.amount}
        error={errors.amount}
        onChange={(amount) => set({ amount })}
        onEnter={onSave}
        onCancel={onClose}
      />
      {isExpense ? (
        <CategoryField
          value={draft.category}
          error={errors.category}
          onChange={(category) => set({ category })}
        />
      ) : null}
      <WalletField
        label={isExpense || draft.direction === 'OWNER_DRAW' ? 'Откуда' : 'Куда'}
        value={draft.wallet}
        onChange={(wallet) => set({ wallet })}
      />
      <Columns>
        {[
          <DateField
            key="date"
            value={draft.date}
            error={errors.date}
            onChange={(date) => set({ date })}
            onCancel={onClose}
          />,
          <Field key="comment" label="Комментарий">
            <TextInput
              label="Комментарий"
              value={draft.comment}
              onChange={(comment) => set({ comment })}
              onEnter={onSave}
              onCancel={onClose}
            />
          </Field>,
        ]}
      </Columns>
      {isExpense ? (
        <Field label="Заказ (если расход на заказ)">
          <SelectInput
            label="Заказ"
            value={draft.orderId}
            options={[
              { value: '', label: 'Не на заказ' },
              ...orders.map((order) => ({ value: order.id, label: order.name })),
            ]}
            onChange={(orderId) => set({ orderId })}
          />
        </Field>
      ) : null}
      {isEdit ? null : (
        <Field label="Фото чека">
          <FilePicker
            text={
              photoNames.length > 0
                ? `Фото: ${photoNames.join(', ')}`
                : 'Добавить фото'
            }
            accept="image/*"
            onPick={onPickPhotos}
          />
        </Field>
      )}
    </Sheet>
  );
};

// An entry that is not typed in «Записать»: its sum, wallet, date and comment
// change, or, for a recount line, it is only taken back.
export const EntrySheet = ({
  title,
  note,
  draft,
  errors,
  isSaving,
  isDeleting,
  failure,
  onChange,
  onSave,
  onDelete,
  onClose,
}: {
  title: string;
  note?: string;
  // Null for an entry that can only be deleted
  draft: EntrySumDraft | null;
  errors: Errors;
  isSaving: boolean;
  isDeleting: boolean;
  failure?: ReactNode;
  onChange: (draft: EntrySumDraft) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) => {
  const deleteEntry = <DeleteEntry isBusy={isDeleting} onDelete={onDelete} />;

  if (draft === null) {
    return (
      <Sheet
        title={title}
        isBusy={isDeleting}
        onClose={onClose}
        footer={
          <>
            {deleteEntry}
            {failure}
          </>
        }
      >
        {note ? <MutedNote text={note} /> : null}
      </Sheet>
    );
  }

  const set = (patch: Partial<EntrySumDraft>) =>
    onChange({ ...draft, ...patch });

  return (
    <Sheet
      title={title}
      isBusy={isSaving || isDeleting}
      onClose={onClose}
      footer={
        <SaveFooter
          text="Сохранить"
          isSaving={isSaving}
          failure={failure}
          extra={deleteEntry}
          onSave={onSave}
        />
      }
    >
      {note ? <MutedNote text={note} /> : null}
      <MoneyField
        label="Сумма, сум"
        value={draft.amount}
        error={errors.amount}
        onChange={(amount) => set({ amount })}
        onEnter={onSave}
        onCancel={onClose}
      />
      <WalletField
        label="Кошелёк"
        value={draft.wallet}
        onChange={(wallet) => set({ wallet })}
      />
      <Columns>
        {[
          <DateField
            key="date"
            value={draft.date}
            error={errors.date}
            onChange={(date) => set({ date })}
            onCancel={onClose}
          />,
          <Field key="comment" label="Комментарий">
            <TextInput
              label="Комментарий"
              value={draft.comment}
              onChange={(comment) => set({ comment })}
              onEnter={onSave}
              onCancel={onClose}
            />
          </Field>,
        ]}
      </Columns>
    </Sheet>
  );
};

// A client payment or a payout is changed where it was entered.
export const ElsewhereSheet = ({
  title,
  text,
  link,
  onClose,
}: {
  title: string;
  text: string;
  link: { href: string; text: string } | null;
  onClose: () => void;
}) => (
  <Sheet title={title} onClose={onClose}>
    <MutedNote text={text} />
    {link ? (
      <Link href={link.href}>
        {link.text} <span aria-hidden>›</span>
      </Link>
    ) : null}
  </Sheet>
);

const DIFFERENCE_CHOICES: { value: DifferenceChoice; label: string }[] = [
  { value: 'FORGOTTEN', label: 'Внести забытый расход' },
  { value: 'NOT_FOUND', label: 'Не нашли' },
];

export const RecountSheet = ({
  draft,
  errors,
  expected,
  isFirst,
  isSaving,
  failure,
  onChange,
  onSave,
  onClose,
}: {
  draft: RecountDraft;
  errors: Errors;
  expected: number;
  isFirst: boolean;
  isSaving: boolean;
  failure?: ReactNode;
  onChange: (draft: RecountDraft) => void;
  onSave: () => void;
  onClose: () => void;
}) => {
  const set = (patch: Partial<RecountDraft>) => onChange({ ...draft, ...patch });
  const difference = recountDifference(draft, expected);

  return (
    <Sheet
      title="Пересчёт кассы"
      isBusy={isSaving}
      onClose={onClose}
      footer={
        <SaveFooter
          text="Сохранить пересчёт"
          isSaving={isSaving}
          failure={failure}
          onSave={onSave}
        />
      }
    >
      <MutedNote
        text={
          isFirst
            ? 'Посчитайте, сколько сейчас есть. Это станет начальным остатком, дальше приложение считает само.'
            : 'Посчитайте деньги. Если не сходится, разница запишется отдельной строкой.'
        }
      />
      <WalletField
        label="Что считаем"
        value={draft.wallet}
        onChange={(wallet) => set({ wallet })}
      />
      <AmountLine amount={formatMoney(expected)}>
        По записям должно быть
      </AmountLine>
      <MoneyField
        label="Насчитали, сум"
        value={draft.counted}
        error={errors.counted}
        onChange={(counted) => set({ counted })}
        onEnter={onSave}
        onCancel={onClose}
      />
      {difference === null ? null : (
        <AmountLine amount={signed(difference)} isTotal>
          {isFirst ? 'Начальный остаток меняется на' : 'Разница'}
        </AmountLine>
      )}
      {!isFirst && difference !== null && difference < 0 ? (
        <>
          <Field label="Что делать с разницей">
            <TabStrip
              value={draft.choice}
              options={DIFFERENCE_CHOICES}
              onChange={(choice) => set({ choice })}
            />
          </Field>
          {draft.choice === 'FORGOTTEN' ? (
            <>
              <CategoryField
                value={draft.category}
                error={errors.category}
                onChange={(category) => set({ category })}
              />
              <Field label="Комментарий">
                <TextInput
                  label="Комментарий"
                  value={draft.comment}
                  onChange={(comment) => set({ comment })}
                  onEnter={onSave}
                  onCancel={onClose}
                />
              </Field>
            </>
          ) : (
            <Hint
              text={`${formatWhole(-difference)} запишется как «Не нашли» и будет видно, сколько денег потерялось.`}
            />
          )}
        </>
      ) : null}
    </Sheet>
  );
};

export const RecurringSheet = ({
  draft,
  errors,
  isSaving,
  failure,
  onChange,
  onSave,
  onStop,
  onClose,
}: {
  draft: RecurringDraft;
  errors: Errors;
  isSaving: boolean;
  failure?: ReactNode;
  onChange: (draft: RecurringDraft) => void;
  onSave: () => void;
  // Only for one already saved
  onStop?: () => void;
  onClose: () => void;
}) => {
  const set = (patch: Partial<RecurringDraft>) =>
    onChange({ ...draft, ...patch });

  return (
    <Sheet
      title="Постоянный расход"
      isBusy={isSaving}
      onClose={onClose}
      footer={
        <SaveFooter
          text={draft.id === null ? 'Добавить' : 'Сохранить'}
          isSaving={isSaving}
          failure={failure}
          extra={
            onStop ? (
              <Button variant="link" onClick={onStop}>
                Больше не платим
              </Button>
            ) : null
          }
          onSave={onSave}
        />
      }
    >
      <Field label="Название" error={errors.name}>
        <TextInput
          label="Название"
          value={draft.name}
          placeholder="Например, аренда цеха"
          onChange={(name) => set({ name })}
          onEnter={onSave}
          onCancel={onClose}
        />
      </Field>
      <MoneyField
        label="Сумма в месяц, сум"
        value={draft.amount}
        error={errors.amount}
        onChange={(amount) => set({ amount })}
        onEnter={onSave}
        onCancel={onClose}
      />
      <Field label="Какого числа" error={errors.dayOfMonth}>
        <TextInput
          label="Какого числа"
          inputMode="numeric"
          value={draft.dayOfMonth}
          onChange={(dayOfMonth) => set({ dayOfMonth })}
          onEnter={onSave}
          onCancel={onClose}
        />
      </Field>
      <WalletField
        value={draft.wallet}
        onChange={(wallet) => set({ wallet })}
      />
      <CategoryField
        value={draft.category}
        error={errors.category}
        onChange={(category) => set({ category })}
      />
    </Sheet>
  );
};

export const PayRecurringSheet = ({
  title,
  draft,
  errors,
  isSaving,
  failure,
  onChange,
  onSave,
  onClose,
}: {
  title: string;
  draft: PayRecurringDraft;
  errors: Errors;
  isSaving: boolean;
  failure?: ReactNode;
  onChange: (draft: PayRecurringDraft) => void;
  onSave: () => void;
  onClose: () => void;
}) => {
  const set = (patch: Partial<PayRecurringDraft>) =>
    onChange({ ...draft, ...patch });

  return (
    <Sheet
      title={title}
      isBusy={isSaving}
      onClose={onClose}
      footer={
        <SaveFooter
          text="Оплачено"
          isSaving={isSaving}
          failure={failure}
          onSave={onSave}
        />
      }
    >
      <MoneyField
        label="Сумма, сум"
        value={draft.amount}
        error={errors.amount}
        onChange={(amount) => set({ amount })}
        onEnter={onSave}
        onCancel={onClose}
      />
      <WalletField
        value={draft.wallet}
        onChange={(wallet) => set({ wallet })}
      />
      <DateField
        value={draft.date}
        error={errors.date}
        onChange={(date) => set({ date })}
        onCancel={onClose}
      />
    </Sheet>
  );
};

export const HandoverSheet = ({
  draft,
  errors,
  holders,
  isSaving,
  failure,
  onChange,
  onSave,
  onClose,
}: {
  draft: HandoverDraft;
  errors: Errors;
  holders: CashHolder[];
  isSaving: boolean;
  failure?: ReactNode;
  onChange: (draft: HandoverDraft) => void;
  onSave: () => void;
  onClose: () => void;
}) => {
  const set = (patch: Partial<HandoverDraft>) =>
    onChange({ ...draft, ...patch });

  return (
    <Sheet
      title="Сдал деньги"
      isBusy={isSaving}
      onClose={onClose}
      footer={
        <SaveFooter
          text="Сдал"
          isSaving={isSaving}
          failure={failure}
          onSave={onSave}
        />
      }
    >
      <Field label="Кто сдал" error={errors.worker}>
        <SelectInput
          label="Кто сдал"
          value={draft.workerId}
          options={[
            { value: '', label: 'Выберите работника' },
            ...holders.map((holder) => ({
              value: holder.workerId,
              label: `${holder.name}, у него ${formatMoney(holder.amount)}`,
            })),
          ]}
          onChange={(workerId) => set({ workerId })}
        />
      </Field>
      <MoneyField
        label="Сумма, сум"
        value={draft.amount}
        error={errors.amount}
        onChange={(amount) => set({ amount })}
        onEnter={onSave}
        onCancel={onClose}
      />
      <WalletField
        label="Куда"
        value={draft.wallet}
        onChange={(wallet) => set({ wallet })}
      />
      <DateField
        value={draft.date}
        error={errors.date}
        onChange={(date) => set({ date })}
        onCancel={onClose}
      />
    </Sheet>
  );
};
