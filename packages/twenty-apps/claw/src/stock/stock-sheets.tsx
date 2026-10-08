import { type ReactNode } from 'react';

import {
  MATERIAL_UNIT_OPTIONS,
  materialUnitLabel,
  type MaterialUnit,
  WALLET_OPTIONS,
  type Wallet,
} from 'src/constants/select-options';
import { type SupplierRecord } from 'src/stock/stock-ledger';
import {
  type DebtPaymentDraft,
  NEW_SUPPLIER,
  type PaymentChoice,
  type PurchaseDraft,
  purchaseDraftTotal,
  STOCK_OUT_CHOICES,
  type StockOutDraft,
} from 'src/stock/stock-forms';
import { type StockMaterial } from 'src/stock/stock-screen';
import { formatMoney, formatQuantity } from 'src/ui/format';
import {
  AmountLine,
  Button,
  Columns,
  Field,
  FilePicker,
  Hint,
  Line,
  SelectInput,
  Sheet,
  Tabs,
  TextInput,
  Wrap,
} from 'src/ui/kit';

type Errors = Record<string, string>;

const UNNAMED = 'Без названия';

const materialOptions = (materials: StockMaterial[]) => [
  { value: '', label: 'Выберите материал' },
  ...materials.map((material) => ({
    value: material.id,
    label: material.name || UNNAMED,
  })),
];

const unitOf = (materials: StockMaterial[], materialId: string) =>
  materials.find((material) => material.id === materialId)?.unitLabel ?? '';

const SaveFooter = ({
  text,
  summary,
  isSaving,
  failure,
  onSave,
}: {
  text: string;
  summary?: string | null;
  isSaving: boolean;
  failure?: ReactNode;
  onSave: () => void;
}) => (
  <>
    {summary ? <AmountLine amount={summary}>Итого</AmountLine> : null}
    <Button variant="primary" isWideOnPhone isBusy={isSaving} onClick={onSave}>
      {text}
    </Button>
    {failure}
  </>
);

const WalletChoice = ({
  value,
  onChange,
}: {
  value: Wallet;
  onChange: (wallet: Wallet) => void;
}) => (
  <Field label="Откуда">
    <Tabs
      value={value}
      options={WALLET_OPTIONS.map(({ value: option, label }) => ({
        value: option,
        label,
      }))}
      onChange={onChange}
    />
  </Field>
);

const PAYMENT_CHOICES: { value: PaymentChoice; label: string }[] = [
  { value: 'ALL', label: 'Оплатил всё' },
  { value: 'PART', label: 'Часть' },
  { value: 'DEBT', label: 'В долг' },
];

