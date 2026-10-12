import {
  type ContractTerms,
  currentTermsKeyLike,
} from 'src/contract/contract-document';
import { formatWhole } from 'src/ui/format';

type StoredTerms = {
  total: number;
  openings: string[];
  extras: string[];
  paintColor: string;
};

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

const readTerms = (termsKey: string): StoredTerms | null => {
  try {
    const parsed: unknown = JSON.parse(termsKey);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'total' in parsed &&
      'openings' in parsed &&
      typeof parsed.total === 'number' &&
      Array.isArray(parsed.openings)
    ) {
      return {
        total: parsed.total,
        openings: stringsOf(parsed.openings),
        extras: 'extras' in parsed ? stringsOf(parsed.extras) : [],
        paintColor:
          'paintColor' in parsed && typeof parsed.paintColor === 'string'
            ? parsed.paintColor
            : '',
      };
    }
  } catch {
    return null;
  }

  return null;
};

// A stored entry is ours, but a hand-edited or truncated one must not take
// the order page down with it.
const quantityOf = (entry: string): number => {
  try {
    const parsed: unknown = JSON.parse(entry);
    const quantity = Array.isArray(parsed) ? parsed[5] : undefined;

    return typeof quantity === 'number' ? quantity : 1;
  } catch {
    return 1;
  }
};

const countOf = (entries: string[]) =>
  entries.reduce((sum, entry) => sum + quantityOf(entry), 0);

// Whether the order still matches what the client signed; a contract signed
// before terms were kept counts as unchanged.
export const isContractChanged = (
  signedTermsKey: string | null,
  current: ContractTerms,
): boolean =>
  signedTermsKey !== null &&
  signedTermsKey !== currentTermsKeyLike(signedTermsKey, current);

// What changed since the client signed, in words for the order page; an empty
// list when the signed terms still hold.
export const describeContractChange = (
  signedTermsKey: string | null,
  current: ContractTerms,
): string[] => {
  if (!isContractChanged(signedTermsKey, current)) return [];

  const signed = signedTermsKey === null ? null : readTerms(signedTermsKey);
  const now =
    signedTermsKey === null
      ? null
      : readTerms(currentTermsKeyLike(signedTermsKey, current));

  if (signed === null || now === null) return ['изменились условия заказа'];

  const changes: string[] = [];

  if (signed.total !== now.total) {
    changes.push(
      `Итого ${formatWhole(signed.total)} → ${formatWhole(now.total)} сум`,
    );
  }

  const signedCount = countOf(signed.openings);
  const nowCount = countOf(now.openings);

  if (signedCount !== nowCount) {
    changes.push(`проёмов ${signedCount} → ${nowCount}`);
  } else if (JSON.stringify(signed.openings) !== JSON.stringify(now.openings)) {
    changes.push('изменились размеры или решётка');
  }

  if (JSON.stringify(signed.extras) !== JSON.stringify(now.extras)) {
    changes.push('изменились козырьки или услуги');
  }

  if (signed.paintColor !== now.paintColor) {
    changes.push('изменился цвет покраски');
  }

  return changes.length > 0 ? changes : ['изменились условия заказа'];
};
