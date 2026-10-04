import { describe, expect, it } from 'vitest';

import {
  balanceWarning,
  buildPayment,
  buildStepWrite,
  canCancel,
  currentStepKey,
  materialSentence,
  moneySentence,
  nextStepOf,
  ORDER_STEPS,
  type StepDraft,
} from 'src/order-header/order-steps';

// Thousands are separated by a no-break space; tests compare with plain ones.
const plain = (value: string) => value.replace(/\s/g, ' ');

const draft = (overrides: Partial<StepDraft>): StepDraft => ({
  measurerId: '',
  measurementDate: '',
  masterId: '',
  installerId: '',
  ...overrides,
});

describe('ORDER_STEPS', () => {
  it('lists the six steps of the board with their status labels', () => {
    expect(ORDER_STEPS).toEqual([
      { status: 'NEW', label: 'Новый' },
      { status: 'MEASUREMENT_SCHEDULED', label: 'Замер назначен' },
      { status: 'MEASURED', label: 'Замер выполнен' },
      { status: 'PRODUCTION', label: 'Производство' },
      { status: 'QUALITY_CHECK', label: 'Отправлено на установку' },
      { status: 'INSTALLED', label: 'Установлен' },
    ]);
  });
});

describe('nextStepOf', () => {
  const none = { hasMaster: false, hasInstaller: false };

  it('schedules the measurement from a new order', () => {
    expect(nextStepOf({ status: 'NEW', ...none })).toEqual({
      label: 'Назначить замер',
      nextStatus: 'MEASUREMENT_SCHEDULED',
      opensMeasurementForm: false,
      ask: 'MEASURER_AND_DATE',
    });
  });

  it('sends a scheduled order to the measurement form and writes nothing', () => {
    expect(nextStepOf({ status: 'MEASUREMENT_SCHEDULED', ...none })).toEqual({
      label: 'Замер сделан',
      nextStatus: null,
      opensMeasurementForm: true,
      ask: null,
    });
  });

  it('asks for a master on the way to production only when there is none', () => {
    expect(nextStepOf({ status: 'MEASURED', ...none })).toEqual({
      label: 'В производство',
      nextStatus: 'PRODUCTION',
      opensMeasurementForm: false,
      ask: 'MASTER',
    });
    expect(
      nextStepOf({ status: 'MEASURED', hasMaster: true, hasInstaller: false })
        ?.ask,
    ).toBeNull();
  });

  it('offers an installer when production ends, without requiring one', () => {
    expect(nextStepOf({ status: 'PRODUCTION', ...none })).toEqual({
      label: 'Отправить на установку',
      nextStatus: 'QUALITY_CHECK',
      opensMeasurementForm: false,
      ask: 'INSTALLER_OPTIONAL',
    });
    expect(
      nextStepOf({ status: 'PRODUCTION', hasMaster: true, hasInstaller: true })
        ?.ask,
    ).toBeNull();
  });

  it('requires an installer to mark the order installed', () => {
    expect(nextStepOf({ status: 'QUALITY_CHECK', ...none })).toEqual({
      label: 'Установлен',
      nextStatus: 'INSTALLED',
      opensMeasurementForm: false,
      ask: 'INSTALLER',
    });
    expect(
      nextStepOf({
        status: 'QUALITY_CHECK',
        hasMaster: true,
        hasInstaller: true,
      })?.ask,
    ).toBeNull();
  });

  it.each([
    'INSTALLED',
    'CANCELLED',
    'PRICE_APPROVAL',
    'READY',
    'CLOSED',
    'SOMETHING_ELSE',
    null,
  ])('has no next step from %s', (status) => {
    expect(nextStepOf({ status, ...none })).toBeNull();
  });
});

describe('currentStepKey and canCancel', () => {
  it('marks a step only for a status of the board', () => {
    expect(currentStepKey('PRODUCTION')).toBe('PRODUCTION');
    expect(currentStepKey('CANCELLED')).toBeNull();
    expect(currentStepKey('READY')).toBeNull();
    expect(currentStepKey(null)).toBeNull();
  });

  it('lets every order be cancelled except a cancelled one', () => {
    expect(canCancel('NEW')).toBe(true);
    expect(canCancel('INSTALLED')).toBe(true);
    expect(canCancel(null)).toBe(true);
    expect(canCancel('CANCELLED')).toBe(false);
  });
});

describe('moneySentence', () => {
  it('names the total with its unit, then what is paid and what is left', () => {
    expect(
      plain(
        moneySentence({ total: 1_410_000, paid: 500_000, balance: 910_000 }),
      ),
    ).toBe('Итого 1 410 000 сум · оплачено 500 000 · остаток 910 000');
  });

  it('counts the balance itself when the order has none stored yet', () => {
    expect(
      plain(moneySentence({ total: 300_000, paid: null, balance: null })),
    ).toBe('Итого 300 000 сум · оплачено 0 · остаток 300 000');
  });

  it('says who names the price when the total is unknown', () => {
    expect(moneySentence({ total: null, paid: null, balance: null })).toBe(
      'Цену назовёт менеджер',
    );
  });
});

