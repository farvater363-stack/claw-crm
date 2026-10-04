import {
  type DiscountKind,
  DISTRICT_OPTIONS,
  type PaymentMethod,
  SOURCE_OPTIONS,
} from 'src/constants/select-options';
import { PLAIN_DECIMAL, parseOptionalMoney } from 'src/prices/prices-screen';
import { computeDiscount } from 'src/pricing/compute-discount';
import { computeItemAreaSquareMeters } from 'src/pricing/compute-item-area';
import { todayInTashkent } from 'src/pricing/dates';
import {
  normalizeUzbekPhone,
  toStoredUzbekPhone,
} from 'src/pricing/normalize-uzbek-phone';
import { roundTo } from 'src/pricing/round';
import { formatDayMonth } from 'src/ui/format';

type District = (typeof DISTRICT_OPTIONS)[number]['value'];
type Source = (typeof SOURCE_OPTIONS)[number]['value'];

export const UZBEK_PHONE_PREFIX = '+998';

// Matches maxNumberOfValues on orderItem.photos.
export const MAX_PHOTOS_PER_OPENING = 5;

export type OpeningPhoto = {
  key: string;
  file: File;
  thumbnailUrl: string | null;
};

// Inputs keep raw strings so a half-typed value ("1,") survives re-render.
export type OpeningDraft = {
  key: string;
  designId: string;
  widthCm: string;
  heightCm: string;
  projectionCm: string;
  quantity: string;
  notes: string;
  photos: OpeningPhoto[];
};

export type MeasurementDraft = {
  clientName: string;
  clientPhone: string;
  district: District | '';
  addressLine: string;
  floor: string;
  source: Source | '';
  measurementDate: string;
  comment: string;
  openings: OpeningDraft[];
  visorServiceId: string;
  visorLengthMeters: string;
};

export type OrderPayload = {
  status: 'MEASURED';
  measurerId: string;
  clientName: string | null;
  clientPhone: string;
  district: District | null;
  addressLine: string | null;
  floor: number | null;
  source: Source | null;
  measurementDate: string | null;
  comment: string | null;
  discountKind: DiscountKind;
  discountValue: number | null;
};

export type OrderItemPayload = {
  designId: string | null;
  widthCm: number;
  heightCm: number;
  projectionCm: number;
  quantity: number;
  notes: string | null;
};

export type VisorPayload = { extraServiceId: string; quantity: number };

export type FirstPayment = {
  amount: number;
  method: PaymentMethod;
  comment: string;
  paidOn: string;
};

export type VisorOption = { id: string; name: string; price: number | null };

export type GrilleOption = {
  id: string;
  name: string;
  photoUrl: string | null;
  pricePerSquareMeter: number | null;
};

export type MeasurementPayloadResult =
  | {
      isValid: true;
      // The scheduled order to save into; null creates a new order
      orderId: string | null;
      order: OrderPayload;
      items: OrderItemPayload[];
      visor: VisorPayload | null;
      firstPayment: FirstPayment | null;
    }
  | { isValid: false; errors: string[] };

const NATIONAL_PHONE_GROUPS = [2, 3, 2, 2];

export const createEmptyOpening = (key: string): OpeningDraft => ({
  key,
  designId: '',
  widthCm: '',
  heightCm: '',
  projectionCm: '0',
  quantity: '1',
  notes: '',
  photos: [],
});

export const takePhotosWithinLimit = <TPhoto>(
  current: TPhoto[],
  picked: TPhoto[],
): { photos: TPhoto[]; skippedCount: number } => {
  const room = Math.max(0, MAX_PHOTOS_PER_OPENING - current.length);

  return {
    photos: [...current, ...picked.slice(0, room)],
    skippedCount: Math.max(0, picked.length - room),
  };
};

