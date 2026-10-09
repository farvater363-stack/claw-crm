import {
  type ContractData,
  contractTermsKey,
} from 'src/contract/contract-document';
import { formatWhole } from 'src/ui/format';

type StoredTerms = { total: number; openings: string[] };

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
        openings: parsed.openings.filter(
          (entry): entry is string => typeof entry === 'string',
        ),
      };
    }
  } catch {
    return null;
  }

  return null;
};

const countOf = (entries: string[]) =>
  entries.reduce((sum, entry) => {
    const quantity = (JSON.parse(entry) as unknown[])[5];

    return sum + (typeof quantity === 'number' ? quantity : 1);
  }, 0);

// What changed since the client signed, in words for the order page; an empty
// list when the signed terms still hold.
export const describeContractChange = (
  signedTermsKey: string | null,
  current: Pick<ContractData, 'total' | 'openings'>,
): string[] => {
  const currentKey = contractTermsKey(current);

  if (signedTermsKey === null || signedTermsKey === currentKey) return [];

  const signed = readTerms(signedTermsKey);
  const now = readTerms(currentKey);

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

  return changes.length > 0 ? changes : ['изменились условия заказа'];
};
