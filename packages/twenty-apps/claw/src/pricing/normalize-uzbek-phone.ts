const UZBEK_COUNTRY_CODE = '998';
const NATIONAL_NUMBER_LENGTH = 9;

export const normalizeUzbekPhone = (raw: string): string | null => {
  const digits = raw.replace(/\D/g, '');
  const national =
    digits.length === UZBEK_COUNTRY_CODE.length + NATIONAL_NUMBER_LENGTH &&
    digits.startsWith(UZBEK_COUNTRY_CODE)
      ? digits.slice(UZBEK_COUNTRY_CODE.length)
      : digits;

  return national.length === NATIONAL_NUMBER_LENGTH ? national : null;
};