export const buildOpeningPhotoLabel = (
  openingNumber: number,
  photoNumber: number,
  fileName: string,
): string => {
  const extension = /\.[a-z0-9]+$/i.exec(fileName)?.[0].toLowerCase() ?? '';

  return `Проём ${openingNumber}, фото ${photoNumber}${extension}`;
};

export const describePhotoUploadFailure = (openingNumbers: number[]) =>
  `Заказ сохранён, но не все фото загрузились: ${openingNumbers.length === 1 ? 'проём' : 'проёмы'} № ${openingNumbers.join(', ')}. Добавьте их кнопкой «Добавить фото».`;

// Runs on blur, never per keystroke: the sandboxed input echoes values back
// asynchronously, so rewriting it while the measurer types moves the caret.
export const formatUzbekNationalPhone = (raw: string): string => {
  const national = normalizeUzbekPhone(raw);

  if (national === null) return raw;

  const groups: string[] = [];
  let offset = 0;

  for (const size of NATIONAL_PHONE_GROUPS) {
    groups.push(national.slice(offset, offset + size));
    offset += size;
  }

  return groups.join(' ');
};

export const parseDecimalInput = (value: string): number | null => {
  const trimmed = value.trim().replace(',', '.');

  if (trimmed === '') return null;

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
};

export const computeOpeningAreaSquareMeters = (
  opening: OpeningDraft,
): number | null => {
  const widthCm = parseDecimalInput(opening.widthCm);
  const heightCm = parseDecimalInput(opening.heightCm);

  if (widthCm === null || heightCm === null || widthCm <= 0 || heightCm <= 0) {
    return null;
  }

  return computeItemAreaSquareMeters({
    widthCm,
    heightCm,
    projectionCm: parseDecimalInput(opening.projectionCm) ?? 0,
  });
};

export const computeOpeningsTotalAreaSquareMeters = (
  openings: OpeningDraft[],
): number =>
  roundTo(
    openings.reduce(
      (total, opening) =>
        total +
        (computeOpeningAreaSquareMeters(opening) ?? 0) *
          (parseDecimalInput(opening.quantity) ?? 1),
      0,
    ),
    2,
  );

const emptyToNull = <TValue extends string>(
  value: TValue | '',
): TValue | null => (value.trim() === '' ? null : (value.trim() as TValue));

type GrillePrice = Pick<GrilleOption, 'id' | 'pricePerSquareMeter'>;

const findGrillePrice = (
  opening: OpeningDraft,
  grilles: GrillePrice[],
): number | null =>
  grilles.find((grille) => grille.id === opening.designId)
    ?.pricePerSquareMeter ?? null;

// Same price the server gives a new order item, so the quote matches the
// saved order.
export const computeOpeningQuote = (
  opening: OpeningDraft,
  grilles: GrillePrice[],
): { pricePerSquareMeter: number; lineTotal: number } | null => {
  const areaSquareMeters = computeOpeningAreaSquareMeters(opening);
  const pricePerSquareMeter = findGrillePrice(opening, grilles);

  if (areaSquareMeters === null || pricePerSquareMeter === null) return null;

  const quantity = parseDecimalInput(opening.quantity) ?? 1;

  return {
    pricePerSquareMeter,
    lineTotal: Math.round(areaSquareMeters * quantity * pricePerSquareMeter),
  };
};

export const computeDraftTotal = (
  openings: OpeningDraft[],
  grilles: GrillePrice[],
): number | null => {
  const quotes = openings.map((opening) =>
    computeOpeningQuote(opening, grilles),
  );

  return quotes.every((quote) => quote !== null)
    ? quotes.reduce((total, quote) => total + (quote?.lineTotal ?? 0), 0)
    : null;
};

// A total is also missing while sizes are still empty; only a missing price is the manager's to name.
export const hasOpeningWithoutPrice = (
  openings: OpeningDraft[],
  grilles: GrillePrice[],
): boolean =>
  openings.some((opening) => findGrillePrice(opening, grilles) === null);

