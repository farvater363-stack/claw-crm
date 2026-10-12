import { describe, expect, it } from 'vitest';

import {
  buildPurchaseEntry,
  purchaseEditDraft,
  stockOutEditDraft,
} from 'src/stock/stock-forms';
import { type LedgerMovement } from 'src/stock/stock-ledger';

const movement = (overrides: Partial<LedgerMovement>): LedgerMovement => ({
  id: 'movement',
  kind: 'RECEIPT',
  materialId: 'profile',
  quantity: 90,
  countedQuantity: null,
  unitPrice: 22_000,
  date: '2026-10-08',
  createdAt: '2026-10-08T09:00:00Z',
  orderId: null,
  purchaseId: 'purchase-1',
  comment: null,
  ...overrides,
});

describe('changing a purchase', () => {
  const lineKeys = ['a', 'b', 'c'];
  const nextKey = () => lineKeys.shift() ?? 'z';

  it('opens with its own lines, each keeping its stored movement, and no payment', () => {
    const draft = purchaseEditDraft(
      {
        id: 'purchase-1',
        date: '2026-10-08',
        createdAt: '2026-10-08T09:00:00Z',
        supplierId: 'metal',
        comment: 'накладная 12',
      },
      [
        movement({ id: 'line-1', quantity: 12.5 }),
        movement({ id: 'line-2', materialId: 'paint', unitPrice: null }),
        movement({ id: 'other', purchaseId: 'purchase-2' }),
      ],
      nextKey,
    );

    expect(draft).toMatchObject({
      supplierId: 'metal',
      date: '2026-10-08',
      comment: 'накладная 12',
      payment: 'DEBT',
      lines: [
        {
          movementId: 'line-1',
          materialId: 'profile',
          quantity: '12,5',
          price: '22,000',
        },
        { movementId: 'line-2', materialId: 'paint', price: '' },
      ],
    });

    const built = buildPurchaseEntry(draft, true);

    if (!built.ok) throw new Error('expected a valid purchase');

    expect(built.data.payment).toBeNull();
    expect(built.data.lines.map((line) => line.movementId)).toEqual([
      'line-1',
      'line-2',
    ]);
  });
});

describe('changing a расход', () => {
  it('opens a расход typed by hand with the amount that left', () => {
    expect(
      stockOutEditDraft(
        movement({
          id: 'scrap',
          kind: 'SCRAP',
          quantity: -4,
          purchaseId: null,
          comment: 'погнули',
        }),
      ),
    ).toEqual({
      kind: 'SCRAP',
      orderId: '',
      materialId: 'profile',
      quantity: '4',
      date: '2026-10-08',
      comment: 'погнули',
    });
  });

  it('does not open a write-off by the composition or a recount', () => {
    expect(stockOutEditDraft(movement({ kind: 'WRITE_OFF' }))).toBeNull();
    expect(stockOutEditDraft(movement({ kind: 'STOCKTAKE' }))).toBeNull();
  });
});
