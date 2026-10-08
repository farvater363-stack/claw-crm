import { describe, expect, it } from 'vitest';

import {
  buildDebtPayment,
  buildPurchaseEntry,
  buildStockOut,
  NEW_SUPPLIER,
  type PurchaseDraft,
  purchaseDraftTotal,
  purchaseName,
  type StockOutDraft,
} from 'src/stock/stock-forms';

const draft = (overrides: Partial<PurchaseDraft> = {}): PurchaseDraft => ({
  supplierId: 'metal',
  newSupplierName: '',
  date: '2026-10-08',
  lines: [
    { key: 'a', materialId: 'profile', quantity: '90', price: '22,000' },
    { key: 'b', materialId: 'paint', quantity: '20', price: '38 000' },
  ],
  payment: 'ALL',
  paidAmount: '',
  wallet: 'CASH',
  comment: '',
  ...overrides,
});

describe('buildPurchaseEntry', () => {
  it('pays the whole sum by default', () => {
    expect(buildPurchaseEntry(draft(), true)).toEqual({
      ok: true,
      data: {
        date: '2026-10-08',
        supplierId: 'metal',
        newSupplierName: null,
        comment: null,
        lines: [
          { materialId: 'profile', quantity: 90, unitPrice: 22_000 },
          { materialId: 'paint', quantity: 20, unitPrice: 38_000 },
        ],
        payment: { amount: 2_740_000, wallet: 'CASH' },
      },
    });
    expect(purchaseDraftTotal(draft())).toBe(2_740_000);
  });

  it('records a part payment and refuses one above the sum', () => {
    const part = buildPurchaseEntry(
      draft({ payment: 'PART', paidAmount: '1,000,000', wallet: 'CARD' }),
      true,
    );

    expect(part.ok && part.data.payment).toEqual({
      amount: 1_000_000,
      wallet: 'CARD',
    });
    expect(
      buildPurchaseEntry(
        draft({ payment: 'PART', paidAmount: '3,000,000' }),
        true,
      ),
    ).toEqual({
      ok: false,
      errors: { paidAmount: 'Больше суммы прихода (2,740,000 сум)' },
    });
  });

  it('pays nothing when bought on credit', () => {
    const credit = buildPurchaseEntry(draft({ payment: 'DEBT' }), true);

    expect(credit.ok && credit.data.payment).toBeNull();
  });

  it('keeps prices and payment out for a role that sees no money', () => {
    const entry = buildPurchaseEntry(draft(), false);

    expect(entry.ok && entry.data.lines[0].unitPrice).toBeNull();
    expect(entry.ok && entry.data.payment).toBeNull();
  });

  it('skips blank lines and names the line that is wrong', () => {
    expect(
      buildPurchaseEntry(
        draft({
          lines: [
            { key: 'a', materialId: 'profile', quantity: '0', price: '' },
            { key: 'b', materialId: '', quantity: '', price: '' },
            { key: 'c', materialId: '', quantity: '5', price: '' },
          ],
        }),
        true,
      ),
    ).toEqual({
      ok: false,
      errors: {
        a: 'Введите количество больше нуля',
        c: 'Выберите материал',
      },
    });
  });

  it('asks for a material and a new supplier name', () => {
    expect(
      buildPurchaseEntry(
        draft({
          supplierId: NEW_SUPPLIER,
          lines: [{ key: 'a', materialId: '', quantity: '', price: '' }],
        }),
        true,
      ),
    ).toEqual({
      ok: false,
      errors: {
        lines: 'Добавьте хотя бы один материал',
        supplier: 'Введите название поставщика',
      },
    });
  });

  it('names a purchase by its day and supplier', () => {
    expect(purchaseName('2026-10-08', 'Ташкент Металл')).toBe(
      'Приход 8 октября · Ташкент Металл',
    );
    expect(purchaseName('2026-10-08', null)).toBe('Приход 8 октября');
  });
});

const outDraft = (overrides: Partial<StockOutDraft> = {}): StockOutDraft => ({
  kind: 'SCRAP',
  orderId: '',
  materialId: 'profile',
  quantity: '6',
  date: '2026-10-06',
  comment: 'погнули при резке',
  ...overrides,
});

describe('buildStockOut', () => {
  it('records how much went out', () => {
    expect(buildStockOut(outDraft(), 100)).toEqual({
      ok: true,
      data: {
        kind: 'SCRAP',
        materialId: 'profile',
        quantity: 6,
        date: '2026-10-06',
        orderId: null,
        comment: 'погнули при резке',
      },
    });
  });

  it('asks for the order of an overuse and a reason for «Другое»', () => {
    expect(buildStockOut(outDraft({ kind: 'ORDER_EXTRA' }), 100)).toEqual({
      ok: false,
      errors: { order: 'Выберите заказ' },
    });
    expect(
      buildStockOut(outDraft({ kind: 'OTHER_OUT', comment: ' ' }), 100),
    ).toEqual({ ok: false, errors: { comment: 'Напишите, куда ушло' } });
  });

  it('refuses more than lies on the shelf', () => {
    expect(buildStockOut(outDraft({ quantity: '7' }), 6.5)).toEqual({
      ok: false,
      errors: { quantity: 'Больше, чем есть на складе' },
    });
  });
});

describe('buildDebtPayment', () => {
  it('pays up to the debt', () => {
    const draftPayment = {
      supplierId: 'metal',
      amount: '1,580,000',
      wallet: 'CASH' as const,
      date: '2026-10-08',
      comment: '',
    };

    expect(buildDebtPayment(draftPayment, 1_580_000)).toEqual({
      ok: true,
      data: {
        supplierId: 'metal',
        amount: 1_580_000,
        wallet: 'CASH',
        date: '2026-10-08',
        comment: null,
      },
    });
    expect(buildDebtPayment(draftPayment, 1_000_000)).toEqual({
      ok: false,
      errors: { amount: 'Долг только 1,000,000 сум' },
    });
  });
});