export const computeVisorTotal = (
  draft: Pick<MeasurementDraft, 'visorServiceId' | 'visorLengthMeters'>,
  visorOptions: VisorOption[],
): number | null => {
  const price = visorOptions.find(
    (option) => option.id === draft.visorServiceId,
  )?.price;
  const lengthMeters = parseDecimalInput(draft.visorLengthMeters);

  if (price == null || lengthMeters === null || lengthMeters <= 0) return null;

  return Math.round(price * lengthMeters);
};

// datetime-local wants local wall time without a zone.
export const toDateTimeLocalInputValue = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export type PaymentDraft = {
  discountKind: DiscountKind;
  discountValue: string;
  prepayment: string;
  method: PaymentMethod;
  comment: string;
};

export const EMPTY_PAYMENT_DRAFT: PaymentDraft = {
  discountKind: 'PERCENT',
  discountValue: '',
  prepayment: '',
  method: 'CASH',
  comment: '',
};

export type PaymentPreview = {
  subtotal: number | null;
  discount: number;
  total: number | null;
  prepayment: number;
  balance: number | null;
  errors: { discountValue?: string; prepayment?: string };
};

const NOT_A_NUMBER = 'Введите число, ноль или больше';

type TypedNumber = { ok: true; value: number | null } | { ok: false };

// A percent may have a fraction; an amount in сум is a whole sum.
const parseDiscountValue = ({
  discountKind,
  discountValue,
}: PaymentDraft): TypedNumber => {
  if (discountKind === 'AMOUNT') return parseOptionalMoney(discountValue);

  const trimmed = discountValue.trim();

  if (trimmed === '') return { ok: true, value: null };

  // Number() alone would also take «1e1» and a signed value; digits alone can
  // still be too many to fit a number.
  const value = PLAIN_DECIMAL.test(trimmed) ? parseDecimalInput(trimmed) : null;

  return value === null ? { ok: false } : { ok: true, value };
};

// The server computes the same numbers again on save; this is what the measurer
// sees while typing. A value with an error counts as not typed.
export const computePaymentPreview = (
  subtotal: number | null,
  draft: PaymentDraft,
): PaymentPreview => {
  if (subtotal === null) {
    return {
      subtotal: null,
      discount: 0,
      total: null,
      prepayment: 0,
      balance: null,
      errors: {},
    };
  }

  const errors: PaymentPreview['errors'] = {};
  const discountValue = parseDiscountValue(draft);
  const isAboveSubtotal =
    discountValue.ok &&
    (discountValue.value ?? 0) >
      (draft.discountKind === 'PERCENT' ? 100 : subtotal);

  if (!discountValue.ok) {
    errors.discountValue = NOT_A_NUMBER;
  } else if (isAboveSubtotal) {
    errors.discountValue = 'Скидка больше суммы';
  }

  const discount =
    discountValue.ok && !isAboveSubtotal
      ? computeDiscount({
          subtotal,
          kind: draft.discountKind,
          value: discountValue.value,
        })
      : 0;
  const total = subtotal - discount;
  const typedPrepayment = parseOptionalMoney(draft.prepayment);
  const isAboveTotal =
    typedPrepayment.ok && (typedPrepayment.value ?? 0) > total;

  if (!typedPrepayment.ok) {
    errors.prepayment = NOT_A_NUMBER;
  } else if (isAboveTotal) {
    errors.prepayment = 'Предоплата больше итога';
  }

  const prepayment =
    typedPrepayment.ok && !isAboveTotal ? (typedPrepayment.value ?? 0) : 0;

  return {
    subtotal,
    discount,
    total,
    prepayment,
    balance: total - prepayment,
    errors,
  };
};

export type ScheduledOrder = {
  id: string;
  name: string;
  clientName: string | null;
  clientPhone: string | null;
  district: string | null;
  addressLine: string | null;
  floor: number | null;
  measurementDate: string | null;
  comment: string | null;
  source: string | null;
};

// Sorts after every real date
const NO_DATE = '9999';

