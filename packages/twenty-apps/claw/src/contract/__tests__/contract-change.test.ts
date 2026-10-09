import { describe, expect, it } from 'vitest';

import { describeContractChange } from 'src/contract/contract-change';
import { contractTermsKey } from 'src/contract/contract-document';
import { SAMPLE_CONTRACT_DATA } from 'src/contract/__tests__/contract-fixtures';

const SIGNED_KEY = contractTermsKey(SAMPLE_CONTRACT_DATA);

describe('what changed after the client signed', () => {
  it('is nothing while the sizes and the sum are as signed', () => {
    expect(describeContractChange(SIGNED_KEY, SAMPLE_CONTRACT_DATA)).toEqual(
      [],
    );
  });

  it('names the new total and the new count of проёмы', () => {
    const [first] = SAMPLE_CONTRACT_DATA.openings;

    expect(
      describeContractChange(SIGNED_KEY, {
        total: 5_320_000,
        openings: [
          ...SAMPLE_CONTRACT_DATA.openings,
          { ...first, title: 'Проём 4', widthCm: 90 },
        ],
      }),
    ).toEqual(['Итого 4,860,000 → 5,320,000 сум', 'проёмов 4 → 5']);
  });

  it('says the sizes changed when the count stays', () => {
    const [first, ...rest] = SAMPLE_CONTRACT_DATA.openings;

    expect(
      describeContractChange(SIGNED_KEY, {
        total: SAMPLE_CONTRACT_DATA.total,
        openings: [{ ...first, heightCm: 181 }, ...rest],
      }),
    ).toEqual(['изменились размеры или решётка']);
  });
});
