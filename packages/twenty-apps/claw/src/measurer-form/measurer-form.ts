import {
  type DISTRICT_OPTIONS,
  type SOURCE_OPTIONS,
} from 'src/constants/select-options';
import { computeItemAreaSquareMeters } from 'src/pricing/compute-item-area';
import {
  normalizeUzbekPhone,
  toStoredUzbekPhone,
} from 'src/pricing/normalize-uzbek-phone';
import { roundTo } from 'src/pricing/round';

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
      order: OrderPayload;
      items: OrderItemPayload[];
      visor: VisorPayload | null;
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

// Same price the server gives a new order item, so the quote matches the
// saved order.
export const computeOpeningQuote = (
  opening: OpeningDraft,
  grilles: Pick<GrilleOption, 'id' | 'pricePerSquareMeter'>[],
): { pricePerSquareMeter: number; lineTotal: number } | null => {
  const areaSquareMeters = computeOpeningAreaSquareMeters(opening);
  const pricePerSquareMeter =
    grilles.find((grille) => grille.id === opening.designId)
      ?.pricePerSquareMeter ?? null;

  if (areaSquareMeters === null || pricePerSquareMeter === null) return null;

  const quantity = parseDecimalInput(opening.quantity) ?? 1;

  return {
    pricePerSquareMeter,
    lineTotal: Math.round(areaSquareMeters * quantity * pricePerSquareMeter),
  };
};

export const computeDraftTotal = (
  openings: OpeningDraft[],
  grilles: Pick<GrilleOption, 'id' | 'pricePerSquareMeter'>[],
): number | null => {
  const quotes = openings.map((opening) =>
    computeOpeningQuote(opening, grilles),
  );

  return quotes.every((quote) => quote !== null)
    ? quotes.reduce((total, quote) => total + (quote?.lineTotal ?? 0), 0)
    : null;
};

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

export const buildMeasurementPayload = (
  draft: MeasurementDraft,
  measurerId: string,
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

  if (errors.length > 0 || clientPhone === null) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
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
    },
    items,
    visor:
      hasVisor && visorLengthMeters !== null
        ? { extraServiceId: draft.visorServiceId, quantity: visorLengthMeters }
        : null,
  };
};