export const PurchaseSheet = ({
  draft,
  errors,
  materials,
  suppliers,
  canSeeMoney,
  isSaving,
  failure,
  photoNames,
  newLineKey,
  onChange,
  onPickPhotos,
  onSave,
  onClose,
}: {
  draft: PurchaseDraft;
  errors: Errors;
  materials: StockMaterial[];
  suppliers: SupplierRecord[];
  canSeeMoney: boolean;
  isSaving: boolean;
  failure?: ReactNode;
  photoNames: string[];
  newLineKey: () => string;
  onChange: (draft: PurchaseDraft) => void;
  onPickPhotos: (files: File[]) => void;
  onSave: () => void;
  onClose: () => void;
}) => {
  const total = canSeeMoney ? purchaseDraftTotal(draft) : null;
  const set = (patch: Partial<PurchaseDraft>) =>
    onChange({ ...draft, ...patch });
  const setLine = (
    key: string,
    patch: Partial<PurchaseDraft['lines'][number]>,
  ) =>
    set({
      lines: draft.lines.map((line) =>
        line.key === key ? { ...line, ...patch } : line,
      ),
    });

  return (
    <Sheet
      title="Новый приход"
      isBusy={isSaving}
      onClose={onClose}
      footer={
        <SaveFooter
          text="Записать приход"
          summary={total === null ? null : formatMoney(total)}
          isSaving={isSaving}
          failure={failure}
          onSave={onSave}
        />
      }
    >
      <Columns>
        {[
          <Field key="supplier" label="Поставщик" error={errors.supplier}>
            <SelectInput
              label="Поставщик"
              value={draft.supplierId}
              options={[
                { value: '', label: 'Не указан' },
                ...suppliers.map((supplier) => ({
                  value: supplier.id,
                  label: supplier.name,
                })),
                { value: NEW_SUPPLIER, label: '+ Новый поставщик' },
              ]}
              onChange={(supplierId) => set({ supplierId })}
            />
          </Field>,
          <Field key="date" label="Дата" error={errors.date}>
            <TextInput
              type="date"
              label="Дата"
              value={draft.date}
              onChange={(date) => set({ date })}
              onCancel={onClose}
            />
          </Field>,
        ]}
      </Columns>
      {draft.supplierId === NEW_SUPPLIER ? (
        <Field label="Название поставщика">
          <TextInput
            label="Название поставщика"
            value={draft.newSupplierName}
            onChange={(newSupplierName) => set({ newSupplierName })}
            onCancel={onClose}
          />
        </Field>
      ) : null}
      <Field label="Что купили" error={errors.lines}>
        <div style={{ display: 'grid', gap: 12 }}>
          {draft.lines.map((line, index) => (
            <Line
              key={line.key}
              action={
                draft.lines.length > 1 ? (
                  <Button
                    label={`Убрать строку ${index + 1}`}
                    onClick={() =>
                      set({
                        lines: draft.lines.filter(
                          (other) => other.key !== line.key,
                        ),
                      })
                    }
                  >
                    ×
                  </Button>
                ) : null
              }
            >
              <SelectInput
                label={`Материал ${index + 1}`}
                value={line.materialId}
                options={materialOptions(materials)}
                onChange={(materialId) => setLine(line.key, { materialId })}
              />
              <Columns>
                {[
                  <TextInput
                    key="quantity"
                    label={`Количество ${index + 1}`}
                    inputMode="decimal"
                    placeholder="Сколько"
                    value={line.quantity}
                    suffix={unitOf(materials, line.materialId)}
                    onChange={(quantity) => setLine(line.key, { quantity })}
                    onCancel={onClose}
                  />,
                  ...(canSeeMoney
                    ? [
                        <TextInput
                          key="price"
                          label={`Цена ${index + 1}`}
                          inputMode="numeric"
                          isMoney
                          placeholder="Цена"
                          value={line.price}
                          suffix={`сум за ${unitOf(materials, line.materialId) || 'ед.'}`}
                          onChange={(price) => setLine(line.key, { price })}
                          onCancel={onClose}
                        />,
                      ]
                    : []),
                ]}
              </Columns>
              {errors[line.key] ? (
                <Hint tone="danger" text={errors[line.key]} />
              ) : null}
            </Line>
          ))}
          <Wrap>
            <Button
              onClick={() =>
                set({
                  lines: [
                    ...draft.lines,
                    {
                      key: newLineKey(),
                      materialId: '',
                      quantity: '',
                      price: '',
                    },
                  ],
                })
              }
            >
              + Строка
            </Button>
          </Wrap>
        </div>
      </Field>
      {canSeeMoney ? (
        <>
          <Field label="Оплата">
            <Tabs
              value={draft.payment}
              options={PAYMENT_CHOICES}
              onChange={(payment) => set({ payment })}
            />
          </Field>
          {draft.payment === 'PART' ? (
            <Field label="Сколько заплатили" error={errors.paidAmount}>
              <TextInput
                label="Сколько заплатили"
                inputMode="numeric"
                isMoney
                value={draft.paidAmount}
                suffix="сум"
                onChange={(paidAmount) => set({ paidAmount })}
                onCancel={onClose}
              />
            </Field>
          ) : null}
          {draft.payment === 'DEBT' ? null : (
            <WalletChoice
              value={draft.wallet}
              onChange={(wallet) => set({ wallet })}
            />
          )}
        </>
      ) : null}
      <Field label="Комментарий">
        <TextInput
          label="Комментарий"
          value={draft.comment}
          onChange={(comment) => set({ comment })}
          onCancel={onClose}
        />
      </Field>
      <Wrap>
        <FilePicker
          text={photoNames.length > 0 ? 'Другое фото' : 'Фото накладной'}
          accept="image/*"
          onPick={onPickPhotos}
        />
        {photoNames.length > 0 ? <Hint text={photoNames.join(', ')} /> : null}
      </Wrap>
    </Sheet>
  );
};

