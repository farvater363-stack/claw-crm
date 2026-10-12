import { CurrencyCode } from 'twenty-shared/constants';

import { resolveCurrencyFieldInputCode } from '@/object-record/record-field/ui/meta-types/input/utils/resolveCurrencyFieldInputCode';

describe('resolveCurrencyFieldInputCode', () => {
  it('offers only the currency a field names as its default', () => {
    expect(
      resolveCurrencyFieldInputCode({
        draftCurrencyCode: undefined,
        recordCurrencyCode: undefined,
        defaultCurrencyCode: "'UZS'",
      }),
    ).toEqual({
      currencyCode: CurrencyCode.UZS,
      allowedCurrencyCodes: [CurrencyCode.UZS],
    });
  });

  it('keeps a value stored in another currency in that currency', () => {
    expect(
      resolveCurrencyFieldInputCode({
        draftCurrencyCode: undefined,
        recordCurrencyCode: CurrencyCode.USD,
        defaultCurrencyCode: "'UZS'",
      }),
    ).toEqual({
      currencyCode: CurrencyCode.USD,
      allowedCurrencyCodes: [CurrencyCode.UZS, CurrencyCode.USD],
    });
  });

  it('refuses a typed currency the field does not take', () => {
    expect(
      resolveCurrencyFieldInputCode({
        draftCurrencyCode: CurrencyCode.EUR,
        recordCurrencyCode: undefined,
        defaultCurrencyCode: "'UZS'",
      }),
    ).toEqual({
      currencyCode: CurrencyCode.UZS,
      allowedCurrencyCodes: [CurrencyCode.UZS],
    });
  });

  it('keeps every currency for a field without a default currency', () => {
    expect(
      resolveCurrencyFieldInputCode({
        draftCurrencyCode: CurrencyCode.EUR,
        recordCurrencyCode: CurrencyCode.USD,
        defaultCurrencyCode: undefined,
      }),
    ).toEqual({
      currencyCode: CurrencyCode.EUR,
      allowedCurrencyCodes: undefined,
    });
  });

  it('falls back to the stored currency, then to USD', () => {
    expect(
      resolveCurrencyFieldInputCode({
        draftCurrencyCode: undefined,
        recordCurrencyCode: CurrencyCode.EUR,
        defaultCurrencyCode: null,
      }).currencyCode,
    ).toBe(CurrencyCode.EUR);
    expect(
      resolveCurrencyFieldInputCode({
        draftCurrencyCode: undefined,
        recordCurrencyCode: undefined,
        defaultCurrencyCode: null,
      }).currencyCode,
    ).toBe(CurrencyCode.USD);
  });

  it.each([null, undefined, '', "''"])(
    'treats an empty default (%j) as no restriction',
    (defaultCurrencyCode) => {
      expect(
        resolveCurrencyFieldInputCode({
          draftCurrencyCode: undefined,
          recordCurrencyCode: undefined,
          defaultCurrencyCode,
        }).allowedCurrencyCodes,
      ).toBeUndefined();
    },
  );
});
