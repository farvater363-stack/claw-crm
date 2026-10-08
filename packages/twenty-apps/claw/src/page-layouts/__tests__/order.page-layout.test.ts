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
      'Схема',
      'Что делаем',
      'Оплата цеха',
      'Козырьки и услуги',
      'Оплаты',
      'Материалы',
    ]);
    expect(widgetsOf(ids.itemsTab)[0]?.universalIdentifier).toBe(
      IDS.orderHeader.orderPageWidget,
    );
  });

  // The server tells a kept widget from a new one by its identifier alone.
  it('keeps every widget under its own identifier, tab by tab', () => {
    expect(
      tabs.map((tab) => [
        tab.universalIdentifier,
        (tab.widgets ?? []).map((widget) => widget.universalIdentifier),
      ]),
    ).toEqual([
      [ids.homeTab, [ids.fieldsWidget]],
      [
        ids.itemsTab,
        [
          IDS.orderHeader.orderPageWidget,
          IDS.orderSketch.orderPageWidget,
          ids.itemsWidget,
          IDS.workshopPay.orderPageWidget,
          ids.extraServicesWidget,
          ids.paymentsWidget,
          ids.materialsWidget,
        ],
      ],
      [
        ids.notesTab,
        [
          IDS.measurementNotes.orderPageWidget,
          ids.notesFilesWidget,
          ids.notesWidget,
        ],
      ],
      [ids.timelineTab, [ids.timelineWidget]],
    ]);
  });

  it('shows the payments table in «Оплаты»', () => {
    const payments = widgetsOf(ids.itemsTab).find(
      (widget) => widget.universalIdentifier === ids.paymentsWidget,
    );

    expect(payments?.configuration).toMatchObject({
      fieldMetadataId: IDS.order.payments,
      viewId: IDS.view.orderPaymentsTable,
    });
  });

  // The server deletes a widget together with its tab, so the files widget
  // of the removed tab «Файлы» cannot be carried over to another tab.
  it('gives the files widget on «Фото и заметки» an identifier of its own', () => {
    const files = widgetsOf(ids.notesTab).find(
      (widget) => widget.type === 'FILES',
    );

    expect(files?.universalIdentifier).toBe(
      'f47172b1-7b46-47b5-a866-724ba0f3503d',
    );
    expect(JSON.stringify(orderPage.config)).not.toContain(
      'da9ecc50-b8f3-4756-8b58-d232172e2689',
    );
    expect(JSON.stringify(orderPage.config)).not.toContain(ids.filesTab);
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

  it('shows the client from the name to the comment', () => {
    expect(visibleIn(ids.groups.client)).toEqual([
      IDS.order.clientFullName,
      IDS.order.clientPhone,
      IDS.order.district,
      IDS.order.address,
      IDS.order.floor,
      IDS.order.source,
      IDS.order.client,
      IDS.order.measurementDate,
      IDS.order.measurer,
      IDS.order.comment,
      IDS.order.clientSignature,
    ]);
  });

  it('ends «Срок и люди» with the status and the cancel reason, for corrections', () => {
    expect(visibleIn(ids.groups.production)).toEqual([
      IDS.order.urgency,
      IDS.order.master,
      IDS.order.installer,
      IDS.order.soldBy,
      IDS.order.manager,
      IDS.order.productionStartDate,
      IDS.order.installationDeadline,
      IDS.order.readyAt,
      IDS.order.installedAt,
      IDS.order.paintColor,
      IDS.order.productionStage,
      IDS.order.finishedPhotos,
      IDS.order.status,
      IDS.order.cancelReason,
    ]);
  });

  it('shows the economics from the cost to the days late', () => {
    expect(visibleIn(ids.groups.economics)).toEqual([
      IDS.order.costTotal,
      IDS.order.margin,
      IDS.order.marginPercent,
      IDS.order.masterPayCalculated,
      IDS.order.masterPenalty,
      IDS.order.masterBonus,
      IDS.order.masterPayTotal,
      IDS.order.daysLate,
    ]);
  });

  it('lists only what the four groups show', () => {
    expect(fields.every((field) => field.isVisible)).toBe(true);

    const listed = fields.map(
      (field) => field.fieldMetadataUniversalIdentifier,
    );

    for (const gone of [
      IDS.order.name,
      IDS.order.number,
      IDS.order.items,
      IDS.order.extraServices,
      IDS.order.areaSquareMeters,
      IDS.order.prepayment,
      IDS.order.deadlineState,
    ]) {
      expect(listed).not.toContain(gone);
    }
  });
});