export const sortScheduledOrders = (
  orders: ScheduledOrder[],
): ScheduledOrder[] =>
  [...orders].sort(
    (left, right) =>
      (left.measurementDate ?? NO_DATE).localeCompare(
        right.measurementDate ?? NO_DATE,
      ) || left.name.localeCompare(right.name, 'ru', { numeric: true }),
  );

const TASHKENT_TIME = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Tashkent',
  hour: '2-digit',
  minute: '2-digit',
});

const isDistrict = (value: string | null): value is District =>
  DISTRICT_OPTIONS.some((option) => option.value === value);

const isSource = (value: string | null): value is Source =>
  SOURCE_OPTIONS.some((option) => option.value === value);

const describeMeasurementTime = (
  measurementDate: string | null,
  today: string,
): string | null => {
  const date = measurementDate === null ? null : new Date(measurementDate);

  if (date === null || Number.isNaN(date.getTime())) return null;

  const day = todayInTashkent(date);

  return `${day === today ? 'Сегодня' : formatDayMonth(day)} ${TASHKENT_TIME.format(date)}`;
};

export const scheduledOrderLabel = (
  order: ScheduledOrder,
  today: string,
): string =>
  [
    describeMeasurementTime(order.measurementDate, today),
    order.clientName?.trim() || order.name,
    DISTRICT_OPTIONS.find((option) => option.value === order.district)?.label,
  ]
    .filter((part) => part !== null && part !== undefined && part !== '')
    .join(' · ');

export const draftFromScheduledOrder = (
  order: ScheduledOrder,
): Partial<MeasurementDraft> => ({
  clientName: order.clientName ?? '',
  clientPhone: formatUzbekNationalPhone(order.clientPhone ?? ''),
  district: isDistrict(order.district) ? order.district : '',
  addressLine: order.addressLine ?? '',
  floor: order.floor === null ? '' : String(order.floor),
  // Without a scheduled time the form keeps its own, which is now.
  ...(order.measurementDate !== null && {
    measurementDate: toDateTimeLocalInputValue(new Date(order.measurementDate)),
  }),
  // What the manager wrote stays in front of the measurer: the save writes
  // these fields back, so an unseen text would be replaced.
  comment: order.comment ?? '',
  source: isSource(order.source) ? order.source : '',
});

// The order header writes this key to sessionStorage before it opens the form.
// A front component runs in a worker and cannot read the page address; the
// storage is shared by the app's components for one user.
export const MEASUREMENT_ORDER_STORAGE_KEY = 'claw:measurement-order';

export const NEW_CLIENT_TARGET = 'NEW';

// `target` is what «Чей замер» holds: '' until the measurer chooses, the id of
// a scheduled order, or NEW_CLIENT_TARGET. Saving unchosen would make a second
// order for a client who already has a scheduled one.
export const resolveTargetOrderId = (
  target: string,
  scheduledOrders: ScheduledOrder[],
): { ok: true; orderId: string | null } | { ok: false; error: string } => {
  if (scheduledOrders.length === 0 || target === NEW_CLIENT_TARGET) {
    return { ok: true, orderId: null };
  }

  return scheduledOrders.some((order) => order.id === target)
    ? { ok: true, orderId: target }
    : { ok: false, error: 'Выберите, чей это замер' };
};

// Saving into a scheduled order must not wipe what the manager entered, nor
// hand the order to whoever opened the form: the measurer's pay follows the
// order's measurer. The discount is the exception: the form never shows an
// earlier one, so an empty value clears it and the saved total matches the
// preview; a new kind over an old value would change the total.
export const toOrderUpdateData = (order: OrderPayload): Partial<OrderPayload> =>
  Object.fromEntries(
    Object.entries(order).filter(
      ([key, value]) =>
        key !== 'measurerId' && (value !== null || key === 'discountValue'),
    ),
  ) as Partial<OrderPayload>;

