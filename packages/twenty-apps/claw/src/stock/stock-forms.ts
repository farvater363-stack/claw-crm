import { type Wallet } from 'src/constants/select-options';
import { parseOptionalMoney, parsePositiveNumber } from 'src/prices/prices-screen';
import { roundTo } from 'src/pricing/round';
import {
  type PurchaseLineEntry,
  type StockOutEntry,
} from 'src/stock/load-stock-books';
import {
  isManualOut,
  type LedgerMovement,
  type ManualOutKind,
  type PurchaseRecord,
} from 'src/stock/stock-ledger';
import { formatDayMonth, formatMoney, formatWhole } from 'src/ui/format';

const QUANTITY_DECIMALS = 2;
export const NEW_SUPPLIER = 'new';

export type PurchaseLineDraft = {
  key: string;
  // The stored line a changed purchase keeps; none for a line added now
  movementId?: string;
  materialId: string;
  quantity: string;
  price: string;
};

export type PaymentChoice = 'ALL' | 'PART' | 'DEBT';

export type PurchaseDraft = {
  // An existing supplier's id, NEW_SUPPLIER, or '' for none
  supplierId: string;
  newSupplierName: string;
  date: string;
  lines: PurchaseLineDraft[];
  payment: PaymentChoice;
  paidAmount: string;
  wallet: Wallet;
  comment: string;
};

export type PurchaseEntry = {
  date: string;
  supplierId: string | null;
  newSupplierName: string | null;
  comment: string | null;
  lines: PurchaseLineEntry[];
  // Null when nothing is paid now, or for a role that sees no money
  payment: { amount: number; wallet: Wallet } | null;
};

type Errors = Record<string, string>;

const parseQuantity = (raw: string) => {
  const parsed = parsePositiveNumber(raw);
  // Checked after rounding: «0,001» is above zero as typed and nothing as stored.
  const value = parsed.ok ? roundTo(parsed.value, QUANTITY_DECIMALS) : 0;

  return value > 0
    ? { ok: true as const, value }
    : { ok: false as const, error: 'Введите количество больше нуля' };
};

const lineTotal = (line: PurchaseLineDraft): number | null => {
  const quantity = parseQuantity(line.quantity);
  const price = parseOptionalMoney(line.price);

  return quantity.ok && price.ok && price.value !== null
    ? Math.round(quantity.value * price.value)
    : null;
};

// What the lines typed so far add up to; null while none has a price.
export const purchaseDraftTotal = (draft: PurchaseDraft): number | null => {
  const totals = draft.lines.flatMap((line) => {
    const total = lineTotal(line);

    return total === null ? [] : [total];
  });

  return totals.length === 0
    ? null
    : totals.reduce((sum, value) => sum + value, 0);
};

// Lines with nothing typed are skipped; a line with a material and no amount,
// or an amount and no material, is an error under that line.
export const buildPurchaseEntry = (
  draft: PurchaseDraft,
  canSeeMoney: boolean,
): { ok: true; data: PurchaseEntry } | { ok: false; errors: Errors } => {
  const errors: Errors = {};
  const lines: PurchaseLineEntry[] = [];

  for (const line of draft.lines) {
    const isBlank = line.quantity.trim() === '' && line.price.trim() === '';

    if (isBlank) continue;

    if (line.materialId === '') {
      errors[line.key] = 'Выберите материал';
      continue;
    }

    const quantity = parseQuantity(line.quantity);
    const price = canSeeMoney
      ? parseOptionalMoney(line.price)
      : { ok: true as const, value: null };

    if (!quantity.ok) errors[line.key] = quantity.error;
    else if (!price.ok) errors[line.key] = price.error;
    else {
      lines.push({
        key: line.key,
        materialId: line.materialId,
        quantity: quantity.value,
        unitPrice: price.value,
        ...(line.movementId === undefined
          ? {}
          : { movementId: line.movementId }),
      });
    }
  }

  if (lines.length === 0 && Object.keys(errors).length === 0) {
    errors.lines = 'Добавьте хотя бы один материал';
  }

  const newSupplierName = draft.newSupplierName.trim();

  if (draft.supplierId === NEW_SUPPLIER && newSupplierName === '') {
    errors.supplier = 'Введите название поставщика';
  }

  if (draft.date === '') errors.date = 'Выберите дату';

  const total = lines.reduce(
    (sum, line) => sum + Math.round(line.quantity * (line.unitPrice ?? 0)),
    0,
  );
  let payment: PurchaseEntry['payment'] = null;

  if (canSeeMoney && draft.payment === 'ALL' && total > 0) {
    payment = { amount: total, wallet: draft.wallet };
  }

  if (canSeeMoney && draft.payment === 'PART') {
    const paid = parseOptionalMoney(draft.paidAmount);

    if (!paid.ok || paid.value === null || paid.value <= 0) {
      errors.paidAmount = 'Введите, сколько заплатили';
    } else if (paid.value > total) {
      errors.paidAmount = `Больше суммы прихода (${formatMoney(total)})`;
    } else {
      payment = { amount: paid.value, wallet: draft.wallet };
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      date: draft.date,
      supplierId:
        draft.supplierId === '' || draft.supplierId === NEW_SUPPLIER
          ? null
          : draft.supplierId,
      newSupplierName:
        draft.supplierId === NEW_SUPPLIER ? newSupplierName : null,
      comment: draft.comment.trim() || null,
      lines,
      payment,
    },
  };
};

