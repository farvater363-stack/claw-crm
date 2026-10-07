import { describe, expect, it } from 'vitest';

import {
  buildCallInput,
  checkCallDraft,
  EMPTY_CALL_DRAFT,
} from 'src/clients/call-draft';

const TODAY = '2026-10-06';

describe('checkCallDraft', () => {
  it('asks how the call ended before saving', () => {
    expect(checkCallDraft(EMPTY_CALL_DRAFT, TODAY)).toBe(
      'Выберите, чем закончился звонок',
    );
  });

  it('refuses a next call in the past', () => {
    expect(
      checkCallDraft(
        { result: 'REACHED', note: '', nextCallAt: '2026-10-05' },
        TODAY,
      ),
    ).toBe('Дата уже прошла. Выберите сегодня или позже');
  });

  it('accepts a call with no next call or one from today on', () => {
    expect(
      checkCallDraft({ result: 'REFUSED', note: '', nextCallAt: '' }, TODAY),
    ).toBeNull();
    expect(
      checkCallDraft({ result: 'AGREED', note: '', nextCallAt: TODAY }, TODAY),
    ).toBeNull();
  });
});

describe('buildCallInput', () => {
  it('names the call by its day and drops an empty note and date', () => {
    expect(
      buildCallInput({
        id: 'call-1',
        personId: 'person-1',
        orderId: null,
        draft: { result: 'NO_ANSWER', note: '   ', nextCallAt: '' },
        today: TODAY,
      }),
    ).toMatchObject({
      name: expect.stringMatching(/^Звонок 6 /),
      personId: 'person-1',
      result: 'NO_ANSWER',
      note: null,
      nextCallAt: null,
    });
  });
});