describe('materialSentence', () => {
  it('says nothing while the order holds no material', () => {
    expect(materialSentence({ state: null, note: null })).toBeNull();
  });

  it('is calm when there is enough', () => {
    expect(materialSentence({ state: 'ENOUGH', note: null })).toEqual({
      text: 'Материал: хватает',
      tone: 'neutral',
    });
  });

  it('shows the note of a shortage in red and of a missing composition in amber', () => {
    expect(
      materialSentence({
        state: 'SHORTAGE',
        note: 'Не хватает: Профиль 20×20 — 10 м',
      }),
    ).toEqual({ text: 'Не хватает: Профиль 20×20 — 10 м', tone: 'danger' });
    expect(
      materialSentence({
        state: 'NO_NORM',
        note: 'Не указано, из чего делается: Волна',
      }),
    ).toEqual({
      text: 'Не указано, из чего делается: Волна',
      tone: 'warning',
    });
  });

  it('falls back to the state when the note is empty', () => {
    expect(materialSentence({ state: 'SHORTAGE', note: ' ' })).toEqual({
      text: 'Материал: не хватает',
      tone: 'danger',
    });
  });
});

describe('balanceWarning', () => {
  it('speaks only for an installed order that still owes', () => {
    expect(
      plain(balanceWarning({ status: 'INSTALLED', balance: 910_000 }) ?? ''),
    ).toBe('Остаток 910 000 сум');
    expect(balanceWarning({ status: 'INSTALLED', balance: 0 })).toBeNull();
    expect(balanceWarning({ status: 'INSTALLED', balance: null })).toBeNull();
    expect(
      balanceWarning({ status: 'PRODUCTION', balance: 910_000 }),
    ).toBeNull();
  });
});

describe('buildStepWrite', () => {
  it('needs a measurer and a date to schedule a measurement', () => {
    const input = {
      nextStatus: 'MEASUREMENT_SCHEDULED',
      ask: 'MEASURER_AND_DATE',
    } as const;

    expect(buildStepWrite({ ...input, draft: draft({}) })).toEqual({
      ok: false,
      error: 'Выберите замерщика',
    });
    expect(
      buildStepWrite({ ...input, draft: draft({ measurerId: 'member-1' }) }),
    ).toEqual({ ok: false, error: 'Укажите дату и время замера' });
    expect(
      buildStepWrite({
        ...input,
        draft: draft({
          measurerId: 'member-1',
          measurementDate: '2026-10-12T14:00',
        }),
      }),
    ).toEqual({
      ok: true,
      data: {
        status: 'MEASUREMENT_SCHEDULED',
        measurerId: 'member-1',
        measurementDate: new Date('2026-10-12T14:00').toISOString(),
      },
    });
  });

  it('needs a master when it asks for one', () => {
    const input = { nextStatus: 'PRODUCTION', ask: 'MASTER' } as const;

    expect(buildStepWrite({ ...input, draft: draft({}) })).toEqual({
      ok: false,
      error: 'Выберите мастера',
    });
    expect(
      buildStepWrite({ ...input, draft: draft({ masterId: 'worker-1' }) }),
    ).toEqual({
      ok: true,
      data: { status: 'PRODUCTION', masterId: 'worker-1' },
    });
  });

  it('takes an installer when one is picked and goes on without one', () => {
    const input = {
      nextStatus: 'QUALITY_CHECK',
      ask: 'INSTALLER_OPTIONAL',
    } as const;

    expect(buildStepWrite({ ...input, draft: draft({}) })).toEqual({
      ok: true,
      data: { status: 'QUALITY_CHECK' },
    });
    expect(
      buildStepWrite({ ...input, draft: draft({ installerId: 'worker-2' }) }),
    ).toEqual({
      ok: true,
      data: { status: 'QUALITY_CHECK', installerId: 'worker-2' },
    });
  });

  it('needs an installer to mark the order installed', () => {
    const input = { nextStatus: 'INSTALLED', ask: 'INSTALLER' } as const;

    expect(buildStepWrite({ ...input, draft: draft({}) })).toEqual({
      ok: false,
      error: 'Выберите установщика',
    });
    expect(
      buildStepWrite({ ...input, draft: draft({ installerId: 'worker-2' }) }),
    ).toEqual({
      ok: true,
      data: { status: 'INSTALLED', installerId: 'worker-2' },
    });
  });

  it('writes the status alone when there is nothing to ask', () => {
    expect(
      buildStepWrite({
        nextStatus: 'PRODUCTION',
        ask: null,
        // Left over from an earlier question: must not be written
        draft: draft({ masterId: 'worker-9', installerId: 'worker-8' }),
      }),
    ).toEqual({ ok: true, data: { status: 'PRODUCTION' } });
  });
});

describe('buildPayment', () => {
  const input = {
    method: 'CARD',
    comment: ' за решётки ',
    today: '2026-10-04',
  } as const;

  it('takes a whole sum above zero, dated today', () => {
    expect(buildPayment({ ...input, amount: '500 000' })).toEqual({
      ok: true,
      data: {
        amount: 500_000,
        method: 'CARD',
        comment: 'за решётки',
        paidOn: '2026-10-04',
      },
    });
  });

  it.each(['', '0', '-5', 'abc', '10,5'])('refuses «%s»', (amount) => {
    expect(buildPayment({ ...input, amount })).toEqual({
      ok: false,
      error: 'Введите число больше нуля',
    });
  });
});