export const purchaseName = (date: string, supplierName: string | null) =>
  [`Приход ${formatDayMonth(date)}`, ...(supplierName ? [supplierName] : [])].join(
    ' · ',
  );

export type StockOutDraft = {
  kind: ManualOutKind;
  orderId: string;
  materialId: string;
  quantity: string;
  date: string;
  comment: string;
};

export const STOCK_OUT_CHOICES: { value: ManualOutKind; label: string }[] = [
  { value: 'ORDER_EXTRA', label: 'На заказ' },
  { value: 'SCRAP', label: 'Брак' },
  { value: 'WASTE', label: 'Отходы' },
  { value: 'WORKSHOP_USE', label: 'Для цеха' },
  { value: 'SUPPLIER_RETURN', label: 'Вернул поставщику' },
  { value: 'OTHER_OUT', label: 'Другое' },
];

export const buildStockOut = (
  draft: StockOutDraft,
  onHand: number | null,
): { ok: true; data: StockOutEntry } | { ok: false; errors: Errors } => {
  const errors: Errors = {};
  const quantity = parseQuantity(draft.quantity);

  if (draft.materialId === '') errors.material = 'Выберите материал';
  if (!quantity.ok) errors.quantity = quantity.error;
  else if (onHand !== null && quantity.value > Math.max(onHand, 0)) {
    errors.quantity = 'Больше, чем есть на складе';
  }
  if (draft.kind === 'ORDER_EXTRA' && draft.orderId === '') {
    errors.order = 'Выберите заказ';
  }
  if (draft.kind === 'OTHER_OUT' && draft.comment.trim() === '') {
    errors.comment = 'Напишите, куда ушло';
  }
  if (draft.date === '') errors.date = 'Выберите дату';

  if (Object.keys(errors).length > 0 || !quantity.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      kind: draft.kind,
      materialId: draft.materialId,
      quantity: quantity.value,
      date: draft.date,
      orderId: draft.kind === 'ORDER_EXTRA' ? draft.orderId : null,
      comment: draft.comment.trim() || null,
    },
  };
};

export type DebtPaymentDraft = {
  supplierId: string;
  amount: string;
  wallet: Wallet;
  date: string;
  comment: string;
};

export const buildDebtPayment = (
  draft: DebtPaymentDraft,
  debt: number,
):
  | {
      ok: true;
      data: {
        supplierId: string;
        amount: number;
        wallet: Wallet;
        date: string;
        comment: string | null;
      };
    }
  | { ok: false; errors: Errors } => {
  const errors: Errors = {};
  const amount = parseOptionalMoney(draft.amount);

  if (draft.supplierId === '') errors.supplier = 'Выберите поставщика';
  if (!amount.ok || amount.value === null || amount.value <= 0) {
    errors.amount = 'Введите сумму';
  } else if (amount.value > debt) {
    errors.amount = `Долг только ${formatMoney(debt)}`;
  }
  if (draft.date === '') errors.date = 'Выберите дату';

  if (Object.keys(errors).length > 0 || !amount.ok || amount.value === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      supplierId: draft.supplierId,
      amount: amount.value,
      wallet: draft.wallet,
      date: draft.date,
      comment: draft.comment.trim() || null,
    },
  };
};

const typedQuantity = (value: number) => String(value).replace('.', ',');

// A stored purchase as its form: payment is not part of it, a payment made
// or a debt paid is changed in «Деньги».
export const purchaseEditDraft = (
  purchase: PurchaseRecord,
  movements: LedgerMovement[],
  newLineKey: () => string,
): PurchaseDraft => ({
  supplierId: purchase.supplierId ?? '',
  newSupplierName: '',
  date: purchase.date ?? purchase.createdAt.slice(0, 10),
  lines: movements
    .filter(
      (movement) =>
        movement.purchaseId === purchase.id && movement.kind === 'RECEIPT',
    )
    .map((movement) => ({
      key: newLineKey(),
      movementId: movement.id,
      materialId: movement.materialId ?? '',
      quantity: typedQuantity(movement.quantity ?? 0),
      price: movement.unitPrice === null ? '' : formatWhole(movement.unitPrice),
    })),
  payment: 'DEBT',
  paidAmount: '',
  wallet: 'CASH',
  comment: purchase.comment ?? '',
});

// Null for a movement this form does not write: a write-off by the
// composition, a recount or a purchase line.
export const stockOutEditDraft = (
  movement: LedgerMovement,
): StockOutDraft | null =>
  isManualOut(movement.kind) && movement.materialId !== null
    ? {
        kind: movement.kind,
        orderId: movement.orderId ?? '',
        materialId: movement.materialId,
        quantity: typedQuantity(-(movement.quantity ?? 0)),
        date: movement.date ?? movement.createdAt.slice(0, 10),
        comment: movement.comment ?? '',
      }
    : null;
