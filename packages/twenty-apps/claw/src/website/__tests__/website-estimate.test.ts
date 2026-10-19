import { describe, expect, it } from 'vitest';

import { planOrderRecalc } from 'src/pricing/plan-order-recalc';
import { type PriceListEntry } from 'src/pricing/resolve-price-list-entry';
import {
  buildWebsiteCatalog,
  computeWebsiteEstimate,
  countInWindow,
  DEFAULT_METAL_SIZE,
  parseEstimateRequest,
  parseOfferPercent,
} from 'src/website/website-estimate';

const LUX_DESIGN_ID = '5b0c8f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
const BASIC_DESIGN_ID = '6c1d9a0f-2e3b-4d4c-8f9a-8b7c6d5e4f3a';
const HOUR = 60 * 60 * 1000;

const entry = (
  overrides: Partial<PriceListEntry> & Pick<PriceListEntry, 'metal'>,
): PriceListEntry => ({
  designId: null,
  metalSize: null,
  pricePerSquareMeter: null,
  costPerSquareMeter: null,
  ...overrides,
});

const PRICE_LIST = [
  entry({ metal: 'ROD', metalSize: 'SIZE_8', pricePerSquareMeter: 180_000 }),
  entry({ metal: 'ROD', metalSize: 'SIZE_10', pricePerSquareMeter: 200_000 }),
  entry({
    metal: 'PROFILE',
    metalSize: 'SIZE_15_15',
    pricePerSquareMeter: 220_000,
  }),
  entry({
    designId: LUX_DESIGN_ID,
    metal: 'PROFILE',
    metalSize: 'SIZE_15_15',
    pricePerSquareMeter: 260_000,
  }),
];

const VALID_BODY = {
  designId: LUX_DESIGN_ID,
  metal: 'PROFILE',
  widthCm: 140,
  heightCm: 150,
  projectionCm: 0,
  quantity: 2,
  name: '  Ali ',
  phone: '90 123 45 67',
  language: 'uz',
  website: '',
};

describe('parseEstimateRequest', () => {
  it('normalizes a valid request', () => {
    expect(parseEstimateRequest(VALID_BODY)).toEqual({
      isValid: true,
      isBot: false,
      request: {
        designId: LUX_DESIGN_ID,
        metal: 'PROFILE',
        widthCm: 140,
        heightCm: 150,
        projectionCm: 0,
        quantity: 2,
        clientName: 'Ali',
        clientPhone: '+998901234567',
        language: 'uz',
      },
    });
  });

  it('accepts no design', () => {
    const parsed = parseEstimateRequest({ ...VALID_BODY, designId: null });

    expect(parsed.isValid && parsed.request.designId).toBeNull();
  });

  it('flags a filled honeypot as a bot', () => {
    const parsed = parseEstimateRequest({ ...VALID_BODY, website: 'x' });

    expect(parsed.isValid && parsed.isBot).toBe(true);
  });

  it.each([
    [{ metal: 'GOLD' }, 'INVALID_CHOICE'],
    [{ designId: 'not-a-uuid' }, 'INVALID_CHOICE'],
    [{ language: 'en' }, 'INVALID_CHOICE'],
    [{ widthCm: 5 }, 'INVALID_SIZE'],
    [{ heightCm: '150' }, 'INVALID_SIZE'],
    [{ projectionCm: -1 }, 'INVALID_SIZE'],
    [{ quantity: 1.5 }, 'INVALID_SIZE'],
    [{ name: '   ' }, 'INVALID_NAME'],
    [{ phone: '12345' }, 'INVALID_PHONE'],
  ])('rejects %o with %s', (override, error) => {
    expect(parseEstimateRequest({ ...VALID_BODY, ...override })).toEqual({
      isValid: false,
      error,
    });
  });

  it('rejects a body that is not an object', () => {
    expect(parseEstimateRequest(null)).toEqual({
      isValid: false,
      error: 'INVALID_CHOICE',
    });
  });
});

describe('parseOfferPercent', () => {
  it.each([
    ['10', 10],
    ['0', 0],
    ['50', 50],
    ['51', 0],
    ['7.5', 0],
    ['-5', 0],
    ['abc', 0],
    [undefined, 0],
  ])('reads %s as %d', (raw, percent) => {
    expect(parseOfferPercent(raw)).toBe(percent);
  });
});

