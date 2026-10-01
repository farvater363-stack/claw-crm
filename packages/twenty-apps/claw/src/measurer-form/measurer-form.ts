import {
  type DISTRICT_OPTIONS,
  type METAL_OPTIONS,
  type METAL_SIZE_OPTIONS,
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
type Metal = (typeof METAL_OPTIONS)[number]['value'];
type MetalSize = (typeof METAL_SIZE_OPTIONS)[number]['value'];

export const UZBEK_PHONE_PREFIX = '+998';

// Inputs keep raw strings so a half-typed value ("1,") survives re-render.
export type OpeningDraft = {
  key: string;
  designId: string;
  metal: Metal | '';
  metalSize: MetalSize | '';
  widthCm: string;
  heightCm: string;
  projectionCm: string;
  quantity: string;
  notes: string;
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
  metal: Metal | null;
  metalSize: MetalSize | null;
  widthCm: number;
  heightCm: number;
  projectionCm: number;
  quantity: number;
  notes: string | null;
};

export type MeasurementPayloadResult =
  | { isValid: true; order: OrderPayload; items: OrderItemPayload[] }
  | { isValid: false; errors: string[] };

const NATIONAL_PHONE_GROUPS = [2, 3, 2, 2];

export const createEmptyOpening = (key: string): OpeningDraft => ({
  key,
  designId: '',
  metal: '',
  metalSize: '',
  widthCm: '',
  heightCm: '',
  projectionCm: '0',
  quantity: '1',
  notes: '',
});

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

// datetime-local wants local wall time without a zone.
export const toDateTimeLocalInputValue = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const emptyToNull = <TValue extends string>(
  value: TValue | '',
): TValue | null => (value.trim() === '' ? null : (value.trim() as TValue));

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

  if (draft.openings.length === 0) {
    errors.push('Добавьте хотя бы один проём');
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
      metal: emptyToNull(opening.metal),
      metalSize: emptyToNull(opening.metalSize),
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
  };
};
