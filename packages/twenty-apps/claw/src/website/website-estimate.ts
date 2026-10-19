import { type METAL_SIZE_OPTIONS } from 'src/constants/select-options';
import { computeItemAreaSquareMeters } from 'src/pricing/compute-item-area';
import { toStoredUzbekPhone } from 'src/pricing/normalize-uzbek-phone';
import {
  type PriceListEntry,
  resolvePriceListEntry,
} from 'src/pricing/resolve-price-list-entry';
import { roundTo } from 'src/pricing/round';

export const WEBSITE_METALS = ['ROD', 'PROFILE', 'REBAR'] as const;

export type WebsiteMetal = (typeof WEBSITE_METALS)[number];

type MetalSize = (typeof METAL_SIZE_OPTIONS)[number]['value'];

// Visitors pick only the metal; its most common size prices the estimate
// until the measurer records the real one.
export const DEFAULT_METAL_SIZE: Record<WebsiteMetal, MetalSize | null> = {
  ROD: 'SIZE_8',
  PROFILE: 'SIZE_15_15',
  REBAR: null,
};

export const WEBSITE_LANGUAGES = ['ru', 'uz'] as const;

export type WebsiteLanguage = (typeof WEBSITE_LANGUAGES)[number];

const MAX_NAME_LENGTH = 60;
const MAX_OFFER_PERCENT = 50;

// Admins set the monthly discount in the app's settings; anything unusable means no offer.
export const parseOfferPercent = (raw: string | undefined): number => {
  const percent = Number(raw);

  return Number.isInteger(percent) &&
    percent >= 0 &&
    percent <= MAX_OFFER_PERCENT
    ? percent
    : 0;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EstimateRequest = {
  designId: string | null;
  metal: WebsiteMetal;
  widthCm: number;
  heightCm: number;
  projectionCm: number;
  quantity: number;
  clientName: string;
  clientPhone: string;
  language: WebsiteLanguage;
};

export type EstimateRequestError =
  'INVALID_CHOICE' | 'INVALID_SIZE' | 'INVALID_NAME' | 'INVALID_PHONE';

export type ParsedEstimateRequest =
  | { isValid: true; isBot: boolean; request: EstimateRequest }
  | { isValid: false; error: EstimateRequestError };

const numberInRange = (
  value: unknown,
  minimum: number,
  maximum: number,
): number | null =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= minimum &&
  value <= maximum
    ? value
    : null;

const isOneOf = <TValue extends string>(
  options: readonly TValue[],
  value: unknown,
): value is TValue => options.includes(value as TValue);

export const parseEstimateRequest = (body: unknown): ParsedEstimateRequest => {
  const input =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const designId =
    typeof input.designId === 'string' && UUID_PATTERN.test(input.designId)
      ? input.designId
      : null;

  if (
    !isOneOf(WEBSITE_METALS, input.metal) ||
    !isOneOf(WEBSITE_LANGUAGES, input.language) ||
    (input.designId !== null && designId === null)
  ) {
    return { isValid: false, error: 'INVALID_CHOICE' };
  }

  const widthCm = numberInRange(input.widthCm, 20, 600);
  const heightCm = numberInRange(input.heightCm, 20, 600);
  const projectionCm = numberInRange(input.projectionCm ?? 0, 0, 100);
  const quantity = numberInRange(input.quantity, 1, 50);

  if (
    widthCm === null ||
    heightCm === null ||
    projectionCm === null ||
    quantity === null ||
    !Number.isInteger(quantity)
  ) {
    return { isValid: false, error: 'INVALID_SIZE' };
  }

  const clientName = typeof input.name === 'string' ? input.name.trim() : '';

  if (clientName === '' || clientName.length > MAX_NAME_LENGTH) {
    return { isValid: false, error: 'INVALID_NAME' };
  }

  const clientPhone =
    typeof input.phone === 'string' ? toStoredUzbekPhone(input.phone) : null;

  if (clientPhone === null) {
    return { isValid: false, error: 'INVALID_PHONE' };
  }

  return {
    isValid: true,
    // Hidden field people never see; bots fill every input.
    isBot: typeof input.website === 'string' && input.website !== '',
    request: {
      designId,
      metal: input.metal,
      widthCm,
      heightCm,
      projectionCm,
      quantity,
      clientName,
      clientPhone,
      language: input.language,
    },
  };
};

export const websitePricePerSquareMeter = (
  priceList: PriceListEntry[],
  designId: string | null,
  metal: WebsiteMetal,
): number | null =>
  resolvePriceListEntry(priceList, {
    designId,
    metal,
    metalSize: DEFAULT_METAL_SIZE[metal],
  })?.pricePerSquareMeter ?? null;

// Same rounding as the order recalc, so the site shows the total the CRM saves.
export const computeWebsiteEstimate = (
  priceList: PriceListEntry[],
  request: Pick<
    EstimateRequest,
    'designId' | 'metal' | 'widthCm' | 'heightCm' | 'projectionCm' | 'quantity'
  >,
  offerPercent: number,
) => {
  const itemAreaSquareMeters = computeItemAreaSquareMeters(request);
  const pricePerSquareMeter = websitePricePerSquareMeter(
    priceList,
    request.designId,
    request.metal,
  );

  const estimate =
    pricePerSquareMeter === null
      ? null
      : Math.round(
          itemAreaSquareMeters * request.quantity * pricePerSquareMeter,
        );

  return {
    areaSquareMeters: roundTo(itemAreaSquareMeters * request.quantity, 2),
    pricePerSquareMeter,
    estimate,
    offerPercent,
    // The site shows this month's discount; the order total in the CRM stays at list price.
    discountedEstimate:
      estimate === null
        ? null
        : Math.round((estimate * (100 - offerPercent)) / 100),
  };
};

export const buildWebsiteCatalog = (
  designs: { id: string; name: string | null }[],
  priceList: PriceListEntry[],
) => {
  const pricesFor = (designId: string | null) =>
    Object.fromEntries(
      WEBSITE_METALS.map((metal) => [
        metal,
        websitePricePerSquareMeter(priceList, designId, metal),
      ]),
    ) as Record<WebsiteMetal, number | null>;

  return {
    designs: designs.map((design) => ({
      id: design.id,
      name: design.name ?? '',
      prices: pricesFor(design.id),
    })),
    defaultPrices: pricesFor(null),
  };
};

export type RequestWindow = { startedAt: number; count: number };

// Fixed one-hour window per visitor IP; the first request after it ends starts a new one.
export const countInWindow = (
  previous: RequestWindow | null,
  now: number,
  windowMs: number,
): RequestWindow =>
  previous !== null && now - previous.startedAt < windowMs
    ? { startedAt: previous.startedAt, count: previous.count + 1 }
    : { startedAt: now, count: 1 };
