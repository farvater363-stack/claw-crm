import { useCallback, useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  AppPath,
  navigate,
  useSelectedRecordIds,
} from 'twenty-sdk/front-component';

import {
  CANCEL_REASON_OPTIONS,
  ORDER_STATUS_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethod,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import {
  formatUzbekNationalPhone,
  MEASUREMENT_ORDER_STORAGE_KEY,
} from 'src/measurer-form/measurer-form';
import {
  acceptPayment,
  cancelOrder,
  type Choice,
  findMeasurementFormPageId,
  isPaymentStored,
  loadOrderHeader,
  openWithHandOff,
  type OrderHeaderData,
  type OrderWriteOutcome,
  writeStep,
} from 'src/order-header/load-order-header';
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
import { todayInTashkent } from 'src/pricing/dates';
import {
  Button,
  Columns,
  ErrorNote,
  Field,
  Hint,
  InlineConfirm,
  Link,
  Screen,
  SelectInput,
  SkeletonRows,
  StatePill,
  StepTracker,
  TextInput,
  Wrap,
} from 'src/ui/kit';
import { SPACE, TABULAR_NUMBERS } from 'src/ui/tokens';
import { isAccessError } from 'src/utils/is-access-error';
import { randomUuid } from 'src/utils/random-uuid';

// The three things the header writes. A form that opens inline is named after
// the write it makes.
type Kind = 'step' | 'payment' | 'cancel';
type Panel = 'none' | 'payment' | 'cancel';

type Draft = StepDraft & {
  amount: string;
  method: PaymentMethod;
  comment: string;
  cancelReason: string;
};

const EMPTY_FIELDS = {
  step: { measurerId: '', measurementDate: '', masterId: '', installerId: '' },
  payment: { amount: '', method: 'CASH', comment: '' },
  cancel: { cancelReason: '' },
} as const satisfies Record<Kind, Partial<Draft>>;

const EMPTY_DRAFT: Draft = {
  ...EMPTY_FIELDS.step,
  ...EMPTY_FIELDS.payment,
  ...EMPTY_FIELDS.cancel,
};

const LOAD_ERROR =
  'Не удалось загрузить заказ. Проверьте интернет и нажмите "Повторить"';
const SAVE_ERROR =
  'Не удалось сохранить. Проверьте интернет и нажмите "Повторить"';
const NO_RIGHTS = 'Нет прав на этот шаг';
const PICK_IN_MENU_HINT =
  'Откройте «Новый замер» в меню и выберите этот заказ.';
// The order's totals follow a write a moment later, when its trigger has run.
const SETTLE_MILLISECONDS = 3_000;
const STEPS = ORDER_STEPS.map(({ status, label }) => ({ key: status, label }));

const withEmpty = (label: string, choices: readonly Choice[]): Choice[] => [
  { value: '', label },
  ...choices,
];

const labelOf = (
  options: readonly { value: string; label: string }[],
  value: string | null,
) => options.find((option) => option.value === value)?.label ?? null;

type OneOrderHeaderProps = { orderId: string };

const OneOrderHeader = ({ orderId }: OneOrderHeaderProps) => {
  const [data, setData] = useState<OrderHeaderData | null>(null);
  const [formPageId, setFormPageId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('none');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [fieldError, setFieldError] = useState<{
    kind: Kind;
    text: string;
  } | null>(null);
  const [failure, setFailure] = useState<{
    kind: Kind;
    text: string;
    retry: (() => void) | null;
  } | null>(null);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  // State read inside a handler is the one of the render that made the
  // handler; a second tap in the same render would pass a check on it. A ref
  // is current.
  const inFlight = useRef<Kind | null>(null);
  // A request whose answer was lost may already be stored. One attempt at a
  // payment keeps one id until it goes through, is cancelled or is read back,
  // so its retry overwrites that record and nothing later does.
  const paymentAttemptId = useRef<string | null>(null);
  // Counts the payments sent, so a look started before a send can tell that
  // the id it was looking for has been sent again since.
  const paymentSendCount = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A write that ends after the header is gone must not start a timer nobody
  // clears.
  const isGone = useRef(false);

  // What a write that is over leaves behind: its form closed, its fields
  // empty, its failure note gone.
  const finish = useCallback((kind: Kind, isSaved = true) => {
    if (kind === 'payment') paymentAttemptId.current = null;

    setPanel((current) => (current === kind ? 'none' : current));
    setDraft((current) => ({ ...current, ...EMPTY_FIELDS[kind] }));
    setFailure((current) => (current?.kind === kind ? null : current));
    setIsSaved(isSaved);
  }, []);

  // A quiet read that fails changes nothing: the header stays as it is.
  const load = useCallback(
    async (isQuiet = false) => {
      try {
        const client = new CoreApiClient();
        const loaded = await loadOrderHeader(client, orderId);
        const attemptId = paymentAttemptId.current;

        // A payment that is read back was saved, whatever its answer said.
        if (
          attemptId !== null &&
          (await isPaymentStored(client, attemptId).catch(() => false))
        ) {
          finish('payment');
        }

        setData(loaded);
        setLoadError(loaded === null ? 'Заказ не найден.' : null);
      } catch {
        if (!isQuiet) setLoadError(LOAD_ERROR);
      }
    },
    [orderId, finish],
  );

  useEffect(() => {
    isGone.current = false;
    void load();

    findMeasurementFormPageId(new MetadataApiClient())
      .then(setFormPageId)
      .catch(() => setFormPageId(null));

    return () => {
      isGone.current = true;
      if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    };
  }, [load]);

  const loadAgainSoon = () => {
    if (isGone.current) return;
    if (settleTimer.current !== null) clearTimeout(settleTimer.current);

    settleTimer.current = setTimeout(
      () => void load(true),
      SETTLE_MILLISECONDS,
    );
  };

  const run = async (
    kind: Kind,
    write: () => Promise<OrderWriteOutcome | void>,
  ) => {
    if (inFlight.current !== null) return;

    inFlight.current = kind;
    setBusy(kind);
    setFailure(null);
    setFieldError(null);
    setIsSaved(false);

    try {
      // Somebody else moved the order first: nothing was written, and the
      // header shows where the order really is.
      if ((await write()) === 'moved') {
        finish(kind, false);
        await load(true);

        return;
      }

      finish(kind);
      await load();
      loadAgainSoon();
    } catch (error) {
      const isDenied = isAccessError(error);

      if (kind === 'payment') {
        if (isDenied) {
          paymentAttemptId.current = null;
        } else {
          // One look before the note: the read ends an attempt it finds stored.
          await load(true);
          // Found or not, one more read a moment later: the totals follow a
          // stored payment, and a payment stored after the look is found then.
          loadAgainSoon();

          if (paymentAttemptId.current === null) return;
        }
      }

      setFailure({
        kind,
        text: isDenied ? NO_RIGHTS : SAVE_ERROR,
        // Trying again cannot help a role that may not make the change.
        retry: isDenied ? null : () => void run(kind, write),
      });
    } finally {
      inFlight.current = null;
      setBusy(null);
    }
  };

  if (loadError !== null) {
    return (
      <Screen title="Заказ">
        <ErrorNote text={loadError} onRetry={() => void load()} />
      </Screen>
    );
  }

  if (data === null) {
    return (
      <Screen title="Заказ">
        <SkeletonRows count={3} />
      </Screen>
    );
  }

  const { order } = data;
  const action = nextStepOf({
    status: order.status,
    hasMaster: order.masterId !== null,
    hasInstaller: order.installerId !== null,
  });
  const stepKey = currentStepKey(order.status);
  const statusLabel = labelOf(ORDER_STATUS_OPTIONS, order.status);
  const reasonLabel = labelOf(CANCEL_REASON_OPTIONS, order.cancelReason);
  const material = materialSentence({
    state: order.materialState,
    note: order.materialNote,
  });
  const warning = balanceWarning(order);
  const place = [
    order.districtLabel,
    order.floor === null ? null : `${order.floor} этаж`,
  ]
    .filter(Boolean)
    .join(', ');

  const change = (changes: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const errorLineOf = (kind: Kind) =>
    fieldError?.kind === kind ? (
      <Hint text={fieldError.text} tone="danger" />
    ) : null;

  const openPanel = (next: 'payment' | 'cancel') => {
    setPanel(next);
    setFieldError(null);

    if (next === 'payment') {
      change({
        amount:
          order.balance !== null && order.balance > 0
            ? String(order.balance)
            : '',
      });
    }
  };

  const closePanel = () => {
    // Its own write is on the way and may be stored: the form waits for it.
    if (panel === 'none' || inFlight.current === panel) return;

    setPanel('none');
    setFieldError(null);
    setFailure((current) => (current?.kind === panel ? null : current));

    const attemptId = paymentAttemptId.current;
    const sendCount = paymentSendCount.current;

    if (panel !== 'payment' || attemptId === null) return;

    // A payment that failed may be stored all the same: one look before its id
    // is let go. Found, the read ends the attempt as saved. Not found, the
    // next opening is another payment, under another id; a payment sent again
    // meanwhile may be stored after this look, and keeps the id.
    void load(true).then(() => {
      if (
        paymentAttemptId.current === attemptId &&
        paymentSendCount.current === sendCount
      ) {
        paymentAttemptId.current = null;
      }
    });
  };

  const openMeasurementForm = async () => {
    const isOpened =
      formPageId !== null &&
      (await openWithHandOff({
        remember: () =>
          globalThis.sessionStorage.setItem(
            MEASUREMENT_ORDER_STORAGE_KEY,
            order.id,
          ),
        forget: () =>
          globalThis.sessionStorage.removeItem(MEASUREMENT_ORDER_STORAGE_KEY),
        open: () =>
          navigate(AppPath.PageLayoutPage, { pageLayoutId: formPageId }),
      }));

    if (!isOpened) setFieldError({ kind: 'step', text: PICK_IN_MENU_HINT });
  };

  const submitStep = () => {
    if (action === null || action.nextStatus === null) return;

    const built = buildStepWrite({
      nextStatus: action.nextStatus,
      ask: action.ask,
      draft,
    });

    if (!built.ok) {
      setFieldError({ kind: 'step', text: built.error });

      return;
    }

    void run('step', () =>
      writeStep(new CoreApiClient(), order.id, order.status, built.data),
    );
  };

  const submitPayment = () => {
    if (inFlight.current !== null) return;

    const built = buildPayment({
      amount: draft.amount,
      method: draft.method,
      comment: draft.comment,
      today: todayInTashkent(),
    });

    if (!built.ok) {
      setFieldError({ kind: 'payment', text: built.error });

      return;
    }

    paymentAttemptId.current ??= randomUuid();

    const id = paymentAttemptId.current;

    void run('payment', () => {
      // Counted here, so «Повторить» counts as well.
      paymentSendCount.current += 1;

      return acceptPayment(new CoreApiClient(), id, {
        orderId: order.id,
        ...built.data,
      });
    });
  };

  const submitCancel = () => {
    const cancelReason = CANCEL_REASON_OPTIONS.find(
      (option) => option.value === draft.cancelReason,
    )?.value;

    if (cancelReason === undefined) {
      setFieldError({ kind: 'cancel', text: 'Выберите причину' });

      return;
    }

    void run('cancel', () =>
      cancelOrder(new CoreApiClient(), order.id, order.status, cancelReason),
    );
  };

  const workerQuestion = (
    label: 'Мастер' | 'Установщик',
    key: 'masterId' | 'installerId',
    choices: Choice[],
  ) => (
    <>
      <Field label={label}>
        <SelectInput
          label={label}
          value={draft[key]}
          options={withEmpty('Не выбран', choices)}
          onChange={(value) => change({ [key]: value })}
        />
      </Field>
      {choices.length === 0 ? (
        <Hint
          tone="warning"
          text={`Нет работников с отметкой «${label}». Их отмечает владелец в «ЗП».`}
        />
      ) : null}
    </>
  );

  return (
    <Screen
      title={`Заказ ${order.name}`}
      action={
        action === null ? undefined : (
          <Button
            variant="primary"
            isWideOnPhone
            isBusy={busy === 'step'}
            onClick={
              action.opensMeasurementForm
                ? () => void openMeasurementForm()
                : submitStep
            }
          >
            {action.label}
          </Button>
        )
      }
    >
      <div style={{ display: 'grid', gap: SPACE.lg }}>
        {action?.ask === 'MEASURER_AND_DATE' ? (
          <Columns>
            <Field label="Замерщик">
              <SelectInput
                label="Замерщик"
                value={draft.measurerId}
                options={withEmpty('Не выбран', data.measurers)}
                onChange={(measurerId) => change({ measurerId })}
              />
            </Field>
            <Field label="Дата и время замера">
              <TextInput
                label="Дата и время замера"
                type="datetime-local"
                value={draft.measurementDate}
                onChange={(measurementDate) => change({ measurementDate })}
                onEnter={submitStep}
              />
            </Field>
          </Columns>
        ) : null}
        {action?.ask === 'MASTER'
          ? workerQuestion('Мастер', 'masterId', data.masters)
          : null}
        {action?.ask === 'INSTALLER' || action?.ask === 'INSTALLER_OPTIONAL'
          ? workerQuestion('Установщик', 'installerId', data.installers)
          : null}
        {errorLineOf('step')}
        <Wrap>
          {order.clientName ? <span>{order.clientName}</span> : null}
          {order.clientPhone ? (
            <Link href={`tel:${order.clientPhone}`}>
              {formatUzbekNationalPhone(order.clientPhone)}
            </Link>
          ) : null}
          {place === '' ? null : <span>{place}</span>}
        </Wrap>
        <StepTracker steps={STEPS} currentKey={stepKey} />
        {/* A cancelled order, or one in a status the tracker has no step for,
            says where it is in words. */}
        {stepKey === null && statusLabel !== null ? (
          <div>
            <StatePill
              tone="neutral"
              text={
                reasonLabel === null
                  ? statusLabel
                  : `${statusLabel}: ${reasonLabel}`
              }
            />
          </div>
        ) : null}
        {material === null ? null : (
          <Hint text={material.text} tone={material.tone} />
        )}
        <div style={TABULAR_NUMBERS}>{moneySentence(order)}</div>
        {failure === null ? null : (
          <ErrorNote text={failure.text} onRetry={failure.retry ?? undefined} />
        )}
        {isSaved ? (
          <Wrap>
            <Hint text="Сохранено" tone="success" />
            {/* A plain link loads the page afresh: the fields and tables
                around this block do not see what was written through the
                API. */}
            <Link href={`/object/order/${order.id}`}>Обновить страницу</Link>
          </Wrap>
        ) : null}
        <Wrap>
          {warning === null ? null : <Hint text={warning} tone="warning" />}
          {/* A link gives way to its open form: the form's own button would
              carry the same words. */}
          {panel === 'payment' ? null : (
            <Button variant="link" onClick={() => openPanel('payment')}>
              Принять оплату
            </Button>
          )}
          {canCancel(order.status) && panel !== 'cancel' ? (
            <Button variant="link" onClick={() => openPanel('cancel')}>
              Отменить заказ
            </Button>
          ) : null}
        </Wrap>
        {panel === 'payment' ? (
          <div style={{ display: 'grid', gap: SPACE.md }}>
            <Columns>
              <Field label="Сумма">
                <TextInput
                  label="Сумма"
                  inputMode="numeric"
                  suffix="сум"
                  value={draft.amount}
                  onChange={(amount) => change({ amount })}
                  onEnter={submitPayment}
                  onCancel={closePanel}
                />
              </Field>
              <Field label="Способ">
                <SelectInput
                  label="Способ"
                  value={draft.method}
                  options={PAYMENT_METHOD_OPTIONS}
                  onChange={(value) =>
                    change({
                      method:
                        PAYMENT_METHOD_OPTIONS.find(
                          (option) => option.value === value,
                        )?.value ?? draft.method,
                    })
                  }
                />
              </Field>
            </Columns>
            <Field label="Комментарий к оплате">
              <TextInput
                label="Комментарий к оплате"
                value={draft.comment}
                onChange={(comment) => change({ comment })}
                onEnter={submitPayment}
                onCancel={closePanel}
              />
            </Field>
            {errorLineOf('payment')}
            <Wrap>
              <Button isBusy={busy === 'payment'} onClick={submitPayment}>
                Принять
              </Button>
              <Button variant="link" onClick={closePanel}>
                Отмена
              </Button>
            </Wrap>
          </div>
        ) : null}
        {panel === 'cancel' ? (
          <div style={{ display: 'grid', gap: SPACE.md }}>
            <Field label="Причина отмены">
              <SelectInput
                label="Причина отмены"
                value={draft.cancelReason}
                options={withEmpty('Выберите причину', CANCEL_REASON_OPTIONS)}
                onChange={(cancelReason) => change({ cancelReason })}
              />
            </Field>
            {errorLineOf('cancel')}
            <InlineConfirm
              question={`Отменить заказ ${order.name}?`}
              confirmText="Отменить заказ"
              cancelText="Оставить"
              isBusy={busy === 'cancel'}
              onConfirm={submitCancel}
              onCancel={closePanel}
            />
          </div>
        ) : null}
      </div>
    </Screen>
  );
};

const OrderHeader = () => {
  const selectedRecordIds = useSelectedRecordIds();

  if (selectedRecordIds.length !== 1) return null;

  const orderId = selectedRecordIds[0];

  // The key ties everything the header holds to one order: another order
  // opened in the same panel starts afresh, with no form, note or payment
  // attempt of the one before.
  return <OneOrderHeader key={orderId} orderId={orderId} />;
};

export default defineFrontComponent({
  universalIdentifier: IDS.orderHeader.frontComponent,
  name: 'order-header',
  description: 'Шапка заказа: шаги, материал, деньги и следующий шаг',
  component: OrderHeader,
});
