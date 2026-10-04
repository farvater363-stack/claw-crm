import { useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';

import {
  MASTER_PAYMENT_KIND_OPTIONS,
  type MasterPaymentKind,
  PAY_METHOD_OPTIONS,
  type PayMethod,
  WORKER_CATEGORY_OPTIONS,
  type WorkerCategory,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { computeMonthlyPayroll, type PayrollRow } from 'src/payroll/compute-monthly-payroll';
import {
  createPayment,
  loadPayrollData,
  type PayrollData,
  type PayrollScreenWorker,
  removePayRule,
  savePayRule,
  saveWorker,
  updateWorker,
  type WorkerChange,
} from 'src/payroll/load-payroll-data';
import { type PayRule, type PayWork } from 'src/payroll/pay-rules';
import { buildPaymentInput } from 'src/payroll/payment-draft';
import { currentMonthInTashkent, formatMonthLabel, shiftMonth } from 'src/payroll/payroll-month';
import {
  buildPayRule,
  buildWorker,
  carrySentence,
  CATEGORY_REQUIRED,
  earnedHeading,
  listMonthOrders,
  parsePenaltyPercent,
  payRuleLabel,
  payRuleSuffix,
  payRuleValue,
  payRuleValueLabel,
  paymentText,
  payWorksOf,
  rowTitle,
  skippedNote,
  summarizeEarned,
  withCategory,
} from 'src/payroll/payroll-screen';
import { todayInTashkent } from 'src/pricing/dates';
import { formatMoney } from 'src/ui/format';
import {
  Button,
  Checkbox,
  Columns,
  EmptyState,
  ErrorNote,
  Field,
  Hint,
  InlineConfirm,
  Line,
  Link,
  Row,
  Screen,
  Section,
  SelectInput,
  SkeletonRows,
  StaticRow,
  TextInput,
  Wrap,
} from 'src/ui/kit';
import { dropKey } from 'src/utils/drop-key';
import { isAccessError } from 'src/utils/is-access-error';
import { randomUuid } from 'src/utils/random-uuid';

type LoadState =
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'error' }
  | { status: 'ready'; data: PayrollData };

// The one form shown at a time; each has the screen's primary button.
type Panel = 'pay' | 'rule' | 'worker';
type PayForm = { kind: MasterPaymentKind; amount: string; comment: string };
type NewRule = { method: PayMethod; work: PayWork | null; value: string };
type NewWorker = { name: string; categories: WorkerCategory[] };

const SAVED_TICK_MS = 2_000;
const NO_ACCESS = 'Доступно только владельцу';
const LOAD_FAILED = 'Не удалось загрузить ЗП. Проверьте интернет и нажмите "Повторить"';
const SAVE_FAILED = 'Не удалось сохранить. Проверьте интернет и нажмите "Повторить"';
const EMPTY_TEXT =
  'Добавьте тех, кому платите: мастеров, установщиков, замерщиков. Приложение посчитает, сколько кому выплатить.';
const NEW_RULE: NewRule = { method: 'PER_SQUARE_METER', work: 'MASTER', value: '' };
const NEW_WORKER: NewWorker = { name: '', categories: [] };
const ADD_KEY = 'add';

const readState = async (month: string): Promise<LoadState> => {
  try {
    return { status: 'ready', data: await loadPayrollData(new CoreApiClient(), month) };
  } catch (error) {
    console.error(error);

    return isAccessError(error) ? { status: 'forbidden' } : { status: 'error' };
  }
};

const Payroll = () => {
  const [month, setMonth] = useState(currentMonthInTashkent);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [payForm, setPayForm] = useState<PayForm | null>(null);
  const [newRule, setNewRule] = useState<NewRule>(NEW_RULE);
  const [newWorker, setNewWorker] = useState<NewWorker>(NEW_WORKER);
  const [confirmRuleId, setConfirmRuleId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // What was chosen in a select or a checkbox, shown until the server's answer is read back.
  const [pendingChanges, setPendingChanges] = useState<Record<string, WorkerChange>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [busyKeys, setBusyKeys] = useState<string[]>([]);
  const [failures, setFailures] = useState<Record<string, { isDenied: boolean; retry: () => void }>>({});
  // State read inside a handler is the one of the render that made the handler;
  // a second tap in the same render would pass a check on it. A ref is current.
  const inFlight = useRef(new Set<string>());
  const attemptIds = useRef<Record<string, string>>({});
  const shownMonth = useRef(month);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    const firstMonth = shownMonth.current;

    void readState(firstMonth).then((next) => {
      if (shownMonth.current === firstMonth) setLoad(next);
    });

    return () => pending.forEach(clearTimeout);
  }, []);

  // A read that lands after the month was changed again is dropped.
  const read = async (shown: string) => {
    const next = await readState(shown);

    if (shownMonth.current === shown) setLoad(next);
  };

  const setDraft = (key: string, value: string) => setDrafts((current) => ({ ...current, [key]: value }));
  const setError = (key: string, error: string) => setErrors((current) => ({ ...current, [key]: error }));
  const clearError = (key: string) => setErrors((current) => dropKey(current, key));
  const clearDraft = (key: string) => {
    setDrafts((current) => dropKey(current, key));
    clearError(key);
  };
  // What was typed while its save was on the way is newer than the save and stays in the field.
  const settleDraft = (key: string, sent: string) =>
    setDrafts((current) => (current[key] === sent ? dropKey(current, key) : current));

  const showSaved = (key: string) => {
    setSavedKey(key);

    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setSavedKey((current) => (current === key ? null : current));
    }, SAVED_TICK_MS);

    timers.current.add(timer);
  };

  // A request whose answer was lost may already be stored. One attempt at a
  // create keeps one id until it goes through, so its retry overwrites that record.
  const attemptId = (key: string) => {
    attemptIds.current[key] ??= randomUuid();

    return attemptIds.current[key];
  };
  const endAttempt = (key: string) => {
    attemptIds.current = dropKey(attemptIds.current, key);
  };

  // A key in flight is not started twice (a second tap, or Enter and the blur
  // that follows). Every write is followed by a read, so the row shows what
  // the server holds; the key stays busy until that read has landed.
  const run = async (key: string, write: () => Promise<void>, onSaved?: () => void) => {
    if (inFlight.current.has(key)) return;

    inFlight.current.add(key);
    setBusyKeys([...inFlight.current]);
    setFailures((current) => dropKey(current, key));
    setSavedKey(null);

    try {
      await write();
      await read(shownMonth.current);
      onSaved?.();
    } catch (error) {
      console.error(error);
      setFailures((current) => ({
        ...current,
        [key]: { isDenied: isAccessError(error), retry: () => void run(key, write, onSaved) },
      }));
    } finally {
      inFlight.current.delete(key);
      setBusyKeys([...inFlight.current]);
    }
  };

  const showMonth = (next: string) => {
    shownMonth.current = next;
    setMonth(next);
    setLoad({ status: 'loading' });
    // The payment's sum was filled in from the month that is left.
    setPayForm(null);
    setPanel((current) => (current === 'pay' ? null : current));
    void read(next);
  };

  const switcher = (
    <Wrap>
      <Button label="Предыдущий месяц" onClick={() => showMonth(shiftMonth(month, -1))}>
        ‹
      </Button>
      <span>{formatMonthLabel(month)}</span>
      <Button label="Следующий месяц" onClick={() => showMonth(shiftMonth(month, 1))}>
        ›
      </Button>
    </Wrap>
  );

  if (load.status === 'loading') {
    return (
      <Screen title="ЗП" action={switcher}>
        <SkeletonRows count={5} />
      </Screen>
    );
  }

  if (load.status === 'forbidden') {
    return (
      <Screen title="ЗП">
        <Hint text={NO_ACCESS} />
      </Screen>
    );
  }

  if (load.status === 'error') {
    return (
      <Screen title="ЗП" action={switcher}>
        <ErrorNote text={LOAD_FAILED} onRetry={() => showMonth(month)} />
      </Screen>
    );
  }

  const { data } = load;
  const workers = data.workers.map((worker) =>
    Object.entries(pendingChanges).reduce(
      (shown, [key, change]) => (key.startsWith(`${worker.id}:`) ? { ...shown, ...change } : shown),
      worker,
    ),
  );
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const rows = computeMonthlyPayroll({
    month,
    // A worker who left and is owed nothing has no row. The open row stays
    // while it is open, so «Работает» unticked by mistake can be ticked back.
    workers: workers.map((worker) => (worker.id === openId ? { ...worker, isActive: true } : worker)),
    accruals: data.accruals,
    payments: data.payments,
  });
  const skipped = skippedNote(data.skipped);

  // Closing a form drops what it held and what was said about it. The id of
  // its attempt stays: a create that failed may still have been stored.
  const closePanel = (key: string) => {
    setPanel(null);
    clearError(key);
    setFailures((current) => dropKey(current, key));
  };

  // What is typed in a row belongs to that row; the new worker's form is not a row's.
  const showRow = (workerId: string | null) => {
    setOpenId(workerId);
    setPanel((current) => (current === 'worker' ? current : null));
    setPayForm(null);
    setNewRule(NEW_RULE);
    setConfirmRuleId(null);
    setDrafts({});
    setErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key === ADD_KEY)),
    );
  };

  const changeWorker = (workerId: string, field: string, change: WorkerChange) => {
    const key = `${workerId}:${field}`;

    if (inFlight.current.has(key)) return;

    setPendingChanges((current) => ({ ...current, [key]: change }));
    void run(
      key,
      () => updateWorker(new CoreApiClient(), workerId, change),
      () => {
        setPendingChanges((current) => dropKey(current, key));
        showSaved(key);
      },
    );
  };

  const toggleCategory = (worker: PayrollScreenWorker, category: WorkerCategory, isChecked: boolean) => {
    const key = `${worker.id}:categories`;
    const categories = withCategory(worker.categories, category, isChecked);

    if (categories.length === 0) {
      setError(key, CATEGORY_REQUIRED);

      return;
    }

    clearError(key);
    changeWorker(worker.id, 'categories', { categories });
  };

  const commitPenalty = (worker: PayrollScreenWorker) => {
    const key = `${worker.id}:penalty`;
    const draft = drafts[key];

    // TextInput commits on every blur, typed in or not.
    if (draft === undefined || inFlight.current.has(key)) return;

    const parsed = parsePenaltyPercent(draft);

    if (!parsed.ok) {
      setError(key, parsed.error);

      return;
    }

    if (parsed.value === worker.penaltyPercentPerDay) {
      clearDraft(key);

      return;
    }

    clearError(key);
    void run(
      key,
      () => updateWorker(new CoreApiClient(), worker.id, { penaltyPercentPerDay: parsed.value }),
      () => {
        settleDraft(key, draft);
        showSaved(key);
      },
    );
  };

  const commitRule = (rule: PayRule, rules: PayRule[]) => {
    const key = `${rule.id}:value`;
    const draft = drafts[key];

    if (draft === undefined || inFlight.current.has(key)) return;

    const built = buildPayRule({ ...rule, value: draft, existing: rules });

    if (!built.ok) {
      setError(key, built.error);

      return;
    }

    if (built.rule.amount === rule.amount && built.rule.percent === rule.percent) {
      clearDraft(key);

      return;
    }

    clearError(key);
    void run(
      key,
      () => savePayRule(new CoreApiClient(), built.rule),
      () => {
        settleDraft(key, draft);
        showSaved(key);
      },
    );
  };

  const saveNewRule = (workerId: string, rules: PayRule[], form: NewRule) => {
    const key = `${workerId}:rule`;
    const built = buildPayRule({ id: attemptId(key), workerId, ...form, existing: rules });

    if (!built.ok) {
      setError(key, built.error);

      return;
    }

    clearError(key);
    void run(
      key,
      async () => {
        await savePayRule(new CoreApiClient(), built.rule);
        endAttempt(key);
      },
      () => {
        setNewRule(NEW_RULE);
        setPanel((current) => (current === 'rule' ? null : current));
      },
    );
  };

  const openPay = (row: PayrollRow) => {
    const isSameRow = openId === row.workerId;

    if (!isSameRow) showRow(row.workerId);

    // A sum already typed for this row is kept when the form is opened again.
    if (!isSameRow || payForm === null) {
      setPayForm({ kind: 'SETTLEMENT', amount: row.owed > 0 ? String(row.owed) : '', comment: '' });
    }

    setPanel('pay');
  };

  const savePay = (row: PayrollRow, form: PayForm) => {
    const key = `${row.workerId}:pay`;
    const result = buildPaymentInput({
      kind: form.kind,
      masterId: row.workerId,
      masterName: row.workerName,
      amount: form.amount,
      paidOn: todayInTashkent(),
      comment: form.comment,
    });

    if (!result.isValid) {
      setError(key, result.error);

      return;
    }

    clearError(key);
    void run(
      key,
      async () => {
        await createPayment(new CoreApiClient(), attemptId(key), result.data);
        endAttempt(key);
      },
      () => {
        setPayForm(null);
        setPanel((current) => (current === 'pay' ? null : current));
      },
    );
  };

  const saveNewWorker = (form: NewWorker) => {
    const built = buildWorker(form);

    if (!built.ok) {
      setError(ADD_KEY, built.error);

      return;
    }

    const workerId = attemptId(ADD_KEY);

    clearError(ADD_KEY);
    void run(
      ADD_KEY,
      async () => {
        await saveWorker(new CoreApiClient(), workerId, built.data);
        endAttempt(ADD_KEY);
      },
      () => {
        setNewWorker(NEW_WORKER);
        setPanel(null);
        // Opened so the first pay rule can be added straight away.
        showRow(workerId);
      },
    );
  };

  const renderPayForm = (row: PayrollRow, form: PayForm) => {
    const key = `${row.workerId}:pay`;
    const close = () => {
      setPayForm(null);
      closePanel(key);
    };

    return (
      <>
        <Columns>
          {[
            <Field key="amount" label="Сумма" error={errors[key]}>
              <TextInput
                label="Сумма"
                inputMode="numeric"
                value={form.amount}
                suffix="сум"
                onChange={(amount) => setPayForm({ ...form, amount })}
                onEnter={() => savePay(row, form)}
                onCancel={close}
              />
            </Field>,
            <Field key="kind" label="Тип">
              <SelectInput
                label="Тип"
                value={form.kind}
                options={MASTER_PAYMENT_KIND_OPTIONS}
                onChange={(value) =>
                  setPayForm({
                    ...form,
                    kind: MASTER_PAYMENT_KIND_OPTIONS.find((option) => option.value === value)?.value ?? form.kind,
                  })
                }
              />
            </Field>,
            <Field key="comment" label="Комментарий">
              <TextInput
                label="Комментарий"
                value={form.comment}
                onChange={(comment) => setPayForm({ ...form, comment })}
                onEnter={() => savePay(row, form)}
                onCancel={close}
              />
            </Field>,
          ]}
        </Columns>
        {month === currentMonthInTashkent() ? null : <Hint text="Выплата запишется сегодняшним числом" />}
        <Wrap>
          <Button variant="primary" isWideOnPhone isBusy={busyKeys.includes(key)} onClick={() => savePay(row, form)}>
            Сохранить
          </Button>
          <Button variant="link" onClick={close}>
            Отмена
          </Button>
        </Wrap>
      </>
    );
  };

  const renderRule = (rule: PayRule, rules: PayRule[]) => {
    const key = `${rule.id}:value`;
    const label = payRuleLabel(rule);

    if (confirmRuleId === rule.id) {
      return (
        <InlineConfirm
          key={rule.id}
          question={`Убрать правило "${label}"?`}
          confirmText="Убрать"
          cancelText="Оставить"
          onConfirm={() =>
            void run(
              `${rule.id}:remove`,
              () => removePayRule(new CoreApiClient(), rule.id),
              () => setConfirmRuleId(null),
            )
          }
          onCancel={() => setConfirmRuleId(null)}
        />
      );
    }

    return (
      <Line
        key={rule.id}
        action={
          <Button variant="link" label={`Убрать правило ${label}`} onClick={() => setConfirmRuleId(rule.id)}>
            ✕
          </Button>
        }
      >
        <Field isInline label={label} error={errors[key]} isSaved={savedKey === key}>
          <TextInput
            label={label}
            inputMode={rule.method === 'PERCENT_OF_SALES' ? 'decimal' : 'numeric'}
            value={drafts[key] ?? payRuleValue(rule)}
            suffix={payRuleSuffix(rule.method)}
            onChange={(value) => setDraft(key, value)}
            onCommit={() => commitRule(rule, rules)}
            onCancel={() => clearDraft(key)}
          />
        </Field>
      </Line>
    );
  };

  const renderNewRule = (workerId: string, rules: PayRule[]) => {
    const key = `${workerId}:rule`;
    const works = payWorksOf(newRule.method);
    const valueLabel = payRuleValueLabel(newRule.method);
    const save = () => saveNewRule(workerId, rules, newRule);
    const close = () => {
      setNewRule(NEW_RULE);
      closePanel(key);
    };

    return (
      <>
        <Columns>
          {[
            <Field key="method" label="Способ">
              <SelectInput
                label="Способ"
                value={newRule.method}
                options={PAY_METHOD_OPTIONS}
                onChange={(value) => {
                  const method = PAY_METHOD_OPTIONS.find((option) => option.value === value)?.value ?? newRule.method;

                  // The work follows the method: a fixed pay has none, a percent is for sales only.
                  setNewRule({ ...newRule, method, work: payWorksOf(method)[0] ?? null });
                }}
              />
            </Field>,
            ...(works[0] === null
              ? []
              : [
                  <Field key="work" label="За что">
                    <SelectInput
                      label="За что"
                      value={newRule.work ?? ''}
                      options={WORKER_CATEGORY_OPTIONS.filter((option) => works.includes(option.value))}
                      onChange={(value) =>
                        setNewRule({ ...newRule, work: works.find((work) => work === value) ?? newRule.work })
                      }
                    />
                  </Field>,
                ]),
            <Field key="value" label={valueLabel} error={errors[key]}>
              <TextInput
                label={valueLabel}
                inputMode={newRule.method === 'PERCENT_OF_SALES' ? 'decimal' : 'numeric'}
                value={newRule.value}
                suffix={payRuleSuffix(newRule.method)}
                onChange={(value) => setNewRule({ ...newRule, value })}
                onEnter={save}
                onCancel={close}
              />
            </Field>,
          ]}
        </Columns>
        <Wrap>
          <Button variant="primary" isWideOnPhone isBusy={busyKeys.includes(key)} onClick={save}>
            Сохранить
          </Button>
          <Button variant="link" onClick={close}>
            Отмена
          </Button>
        </Wrap>
      </>
    );
  };

  const renderOpenRow = (row: PayrollRow, worker: PayrollScreenWorker) => {
    const rules = data.rules.filter((rule) => rule.workerId === row.workerId);
    const orders = listMonthOrders(row.lines);
    const categoriesKey = `${row.workerId}:categories`;
    const loginKey = `${row.workerId}:login`;
    const penaltyKey = `${row.workerId}:penalty`;
    // A login pays one worker: a member already linked to another worker is not offered.
    const loginOptions = [
      { value: '', label: '—' },
      ...data.logins
        .filter((login) => login.id === worker.loginId || !workers.some((other) => other.loginId === login.id))
        .map((login) => ({ value: login.id, label: login.name })),
    ];

    return (
      <>
        {panel === 'pay' && payForm ? renderPayForm(row, payForm) : null}
        <Hint text={`${earnedHeading(row.earned)}${row.lines.length > 0 ? ':' : ''}`} />
        {summarizeEarned(row.lines).map((text) => (
          <Hint key={text} text={text} />
        ))}
        <Hint text={carrySentence(row)} />
        {orders.length > 0 ? (
          <Wrap>
            <span>Заказы месяца:</span>
            {orders.map((order) => (
              <Link key={order.orderId} href={`/object/order/${order.orderId}`}>
                {order.text}
              </Link>
            ))}
          </Wrap>
        ) : null}
        {row.payments.length > 0 ? <Hint text={`Выплаты: ${row.payments.map(paymentText).join(' · ')}`} /> : null}
        <Wrap>
          <Link href="/objects/masterPayments">
            Все выплаты <span aria-hidden>›</span>
          </Link>
        </Wrap>
        <Wrap>
          <span>Кто:</span>
          {WORKER_CATEGORY_OPTIONS.map((option) => (
            <Checkbox
              key={option.value}
              label={option.label}
              isChecked={worker.categories.includes(option.value)}
              onChange={(isChecked) => toggleCategory(worker, option.value, isChecked)}
            />
          ))}
        </Wrap>
        {errors[categoriesKey] ? <Hint tone="danger" text={errors[categoriesKey]} /> : null}
        <Field isInline label="Логин" isSaved={savedKey === loginKey}>
          <SelectInput
            label="Логин"
            value={worker.loginId ?? ''}
            options={loginOptions}
            onChange={(value) => changeWorker(row.workerId, 'login', { loginId: value === '' ? null : value })}
          />
        </Field>
        <span>Как платим:</span>
        {rules.map((rule) => renderRule(rule, rules))}
        {panel === 'rule' ? (
          renderNewRule(row.workerId, rules)
        ) : (
          <Wrap>
            <Button onClick={() => setPanel('rule')}>+ Добавить правило</Button>
          </Wrap>
        )}
        <Field isInline label="Штраф" error={errors[penaltyKey]} isSaved={savedKey === penaltyKey}>
          <TextInput
            label="Штраф"
            inputMode="decimal"
            value={drafts[penaltyKey] ?? String(worker.penaltyPercentPerDay).replace('.', ',')}
            suffix="% в день"
            onChange={(value) => setDraft(penaltyKey, value)}
            onCommit={() => commitPenalty(worker)}
            onCancel={() => clearDraft(penaltyKey)}
          />
        </Field>
        <Checkbox
          label="Работает"
          isChecked={worker.isActive}
          onChange={(isActive) => changeWorker(row.workerId, 'active', { isActive })}
        />
      </>
    );
  };

  const renderRow = (row: PayrollRow) => {
    const worker = workerById.get(row.workerId);
    const isOpen = openId === row.workerId;

    if (worker === undefined) return null;

    return (
      <Row
        key={row.workerId}
        title={rowTitle(row)}
        value={formatMoney(row.owed)}
        action={<Button onClick={() => openPay(row)}>Выплатить</Button>}
        isOpen={isOpen}
        onToggle={() => showRow(isOpen ? null : row.workerId)}
      >
        {isOpen ? renderOpenRow(row, worker) : null}
      </Row>
    );
  };

  const renderNewWorker = () => {
    const close = () => {
      setNewWorker(NEW_WORKER);
      closePanel(ADD_KEY);
    };

    return (
      <StaticRow>
        <Field label="Имя" error={errors[ADD_KEY]}>
          <TextInput
            label="Имя"
            value={newWorker.name}
            onChange={(name) => setNewWorker({ ...newWorker, name })}
            onEnter={() => saveNewWorker(newWorker)}
            onCancel={close}
          />
        </Field>
        <Wrap>
          <span>Кто:</span>
          {WORKER_CATEGORY_OPTIONS.map((option) => (
            <Checkbox
              key={option.value}
              label={option.label}
              isChecked={newWorker.categories.includes(option.value)}
              onChange={(isChecked) =>
                setNewWorker({ ...newWorker, categories: withCategory(newWorker.categories, option.value, isChecked) })
              }
            />
          ))}
        </Wrap>
        <Wrap>
          <Button
            variant="primary"
            isWideOnPhone
            isBusy={busyKeys.includes(ADD_KEY)}
            onClick={() => saveNewWorker(newWorker)}
          >
            Сохранить
          </Button>
          <Button variant="link" onClick={close}>
            Отмена
          </Button>
        </Wrap>
      </StaticRow>
    );
  };

  if (rows.length === 0 && panel !== 'worker') {
    return (
      <Screen title="ЗП" action={switcher}>
        <EmptyState text={EMPTY_TEXT} actionText="Добавить работника" onAction={() => setPanel('worker')} />
      </Screen>
    );
  }

  const failureNotes = Object.entries(failures).map(([key, failure]) =>
    // Trying again cannot help a role that may not write here.
    failure.isDenied ? (
      <ErrorNote key={key} text={NO_ACCESS} />
    ) : (
      <ErrorNote key={key} text={SAVE_FAILED} onRetry={failure.retry} />
    ),
  );

  return (
    <Screen title="ЗП" action={switcher}>
      <Section
        title="Работники"
        footer={
          <Wrap>
            <Button onClick={() => setPanel('worker')}>+ Добавить работника</Button>
            <Link href="/objects/masters">
              Все работники <span aria-hidden>›</span>
            </Link>
          </Wrap>
        }
      >
        {/* Above the list, so a save that failed in a row closed since is still seen. */}
        {failureNotes.length > 0 ? <StaticRow>{failureNotes}</StaticRow> : null}
        {rows.map(renderRow)}
        {panel === 'worker' ? renderNewWorker() : null}
        {skipped === null ? null : (
          <StaticRow>
            <Hint tone="warning" text={skipped} />
          </StaticRow>
        )}
      </Section>
    </Screen>
  );
};

export default defineFrontComponent({
  universalIdentifier: IDS.payroll.frontComponent,
  name: 'payroll',
  description: 'ЗП работников за месяц: начисления, выплаты, остаток',
  component: Payroll,
});