export type MeasurementContext = {
  orderId: string | null;
  payment: PaymentDraft;
  // The draft's sum before the discount; null while a price is missing
  subtotal: number | null;
  today: string;
};

export const buildMeasurementPayload = (
  draft: MeasurementDraft,
  measurerId: string,
  context: MeasurementContext,
): MeasurementPayloadResult => {
  const errors: string[] = [];

  const clientPhone = toStoredUzbekPhone(draft.clientPhone);

  if (clientPhone === null) {
    errors.push('Укажите телефон клиента полностью: +998 XX XXX XX XX');
  }

  const floor = parseDecimalInput(draft.floor);

  if (
    draft.floor.trim() !== '' &&
    (floor === null || !Number.isInteger(floor))
  ) {
    errors.push('Этаж должен быть целым числом');
  }

  const measurementDate =
    draft.measurementDate === '' ? null : new Date(draft.measurementDate);

  if (measurementDate !== null && Number.isNaN(measurementDate.getTime())) {
    errors.push('Проверьте дату замера');
  }

  const hasVisor = draft.visorServiceId !== '';
  const visorLengthMeters = parseDecimalInput(draft.visorLengthMeters);

  if (draft.openings.length === 0 && !hasVisor) {
    errors.push('Добавьте проём или козырёк');
  }

  if (hasVisor && (visorLengthMeters === null || visorLengthMeters <= 0)) {
    errors.push('Козырёк: укажите длину в метрах больше 0');
  }

  const items: OrderItemPayload[] = [];

  draft.openings.forEach((opening, index) => {
    const label = `Проём ${index + 1}`;
    const widthCm = parseDecimalInput(opening.widthCm);
    const heightCm = parseDecimalInput(opening.heightCm);
    const projectionCm = parseDecimalInput(opening.projectionCm) ?? 0;
    const quantity = parseDecimalInput(opening.quantity);

    if (
      widthCm === null ||
      heightCm === null ||
      widthCm <= 0 ||
      heightCm <= 0
    ) {
      errors.push(`${label}: укажите ширину и высоту больше 0`);

      return;
    }

    if (projectionCm < 0) {
      errors.push(`${label}: вылет не может быть отрицательным`);

      return;
    }

    if (quantity === null || !Number.isInteger(quantity) || quantity < 1) {
      errors.push(`${label}: количество должно быть целым числом от 1`);

      return;
    }

    items.push({
      designId: emptyToNull(opening.designId),
      widthCm,
      heightCm,
      projectionCm,
      quantity,
      notes: emptyToNull(opening.notes),
    });
  });

  const preview = computePaymentPreview(context.subtotal, context.payment);
  const discountValue = parseDiscountValue(context.payment);

  // Each of the two fields shows its own reason; this line only says why nothing was saved.
  if (Object.keys(preview.errors).length > 0) {
    errors.push('Проверьте скидку и предоплату');
  }

  if (errors.length > 0 || clientPhone === null) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    orderId: context.orderId,
    order: {
      status: 'MEASURED',
      measurerId,
      clientName: emptyToNull(draft.clientName),
      clientPhone,
      district: emptyToNull(draft.district),
      addressLine: emptyToNull(draft.addressLine),
      floor,
      source: emptyToNull(draft.source),
      measurementDate: measurementDate?.toISOString() ?? null,
      comment: emptyToNull(draft.comment),
      discountKind: context.payment.discountKind,
      // Without a sum («Другая») the manager names the price and the discount later.
      discountValue:
        preview.subtotal !== null && discountValue.ok
          ? discountValue.value
          : null,
    },
    items,
    visor:
      hasVisor && visorLengthMeters !== null
        ? { extraServiceId: draft.visorServiceId, quantity: visorLengthMeters }
        : null,
    firstPayment:
      preview.prepayment > 0
        ? {
            amount: preview.prepayment,
            method: context.payment.method,
            comment: context.payment.comment.trim(),
            paidOn: context.today,
          }
        : null,
  };
};
