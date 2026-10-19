import {
  type DiscountKind,
  DISTRICT_OPTIONS,
  type ExtraServiceUnit,
  type PaymentMethod,
  type Product,
  type ProjectionKind,
  type ProjectionSide,
  SOURCE_OPTIONS,
} from 'src/constants/select-options';
import {
  buildShapeOutline,
  createShapeDraft,
  outlineHeightCm,
  type ShapeDraft,
  type ShapeOutline,
  type StoredShape,
  toStoredShape,
} from 'src/opening-shape/opening-shape';
import { PLAIN_DECIMAL, parseOptionalMoney } from 'src/prices/prices-screen';
import { computeDiscount } from 'src/pricing/compute-discount';
import {
  computeItemAreaSquareMeters,
  computeRunningMeters,
} from 'src/pricing/compute-item-area';
import { todayInTashkent } from 'src/pricing/dates';
import {
  normalizeUzbekPhone,
  toStoredUzbekPhone,
} from 'src/pricing/normalize-uzbek-phone';
import { roundTo } from 'src/pricing/round';
import { formatDayMonth } from 'src/ui/format';
import { type FullName, joinFullName, trimFullName } from 'src/utils/full-name';
import { parseDecimalInput } from 'src/utils/parse-decimal-input';

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
  // The id its visor line is saved under, as `key` is for the order item
  visorKey: string;
  product: Product;
  designId: string;
  // A railing's length
  widthCm: string;
  // A rectangle's or a railing's height; any other shape takes its points'
  heightCm: string;
  shape: ShapeDraft;
  projectionKind: ProjectionKind;
  // Empty until the measurer picks it; asked only with a вынос
  projectionSide: ProjectionSide | '';
  projectionCm: string;
  quantity: string;
  notes: string;
  photos: OpeningPhoto[];
  // «Нужен» is chosen before the visor itself, which is picked from a list
  isVisorWanted: boolean;
  visorServiceId: string;
  visorLengthCm: string;
};

// One line of «Услуги»: demolition, delivery, anything priced in Цены → Услуги.
// An empty quantity of a service per m² follows the openings' area.
export type ServiceDraft = {
  // The id its order line is saved under
  key: string;
  serviceId: string;
  quantity: string;
};

export type MeasurementDraft = {
  clientFirstName: string;
  clientLastName: string;
  clientPhone: string;
  district: District | '';
  addressLine: string;
  floor: string;
  source: Source | '';
  measurementDate: string;
  comment: string;
  openings: OpeningDraft[];
  services: ServiceDraft[];
};

export type OrderPayload = {
  status: 'MEASURED';
  measurerId: string;
  clientFullName: FullName | null;
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
  id: string;
  product: Product;
  designId: string | null;
  widthCm: number;
  // The highest point of a shape: the price counts its outer box
  heightCm: number;
  shape: StoredShape | null;
  projectionKind: ProjectionKind;
  projectionSide: ProjectionSide | null;
  projectionCm: number;
  quantity: number;
  notes: string | null;
  // The form's «Проём N»: a visor alone saves no item, so the items' order
  // alone would number the later ones differently from their photos
  openingNumber: number;
};

// `quantity` is running metres, the unit a visor is priced in.
export type VisorPayload = {
  id: string;
  extraServiceId: string;
  quantity: number;
  // null for a visor ordered without a grille
  orderItemId: string | null;
  // «Проём N» of such a visor alone
  openingNumber: number | null;
};

export type ServicePayload = {
  id: string;
  extraServiceId: string;
  quantity: number;
};

export type FirstPayment = {
  amount: number;
  method: PaymentMethod;
  comment: string;
  paidOn: string;
};

export type VisorOption = { id: string; name: string; price: number | null };

export type ServiceOption = {
  id: string;
  name: string;
  unit: ExtraServiceUnit | null;
  price: number | null;
};

export type GrilleOption = {
  id: string;
  product: Product;
  name: string;
  kindName: string | null;
  photoUrl: string | null;
  // Per running metre for a railing
  pricePerSquareMeter: number | null;
};