export const StockOutSheet = ({
  draft,
  errors,
  materials,
  orders,
  estimate,
  isSaving,
  failure,
  onChange,
  onSave,
  onClose,
}: {
  draft: StockOutDraft;
  errors: Errors;
  materials: StockMaterial[];
  orders: { id: string; name: string }[];
  // «≈ 126,000 сум по средней цене», for the owner
  estimate: string | null;
  isSaving: boolean;
  failure?: ReactNode;
  onChange: (draft: StockOutDraft) => void;
  onSave: () => void;
  onClose: () => void;
}) => {
  const set = (patch: Partial<StockOutDraft>) =>
    onChange({ ...draft, ...patch });
  const material = materials.find((item) => item.id === draft.materialId);

  return (
    <Sheet
      title="Записать расход"
      isBusy={isSaving}
      onClose={onClose}
      footer={
        <SaveFooter
          text="Записать расход"
          summary={estimate}
          isSaving={isSaving}
          failure={failure}
          onSave={onSave}
        />
      }
    >
      <Field label="Куда ушло">
        <Tabs
          value={draft.kind}
          options={STOCK_OUT_CHOICES}
          onChange={(kind) => set({ kind })}
        />
      </Field>
      {draft.kind === 'ORDER_EXTRA' ? (
        <Field label="Заказ" error={errors.order}>
          <SelectInput
            label="Заказ"
            value={draft.orderId}
            options={[
              { value: '', label: 'Выберите заказ' },
              ...orders.map((order) => ({
                value: order.id,
                label: order.name,
              })),
            ]}
            onChange={(orderId) => set({ orderId })}
          />
        </Field>
      ) : null}
      <Columns>
        {[
          <Field key="material" label="Материал" error={errors.material}>
            <SelectInput
              label="Материал"
              value={draft.materialId}
              options={materialOptions(materials)}
              onChange={(materialId) => set({ materialId })}
            />
          </Field>,
          <Field key="quantity" label="Сколько" error={errors.quantity}>
            <TextInput
              label="Сколько"
              inputMode="decimal"
              value={draft.quantity}
              suffix={material?.unitLabel ?? ''}
              onChange={(quantity) => set({ quantity })}
              onEnter={onSave}
              onCancel={onClose}
            />
          </Field>,
        ]}
      </Columns>
      {material ? (
        <Hint
          text={`На складе ${formatQuantity(material.onHand ?? 0, material.unitLabel)}`}
        />
      ) : null}
      <Columns>
        {[
          <Field key="date" label="Дата" error={errors.date}>
            <TextInput
              type="date"
              label="Дата"
              value={draft.date}
              onChange={(date) => set({ date })}
              onCancel={onClose}
            />
          </Field>,
          <Field key="comment" label="Комментарий" error={errors.comment}>
            <TextInput
              label="Комментарий"
              value={draft.comment}
              placeholder={
                draft.kind === 'SCRAP' ? 'Например: погнули при резке' : ''
              }
              onChange={(comment) => set({ comment })}
              onEnter={onSave}
              onCancel={onClose}
            />
          </Field>,
        ]}
      </Columns>
      {draft.kind === 'ORDER_EXTRA' ? (
        <Hint text="По составу решётки материал на заказ списывается сам, когда заказ уходит в цех. Здесь пишут только то, что ушло сверх нормы." />
      ) : null}
    </Sheet>
  );
};