describe('computeWebsiteEstimate', () => {
  it('prices a flat grille with the design-specific row and the monthly offer', () => {
    expect(
      computeWebsiteEstimate(
        PRICE_LIST,
        {
          designId: LUX_DESIGN_ID,
          metal: 'PROFILE',
          widthCm: 140,
          heightCm: 150,
          projectionCm: 0,
          quantity: 2,
        },
        10,
      ),
    ).toEqual({
      areaSquareMeters: 4.2,
      pricePerSquareMeter: 260_000,
      estimate: 1_092_000,
      offerPercent: 10,
      discountedEstimate: 982_800,
    });
  });

  it('adds the projection area of a convex grille at the default rod size', () => {
    expect(
      computeWebsiteEstimate(
        PRICE_LIST,
        {
          designId: null,
          metal: 'ROD',
          widthCm: 140,
          heightCm: 150,
          projectionCm: 30,
          quantity: 1,
        },
        0,
      ),
    ).toEqual({
      areaSquareMeters: 3.84,
      pricePerSquareMeter: 180_000,
      estimate: 691_200,
      offerPercent: 0,
      discountedEstimate: 691_200,
    });
  });

  it('has no estimate when the metal has no price', () => {
    expect(
      computeWebsiteEstimate(
        PRICE_LIST,
        {
          designId: null,
          metal: 'REBAR',
          widthCm: 100,
          heightCm: 100,
          projectionCm: 0,
          quantity: 1,
        },
        10,
      ).estimate,
    ).toBeNull();
  });

  it('equals the order total the CRM recalc saves for the same item', () => {
    const request = {
      designId: LUX_DESIGN_ID,
      metal: 'PROFILE',
      widthCm: 137,
      heightCm: 152,
      projectionCm: 25,
      quantity: 3,
    } as const;

    const plan = planOrderRecalc({
      order: {
        areaSquareMeters: null,
        total: null,
        prepayment: null,
        balance: null,
        costTotal: null,
        margin: null,
        marginPercent: null,
        productionStartDate: null,
        installationDeadline: null,
        installedAt: null,
        readyAt: null,
        daysLate: null,
        masterBonus: null,
        masterPayCalculated: null,
        masterPenalty: null,
        masterPayTotal: null,
        status: 'NEW',
        deadlineState: null,
      },
      items: [
        {
          id: 'item-1',
          name: null,
          designId: request.designId,
          metal: request.metal,
          metalSize: DEFAULT_METAL_SIZE[request.metal],
          widthCm: request.widthCm,
          heightCm: request.heightCm,
          projectionCm: request.projectionCm,
          quantity: request.quantity,
          areaSquareMeters: null,
          pricePerSquareMeter: null,
          costPerSquareMeter: null,
          lineTotal: null,
          lineCost: null,
        },
      ],
      extraServiceLines: [],
      extraServiceCatalog: [],
      priceList: PRICE_LIST,
      master: null,
      today: '2026-10-02',
      refreshPriceItemIds: [],
      refreshPriceExtraServiceLineIds: [],
    });

    expect(plan.orderUpdate.total).toBe(
      computeWebsiteEstimate(PRICE_LIST, request, 0).estimate,
    );
  });
});

describe('buildWebsiteCatalog', () => {
  it('lists each design with its price per metal', () => {
    expect(
      buildWebsiteCatalog(
        [
          { id: LUX_DESIGN_ID, name: 'Люкс' },
          { id: BASIC_DESIGN_ID, name: null },
        ],
        PRICE_LIST,
      ),
    ).toEqual({
      designs: [
        {
          id: LUX_DESIGN_ID,
          name: 'Люкс',
          prices: { ROD: 180_000, PROFILE: 260_000, REBAR: null },
        },
        {
          id: BASIC_DESIGN_ID,
          name: '',
          prices: { ROD: 180_000, PROFILE: 220_000, REBAR: null },
        },
      ],
      defaultPrices: { ROD: 180_000, PROFILE: 220_000, REBAR: null },
    });
  });
});

describe('countInWindow', () => {
  it('starts a window on the first request', () => {
    expect(countInWindow(null, 1_000, HOUR)).toEqual({
      startedAt: 1_000,
      count: 1,
    });
  });

  it('counts requests inside the window', () => {
    expect(countInWindow({ startedAt: 1_000, count: 4 }, 2_000, HOUR)).toEqual({
      startedAt: 1_000,
      count: 5,
    });
  });

  it('starts over once the window has passed', () => {
    expect(
      countInWindow({ startedAt: 1_000, count: 9 }, 1_000 + HOUR, HOUR),
    ).toEqual({ startedAt: 1_000 + HOUR, count: 1 });
  });
});
