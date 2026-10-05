import { isNonEmptyString } from '@sniptt/guards';
import { CurrencyCode } from 'twenty-shared/constants';

type ResolveCurrencyFieldInputCodeArgs = {
  draftCurrencyCode?: CurrencyCode | null;
  recordCurrencyCode?: CurrencyCode | null;
  defaultCurrencyCode?: string | null;
};

type ResolvedCurrencyFieldInputCode = {
  currencyCode: CurrencyCode;
  // undefined: the picker offers every currency
  allowedCurrencyCodes: CurrencyCode[] | undefined;
};

export const resolveCurrencyFieldInputCode = ({
  draftCurrencyCode,
  recordCurrencyCode,
  defaultCurrencyCode,
}: ResolveCurrencyFieldInputCodeArgs): ResolvedCurrencyFieldInputCode => {
  // The default is stored SQL-quoted ("'UZS'").
  const defaultCurrencyCodeWithoutSQLQuotes = defaultCurrencyCode?.replace(
    /'/g,
    '',
  );

  // A field that names its currency takes values in that currency only, so a
  // value stored or typed in another one is brought back to it.
  if (isNonEmptyString(defaultCurrencyCodeWithoutSQLQuotes)) {
    const currencyCode = defaultCurrencyCodeWithoutSQLQuotes as CurrencyCode;

    return { currencyCode, allowedCurrencyCodes: [currencyCode] };
  }

  return {
    currencyCode: isNonEmptyString(draftCurrencyCode)
      ? draftCurrencyCode
      : isNonEmptyString(recordCurrencyCode)
        ? recordCurrencyCode
        : CurrencyCode.USD,
    allowedCurrencyCodes: undefined,
  };
};