export type MeasurementPayloadResult =
  | {
      isValid: true;
      // The scheduled order to save into; null creates a new order
      orderId: string | null;
      order: OrderPayload;
      items: OrderItemPayload[];
      visors: VisorPayload[];
      services: ServicePayload[];
      firstPayment: FirstPayment | null;
    }
  | { isValid: false; errors: string[] };

const NATIONAL_PHONE_GROUPS = [2, 3, 2, 2];

let shapePointSequence = 0;
// Keys only need to be unique within the page.
export const createShapePointKey = () => `point-${shapePointSequence++}`;

export const createEmptyOpening = (
  key: string,
  visorKey: string,
): OpeningDraft => ({
  key,
  visorKey,
  product: 'GRILLE',
  designId: '',
  widthCm: '',
  heightCm: '',
  shape: createShapeDraft(createShapePointKey),
  projectionKind: 'NONE',
  projectionSide: '',
  projectionCm: '',
  quantity: '1',
  notes: '',
  photos: [],
  isVisorWanted: false,
  visorServiceId: '',
  visorLengthCm: '',
});

// A neighbouring window of the same build: sizes, grille and visor carry
// over, its own notes and photos do not.
export const copyOpening = (
  opening: OpeningDraft,
  key: string,
  visorKey: string,
): OpeningDraft => ({
  ...opening,
  key,
  visorKey,
  notes: '',
  photos: [],
});