export const DebtPaymentSheet = ({
  draft,
  errors,
  debts,
  isSaving,
  failure,
  onChange,
  onSave,
  onClose,
}: {
  draft: DebtPaymentDraft;
  errors: Errors;
  debts: { id: string; name: string; debt: number }[];
  isSaving: boolean;
  failure?: ReactNode;
  onChange: (draft: DebtPaymentDraft) => void;
  onSave: () => void;
  onClose: () => void;
}) => {
  const set = (patch: Partial<DebtPaymentDraft>) =>
    onChange({ ...draft, ...patch });

  return (
    <Sheet
      title="Отдать долг поставщику"
      isBusy={isSaving}
      onClose={onClose}
      footer={
        <SaveFooter
          text="Отдать"
          isSaving={isSaving}
          failure={failure}
          onSave={onSave}
        />
      }
    >
      <Field label="Поставщик" error={errors.supplier}>
        <SelectInput
          label="Поставщик"
          value={draft.supplierId}
          options={[
            { value: '', label: 'Выберите поставщика' },
            ...debts.map((supplier) => ({
              value: supplier.id,
              label: `${supplier.name}, долг ${formatMoney(supplier.debt)}`,
            })),
          ]}
          onChange={(supplierId) => set({ supplierId })}
        />
      </Field>
      <Field label="Сумма" error={errors.amount}>
        <TextInput
          label="Сумма"
          inputMode="numeric"
          isMoney
          isLarge
          value={draft.amount}
          suffix="сум"
          onChange={(amount) => set({ amount })}
          onEnter={onSave}
          onCancel={onClose}
        />
      </Field>
      <WalletChoice
        value={draft.wallet}
        onChange={(wallet) => set({ wallet })}
      />
      <Columns>
        {[
          <Field key="date" label="Дата" error={errors.date}>
            <TextInput
              type="date"
              label="Дата"
              value={draft.date}
              onChange={(date) => set({ date })}
              onCancel={onClose}
            />
          </Field>,
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

export const RecountSheet = ({
  materials,
  typed,
  errors,
  summary,
  isSaving,
  failure,
  onType,
  onSave,
  onClose,
}: {
  materials: StockMaterial[];
  typed: Record<string, string>;
  errors: Errors;
  summary: string | null;
  isSaving: boolean;
  failure?: ReactNode;
  onType: (materialId: string, value: string) => void;
  onSave: () => void;
  onClose: () => void;
}) => (
  <Sheet
    title="Пересчёт склада"
    isBusy={isSaving}
    onClose={onClose}
    footer={
      <>
        {summary ? <Hint text={summary} /> : null}
        <SaveFooter
          text="Сохранить пересчёт"
          isSaving={isSaving}
          failure={failure}
          onSave={onSave}
        />
      </>
    }
  >
    <Hint text="Впишите, сколько насчитали. Пустые строки не меняются. Если не сходится, разница запишется как недостача или излишек." />
    {materials.map((material) => (
      <Field
        key={material.id}
        isInline
        label={material.name || UNNAMED}
        error={errors[material.id]}
      >
        <TextInput
          label={material.name || UNNAMED}
          inputMode="decimal"
          value={typed[material.id] ?? ''}
          // The unit stands in the field already, so only the number is shown.
          placeholder={formatQuantity(material.onHand ?? 0, '').trim()}
          suffix={material.unitLabel}
          onChange={(value) => onType(material.id, value)}
          onEnter={onSave}
          onCancel={onClose}
        />
      </Field>
    ))}
  </Sheet>
);

export type NewMaterialDraft = {
  name: string;
  unit: MaterialUnit;
  minimumStock: string;
};

export const NewMaterialSheet = ({
  draft,
  errors,
  isSaving,
  failure,
  onChange,
  onSave,
  onClose,
}: {
  draft: NewMaterialDraft;
  errors: Errors;
  isSaving: boolean;
  failure?: ReactNode;
  onChange: (draft: NewMaterialDraft) => void;
  onSave: () => void;
  onClose: () => void;
}) => (
  <Sheet
    title="Новый материал"
    isBusy={isSaving}
    onClose={onClose}
    footer={
      <SaveFooter
        text="Добавить материал"
        isSaving={isSaving}
        failure={failure}
        onSave={onSave}
      />
    }
  >
    <Field label="Название" error={errors.name}>
      <TextInput
        label="Название"
        value={draft.name}
        placeholder="Например: Профиль 40×20"
        onChange={(name) => onChange({ ...draft, name })}
        onEnter={onSave}
        onCancel={onClose}
      />
    </Field>
    <Field label="Единица">
      <Tabs
        value={draft.unit}
        options={MATERIAL_UNIT_OPTIONS.map(({ value, label }) => ({
          value,
          label,
        }))}
        onChange={(unit) => onChange({ ...draft, unit })}
      />
    </Field>
    <Field label="Запас не меньше" error={errors.minimumStock}>
      <TextInput
        label="Запас не меньше"
        inputMode="decimal"
        value={draft.minimumStock}
        suffix={materialUnitLabel(draft.unit)}
        onChange={(minimumStock) => onChange({ ...draft, minimumStock })}
        onEnter={onSave}
        onCancel={onClose}
      />
    </Field>
  </Sheet>
);
