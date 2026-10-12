import { describe, expect, it } from 'vitest';

import { contractTermsKey } from 'src/contract/contract-document';
import { nextContractState } from 'src/contract/sync-contract-state';
import { SAMPLE_CONTRACT_DATA } from 'src/contract/__tests__/contract-fixtures';

const SIGNED_KEY = contractTermsKey(SAMPLE_CONTRACT_DATA);
const CHANGED_TERMS = { ...SAMPLE_CONTRACT_DATA, total: 5_000_000 };

describe('the order’s «Договор» state', () => {
  it('is left alone on an order nobody signed', () => {
    expect(
      nextContractState({
        currentState: 'NONE',
        signedTermsKey: undefined,
        terms: SAMPLE_CONTRACT_DATA,
      }),
    ).toBeNull();
  });

  it('becomes «Изменился после подписи» once the signed terms change', () => {
    expect(
      nextContractState({
        currentState: 'SIGNED',
        signedTermsKey: SIGNED_KEY,
        terms: CHANGED_TERMS,
      }),
    ).toBe('CHANGED');
  });

  it('returns to «Подписан» when the order is put back as signed', () => {
    expect(
      nextContractState({
        currentState: 'CHANGED',
        signedTermsKey: SIGNED_KEY,
        terms: SAMPLE_CONTRACT_DATA,
      }),
    ).toBe('SIGNED');
  });

  it('writes nothing when the state is already right', () => {
    expect(
      nextContractState({
        currentState: 'SIGNED',
        signedTermsKey: SIGNED_KEY,
        terms: SAMPLE_CONTRACT_DATA,
      }),
    ).toBeNull();
    expect(
      nextContractState({
        currentState: 'CHANGED',
        signedTermsKey: SIGNED_KEY,
        terms: CHANGED_TERMS,
      }),
    ).toBeNull();
  });

  it('treats a malformed signed key as changed rather than failing', () => {
    expect(
      nextContractState({
        currentState: 'SIGNED',
        signedTermsKey: '{not json',
        terms: SAMPLE_CONTRACT_DATA,
      }),
    ).toBe('CHANGED');
  });
});