// «+ Проём»: the next window is usually of the same build, so the product,
// grille, вынос and visor carry over; its sizes are measured anew.
export const createOpeningLike = (
  previous: OpeningDraft,
  key: string,
  visorKey: string,
): OpeningDraft => ({
  ...createEmptyOpening(key, visorKey),
  product: previous.product,
  designId: previous.designId,
  projectionKind: previous.projectionKind,
  projectionSide: previous.projectionSide,
  projectionCm: previous.projectionCm,
  isVisorWanted: previous.isVisorWanted,
  visorServiceId: previous.visorServiceId,
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

export { parseDecimalInput };

// The shape the typed numbers describe, null while they do not describe one.
export const openingOutline = (opening: OpeningDraft): ShapeOutline | null =>
  opening.product === 'RAILING'
    ? null
    : buildShapeOutline(opening.shape, opening.widthCm, opening.heightCm)
        .outline;

// What the price is counted from: a rectangle's height, or a shape's highest
// point, so an arch costs as the box it fits in.
export const openingHeightCm = (opening: OpeningDraft): number | null => {
  if (opening.product === 'RAILING') {
    return parseDecimalInput(opening.heightCm);
  }

  // Rounded as the saved item's height is, so the quote and the contract
  // match the order.
  if (opening.shape.kind === 'RECTANGLE') {
    const heightCm = parseDecimalInput(opening.heightCm);

    return heightCm === null ? null : roundTo(heightCm, 1);
  }

  const outline = openingOutline(opening);

  return outline === null ? null : outlineHeightCm(outline);
};

export const computeOpeningRunningMeters = (
  opening: OpeningDraft,
): number | null => {
  const lengthCm = parseDecimalInput(opening.widthCm);
  const heightCm = parseDecimalInput(opening.heightCm);

  if (
    opening.product !== 'RAILING' ||
    lengthCm === null ||
    heightCm === null ||
    lengthCm <= 0 ||
    heightCm <= 0
  ) {
    return null;
  }

  return computeRunningMeters(lengthCm);
};

// A railing has no area: it counts in running metres.
export const computeOpeningAreaSquareMeters = (
  opening: OpeningDraft,
): number | null => {
  const widthCm = parseDecimalInput(opening.widthCm);
  const heightCm = openingHeightCm(opening);

  if (
    opening.product === 'RAILING' ||
    widthCm === null ||
    heightCm === null ||
    widthCm <= 0 ||
    heightCm <= 0
  ) {
    return null;
  }

  return computeItemAreaSquareMeters({
    widthCm,
    heightCm,
    projectionCm: parseDecimalInput(opening.projectionCm) ?? 0,
    projectionKind: opening.projectionKind,
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

// Without either part the name stays unwritten, like any other empty field.
const toClientFullName = (draft: MeasurementDraft): FullName | null => {
  const name = trimFullName({
    firstName: draft.clientFirstName,
    lastName: draft.clientLastName,
  });

  return joinFullName(name) === null ? null : name;
};

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
  const units =
    opening.product === 'RAILING'
      ? computeOpeningRunningMeters(opening)
      : computeOpeningAreaSquareMeters(opening);
  const pricePerSquareMeter = findGrillePrice(opening, grilles);

  if (units === null || pricePerSquareMeter === null) return null;

  const quantity = parseDecimalInput(opening.quantity) ?? 1;

  return {
    pricePerSquareMeter,
    lineTotal: Math.round(units * quantity * pricePerSquareMeter),
  };
};

const CENTIMETERS_PER_METER = 100;
// Sizes used to be typed in metres: «2,5» out of habit must not be saved as
// two and a half centimetres.
const MIN_SIZE_CM = 10;

const isBelowMinSize = (sizeCm: number | null) =>
  sizeCm !== null && sizeCm < MIN_SIZE_CM;

// A visor alone: no sizes, so no grille is made for this opening. A grille
// picked without sizes is a forgotten size, not a visor alone.
export const isVisorOnlyOpening = (opening: OpeningDraft): boolean =>
  opening.product === 'GRILLE' &&
  opening.shape.kind === 'RECTANGLE' &&
  opening.designId === '' &&
  opening.visorServiceId !== '' &&
  opening.widthCm.trim() === '' &&
  opening.heightCm.trim() === '';

// One visor per piece, so three equal openings take three visors.
const computeVisorRunningMeters = (opening: OpeningDraft): number | null => {
  const lengthCm = parseDecimalInput(opening.visorLengthCm);

  if (lengthCm === null || lengthCm < MIN_SIZE_CM) return null;

  return roundTo(
    (lengthCm / CENTIMETERS_PER_METER) *
      (parseDecimalInput(opening.quantity) ?? 1),
    2,
  );
};

// 0 without a visor; null while its length or its price is missing.
export const computeOpeningVisorTotal = (
  opening: OpeningDraft,
  visorOptions: VisorOption[],
): number | null => {
  if (opening.visorServiceId === '') return 0;

  const price = visorOptions.find(
    (option) => option.id === opening.visorServiceId,
  )?.price;
  const runningMeters = computeVisorRunningMeters(opening);

  if (price == null || runningMeters === null) return null;

  return Math.round(price * runningMeters);
};

export const computeDraftTotal = (
  openings: OpeningDraft[],
  grilles: GrillePrice[],
  visorOptions: VisorOption[],
): number | null => {
  let total = 0;

  for (const opening of openings) {
    const grilleTotal = isVisorOnlyOpening(opening)
      ? 0
      : (computeOpeningQuote(opening, grilles)?.lineTotal ?? null);
    const visorTotal = computeOpeningVisorTotal(opening, visorOptions);

    if (grilleTotal === null || visorTotal === null) return null;

    total += grilleTotal + visorTotal;
  }

  return total;
};

const SERVICE_UNIT_TEXT: Record<ExtraServiceUnit, string> = {
  FIXED: 'за заказ',
  PER_SQUARE_METER: 'за м²',
  PER_PIECE: 'за шт',
  PER_RUNNING_METER: 'за п.м.',
};

export const serviceUnitText = (unit: ExtraServiceUnit | null): string =>
  SERVICE_UNIT_TEXT[unit ?? 'FIXED'];

// Counted with a stepper: a fixed-price service taken twice is paid twice.
export const isCountedServiceUnit = (unit: ExtraServiceUnit | null): boolean =>
  unit === null || unit === 'FIXED' || unit === 'PER_PIECE';

// null while the measurer still has to type it.
export const computeServiceQuantity = (
  line: ServiceDraft,
  option: ServiceOption | undefined,
  openingsAreaSquareMeters: number,
): number | null => {
  const unit = option?.unit ?? 'FIXED';
  const isCounted = isCountedServiceUnit(unit);
  const typed = parseDecimalInput(line.quantity);

  if (unit === 'PER_SQUARE_METER' && line.quantity.trim() === '') {
    return openingsAreaSquareMeters > 0 ? openingsAreaSquareMeters : null;
  }

  // The stepper shows 1 before anything is pressed
  if (isCounted && line.quantity.trim() === '') return 1;

  if (typed === null || typed <= 0) return null;
  if (isCounted && !Number.isInteger(typed)) return null;

  return roundTo(typed, 2);
};

// 0 without services; null while a quantity or a price is missing.
export const computeServicesTotal = (
  services: ServiceDraft[],
  options: ServiceOption[],
  openingsAreaSquareMeters: number,
): number | null => {
  let total = 0;

  for (const line of services) {
    const option = options.find((candidate) => candidate.id === line.serviceId);
    const quantity = computeServiceQuantity(
      line,
      option,
      openingsAreaSquareMeters,
    );

    if (option?.price == null || quantity === null) return null;

    total += Math.round(option.price * quantity);
  }

  return total;
};

export const computeServiceLineTotal = (
  line: ServiceDraft,
  options: ServiceOption[],
  openingsAreaSquareMeters: number,
): number | null =>
  computeServicesTotal([line], options, openingsAreaSquareMeters);

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

// «50 000» сум regrouped to «50,000» would read as 50 % once the kind flips.
export const applyPaymentChanges = (
  current: PaymentDraft,
  changes: Partial<PaymentDraft>,
): PaymentDraft => ({
  ...current,
  ...(changes.discountKind !== undefined &&
  changes.discountKind !== current.discountKind
    ? { discountValue: '' }
    : {}),
  ...changes,
});

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
  clientFullName: FullName;
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

export const describeMeasurementTime = (
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
    joinFullName(order.clientFullName) ?? order.name,
    DISTRICT_OPTIONS.find((option) => option.value === order.district)?.label,
  ]
    .filter((part) => part !== null && part !== undefined && part !== '')
    .join(' · ');

export const draftFromScheduledOrder = (
  order: ScheduledOrder,
): Partial<MeasurementDraft> => ({
  clientFirstName: order.clientFullName.firstName,
  clientLastName: order.clientFullName.lastName,
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
  serviceOptions: ServiceOption[];
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

  if (draft.openings.length === 0) {
    errors.push('Добавьте проём');
  }

  const items: OrderItemPayload[] = [];
  const visors: VisorPayload[] = [];

  draft.openings.forEach((opening, index) => {
    const label = `Проём ${index + 1}`;
    const isRailing = opening.product === 'RAILING';
    const widthCm = parseDecimalInput(opening.widthCm);
    const shapeResult = isRailing
      ? null
      : buildShapeOutline(opening.shape, opening.widthCm, opening.heightCm);
    const heightCm = isRailing
      ? parseDecimalInput(opening.heightCm)
      : shapeResult?.outline
        ? outlineHeightCm(shapeResult.outline)
        : null;
    const hasProjection = !isRailing && opening.projectionKind !== 'NONE';
    const projectionCm = hasProjection
      ? (parseDecimalInput(opening.projectionCm) ?? 0)
      : 0;
    const quantity = parseDecimalInput(opening.quantity);
    const isVisorOnly = isVisorOnlyOpening(opening);
    const openingErrors: string[] = [];

    if (
      isRailing &&
      (widthCm === null || heightCm === null || widthCm <= 0 || heightCm <= 0)
    ) {
      openingErrors.push(`${label}: укажите длину и высоту перилл больше 0`);
    } else if (
      isRailing &&
      (isBelowMinSize(widthCm) || isBelowMinSize(heightCm))
    ) {
      openingErrors.push(
        `${label}: укажите длину и высоту перилл в сантиметрах, от ${MIN_SIZE_CM}`,
      );
    } else if (
      !isRailing &&
      !isVisorOnly &&
      opening.shape.kind === 'RECTANGLE' &&
      (widthCm === null || heightCm === null || widthCm <= 0 || heightCm <= 0)
    ) {
      openingErrors.push(
        opening.designId !== '' &&
          opening.visorServiceId !== '' &&
          opening.widthCm.trim() === '' &&
          opening.heightCm.trim() === ''
          ? `${label}: выбрана решётка — укажите ширину и высоту. Если нужен только козырёк, выберите решётку «Другая».`
          : `${label}: укажите ширину и высоту больше 0`,
      );
    } else if (!isVisorOnly && shapeResult !== null && !shapeResult.isValid) {
      openingErrors.push(
        ...shapeResult.errors.map((error) => `${label}: ${error}`),
      );
    } else if (
      !isRailing &&
      !isVisorOnly &&
      (isBelowMinSize(widthCm) || isBelowMinSize(heightCm))
    ) {
      openingErrors.push(
        `${label}: укажите ширину и высоту в сантиметрах, от ${MIN_SIZE_CM}`,
      );
    } else if (!isVisorOnly && hasProjection && projectionCm <= 0) {
      openingErrors.push(`${label}: укажите вынос в сантиметрах`);
    } else if (!isRailing && !isVisorOnly && opening.projectionSide === '') {
      openingErrors.push(`${label}: укажите установку: снаружи или изнутри`);
    } else if (
      quantity === null ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      openingErrors.push(`${label}: количество должно быть целым числом от 1`);
    }

    const visorRunningMeters = computeVisorRunningMeters(opening);

    if (opening.isVisorWanted && opening.visorServiceId === '') {
      openingErrors.push(`${label}: выберите козырёк`);
    }

    if (opening.visorServiceId !== '' && visorRunningMeters === null) {
      openingErrors.push(
        `${label}: укажите длину козырька в сантиметрах, от ${MIN_SIZE_CM}`,
      );
    }

    // Notes and photos are kept on the order item, and a visor alone has none.
    if (
      isVisorOnly &&
      (opening.notes.trim() !== '' || opening.photos.length > 0)
    ) {
      openingErrors.push(
        `${label}: заметки и фото сохраняются только с размерами проёма. Укажите ширину и высоту.`,
      );
    }

    if (openingErrors.length > 0) {
      errors.push(...openingErrors);

      return;
    }

    if (!isVisorOnly && widthCm !== null && heightCm !== null) {
      items.push({
        id: opening.key,
        product: opening.product,
        designId: emptyToNull(opening.designId),
        widthCm,
        heightCm,
        shape:
          shapeResult?.outline == null
            ? null
            : toStoredShape(opening.shape, shapeResult.outline),
        projectionKind: isRailing ? 'NONE' : opening.projectionKind,
        projectionSide:
          isRailing || opening.projectionSide === ''
            ? null
            : opening.projectionSide,
        projectionCm,
        quantity: quantity ?? 1,
        notes: emptyToNull(opening.notes),
        openingNumber: index + 1,
      });
    }

    if (opening.visorServiceId !== '' && visorRunningMeters !== null) {
      visors.push({
        id: opening.visorKey,
        extraServiceId: opening.visorServiceId,
        quantity: visorRunningMeters,
        orderItemId: isVisorOnly ? null : opening.key,
        openingNumber: isVisorOnly ? index + 1 : null,
      });
    }
  });

  const services: ServicePayload[] = [];
  const openingsAreaSquareMeters = computeOpeningsTotalAreaSquareMeters(
    draft.openings,
  );

  for (const line of draft.services) {
    const option = context.serviceOptions.find(
      (candidate) => candidate.id === line.serviceId,
    );
    const quantity = computeServiceQuantity(
      line,
      option,
      openingsAreaSquareMeters,
    );
    const name = option?.name ?? 'услуга';

    if (quantity === null) {
      errors.push(
        isCountedServiceUnit(option?.unit ?? null)
          ? `Услуга «${name}»: количество должно быть целым числом от 1`
          : `Услуга «${name}»: укажите ${option?.unit === 'PER_RUNNING_METER' ? 'длину в п.м.' : 'площадь в м²'}`,
      );
      continue;
    }

    services.push({ id: line.key, extraServiceId: line.serviceId, quantity });
  }

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
      clientFullName: toClientFullName(draft),
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
    visors,
    services,
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
