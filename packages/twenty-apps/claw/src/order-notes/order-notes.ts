import { formatDayMonth } from 'src/ui/format';

export type OrderNote = { key: string; source: string; text: string };

export type OrderNoteSources = {
  orderComment: string | null;
  // In the order the openings were entered, so «Проём 3» matches the form
  items: {
    id: string;
    widthCm: number | null;
    heightCm: number | null;
    designName: string | null;
    notes: string | null;
  }[];
  payments: { id: string; paidOn: string | null; comment: string | null }[];
  stockMovements: { id: string; name: string | null; comment: string | null }[];
};

const join = (parts: (string | null | undefined)[]) =>
  parts.filter((part) => part).join(' · ');

// Every free text written about one order, each under the place it was typed.
export const collectOrderNotes = ({
  orderComment,
  items,
  payments,
  stockMovements,
}: OrderNoteSources): OrderNote[] =>
  [
    { key: 'order', source: 'Комментарий к заказу', text: orderComment },
    ...items.map((item, index) => ({
      key: item.id,
      source: join([
        `Проём ${index + 1}`,
        item.designName,
        item.widthCm !== null && item.heightCm !== null
          ? `${item.widthCm}×${item.heightCm}`
          : null,
      ]),
      text: item.notes,
    })),
    ...payments.map((payment) => ({
      key: payment.id,
      source: join([
        'Оплата',
        payment.paidOn === null ? null : formatDayMonth(payment.paidOn),
      ]),
      text: payment.comment,
    })),
    ...stockMovements.map((movement) => ({
      key: movement.id,
      source: join(['Склад', movement.name]),
      text: movement.comment,
    })),
  ].flatMap(({ key, source, text }) => {
    const trimmed = text?.trim() ?? '';

    return trimmed === '' ? [] : [{ key, source, text: trimmed }];
  });
