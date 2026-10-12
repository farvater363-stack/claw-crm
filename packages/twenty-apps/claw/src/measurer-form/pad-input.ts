import { groupThousands } from 'src/ui/format';

export type PadKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | ','
  | '000'
  | 'BACKSPACE';

// A size in cm has a decimal comma; a sum in сум is whole and grouped.
export type PadValueKind = 'decimal' | 'money';

const MAX_DIGITS = 12;

const countDigits = (value: string) => value.replace(/\D/g, '').length;

export const applyPadKey = (
  value: string,
  key: PadKey,
  kind: PadValueKind,
): string => {
  const plain = kind === 'money' ? value.replace(/[\s,]/g, '') : value;
  const regroup = (next: string) =>
    kind === 'money' ? groupThousands(next) : next;

  if (key === 'BACKSPACE') return regroup(plain.slice(0, -1));

  if (key === ',') {
    if (kind === 'money' || plain.includes(',') || plain.includes('.')) {
      return value;
    }

    return plain === '' ? '0,' : `${plain},`;
  }

  if (key === '000') {
    if (plain === '' || /^0+$/.test(plain)) return value;

    return countDigits(plain) + 3 > MAX_DIGITS ? value : regroup(`${plain}000`);
  }

  if (countDigits(plain) >= MAX_DIGITS) return value;

  // «0» then «5» is 5, not 05
  return regroup(plain === '0' ? key : `${plain}${key}`);
};

// What a physical keyboard types into a pad field: digits and one comma for a
// size (a dot becomes the comma), digits alone for a sum.
export const sanitizePadInput = (typed: string, kind: PadValueKind): string => {
  if (kind === 'money') return typed.replace(/[^\d,\s]/g, '');

  const normalized = typed.replace(/\./g, ',').replace(/[^\d,]/g, '');
  const commaIndex = normalized.indexOf(',');

  return commaIndex === -1
    ? normalized
    : `${normalized.slice(0, commaIndex + 1)}${normalized.slice(commaIndex + 1).replace(/,/g, '')}`;
};
