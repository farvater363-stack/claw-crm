import { describe, expect, it } from 'vitest';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import orderPage from 'src/page-layouts/order.page-layout';
import orderFields from 'src/views/order-record-page-fields.view';

const ids = VIEW_PART_IDS.orderRecordPage;
const tabs = [...(orderPage.config.tabs ?? [])].sort(
  (left, right) => left.position - right.position,
);
const widgetsOf = (tabId: string) =>
  tabs.find((tab) => tab.universalIdentifier === tabId)?.widgets ?? [];

describe('order page', () => {
  it('has the left column and three tabs', () => {
    expect(tabs.map((tab) => tab.title)).toEqual([
      'Заказ',
      'Работа',
      'Фото и заметки',
      'История',
    ]);
  });

  it('opens on «Работа» on a phone and in the side panel', () => {
    expect(
      orderPage.config.defaultTabToFocusOnMobileAndSidePanelUniversalIdentifier,
    ).toBe(ids.itemsTab);
  });

  it('reads «Работа» from the header down to the materials', () => {
    expect(widgetsOf(ids.itemsTab).map((widget) => widget.title)).toEqual([
      'Что дальше',
      'Что делаем',
      'Козырьки и услуги',
      'Оплаты',
      'Материалы',
    ]);
    expect(widgetsOf(ids.itemsTab)[0]?.universalIdentifier).toBe(
      IDS.orderHeader.orderPageWidget,
    );
  });

  it('keeps the one widget that fills the tab last', () => {
    expect(
      widgetsOf(ids.notesTab).map((widget) => [
        widget.type,
        widget.heightBehavior,
      ]),
    ).toEqual([
      ['FRONT_COMPONENT', undefined],
      ['FILES', 'FIT_CONTENT'],
      ['NOTES', undefined],
    ]);
  });
});

describe('order fields', () => {
  const groups = [...(orderFields.config.fieldGroups ?? [])].sort(
    (left, right) => left.position - right.position,
  );
  const fields = orderFields.config.fields ?? [];
  const visibleIn = (groupId: string) =>
    fields
      .filter(
        (field) =>
          field.viewFieldGroupUniversalIdentifier === groupId &&
          field.isVisible,
      )
      .map((field) => field.fieldMetadataUniversalIdentifier);

  it('has four groups', () => {
    expect(groups.map((group) => group.name)).toEqual([
      'Клиент',
      'Срок и люди',
      'Деньги',
      'Экономика',
    ]);
  });

  it('shows the money from the sum to the balance', () => {
    expect(visibleIn(ids.groups.itemsAndTotal)).toEqual([
      IDS.order.subtotal,
      IDS.order.discountKind,
      IDS.order.discountValue,
      IDS.order.discount,
      IDS.order.total,
      IDS.order.paid,
      IDS.order.balance,
    ]);
  });

  it('ends «Срок и люди» with the status and the cancel reason, for corrections', () => {
    expect(visibleIn(ids.groups.production).slice(-2)).toEqual([
      IDS.order.status,
      IDS.order.cancelReason,
    ]);
  });

  it('hides what the header and the tables show, and the old prepayment', () => {
    const hidden = fields
      .filter((field) => !field.isVisible)
      .map((field) => field.fieldMetadataUniversalIdentifier);

    expect(hidden).toEqual(
      expect.arrayContaining([
        IDS.order.name,
        IDS.order.number,
        IDS.order.items,
        IDS.order.extraServices,
        IDS.order.areaSquareMeters,
        IDS.order.prepayment,
        IDS.order.deadlineState,
      ]),
    );
  });
});
