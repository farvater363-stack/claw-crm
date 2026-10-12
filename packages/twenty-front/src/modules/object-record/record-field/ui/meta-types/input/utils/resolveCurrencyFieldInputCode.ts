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

  // A field that names its currency takes new values in that currency only. A
  // value already stored in another one keeps it: changing the code without
  // converting the amount would change what it is worth.
  if (isNonEmptyString(defaultCurrencyCodeWithoutSQLQuotes)) {
    const fieldCurrencyCode =
      defaultCurrencyCodeWithoutSQLQuotes as CurrencyCode;
    const allowedCurrencyCodes =
      isNonEmptyString(recordCurrencyCode) &&
      recordCurrencyCode !== fieldCurrencyCode
        ? [fieldCurrencyCode, recordCurrencyCode]
        : [fieldCurrencyCode];
    const currencyCode =
      isNonEmptyString(draftCurrencyCode) &&
      allowedCurrencyCodes.includes(draftCurrencyCode)
        ? draftCurrencyCode
        : isNonEmptyString(recordCurrencyCode)
          ? recordCurrencyCode
          : fieldCurrencyCode;

    return { currencyCode, allowedCurrencyCodes };
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
