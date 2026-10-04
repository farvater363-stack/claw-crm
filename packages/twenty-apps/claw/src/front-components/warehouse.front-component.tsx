import { Fragment, useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';

import {
  MATERIAL_UNIT_OPTIONS,
  materialUnitLabel,
  type MaterialUnit,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { todayInTashkent } from 'src/pricing/dates';
import {
  createMaterial,
  createStockMovement,
  loadLatestMovements,
  loadStockData,
  type StockData,
  updateMinimumStock,
} from 'src/stock/load-stock-data';
import {
  buildReceipt,
  buildRecount,
  buildStockRows,
  movementText,
  parseMinimumStock,
  recountSummary,
  type StockMovementLine,
  type StockRow,
} from 'src/stock/stock-screen';
import { formatQuantity } from 'src/ui/format';
import {
  Button,
  Columns,
  EmptyState,
  ErrorNote,
  Field,
  Hint,
  Link,
  Row,
  Screen,
  Section,
  SelectInput,
  SkeletonRows,
  StatePill,
  StaticRow,
  StickyBar,
  TextInput,
  Wrap,
} from 'src/ui/kit';
import { dropKey } from 'src/utils/drop-key';
import { isAccessError } from 'src/utils/is-access-error';
import { randomUuid } from 'src/utils/random-uuid';

type LoadState =
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: StockData };

type Mode =
  | { kind: 'list' }
  | {
      kind: 'recount';
      typed: Record<string, string>;
      errors: Record<string, string>;
    };

type NewMaterial = { name: string; unit: MaterialUnit; minimumStock: string };

const SAVED_TICK_MS = 2_000;
// The server recomputes the stock after a save. The list is read again when
// that is usually done, and once more for a slow run.
const SETTLE_REFETCH_MS = [2_000, 6_000];
// Keeps an empty line as tall as a line of text
const NO_BREAK_SPACE = String.fromCharCode(160);
const UNNAMED = 'Без названия';
const SAVE_FAILED =
  'Не удалось сохранить. Проверьте интернет и нажмите "Повторить"';
const LOAD_FAILED =
  'Не удалось загрузить склад. Проверьте интернет и нажмите "Повторить"';
// Shown in place of a failure when the cause is the role, not the network.
const NO_ACCESS = 'Склад ведут владелец и менеджер';
const EMPTY_TEXT =
  'Добавьте то, что покупаете для работы: профиль, прут, краску. Приложение будет считать, сколько нужно на заказы.';
const NEW_MATERIAL: NewMaterial = { name: '', unit: 'METER', minimumStock: '' };

const loadState = async (knownCanSeePrice?: boolean): Promise<LoadState> => {
  try {
    return {
      status: 'ready',
      data: await loadStockData(new CoreApiClient(), knownCanSeePrice),
    };
  } catch (error) {
    console.error(error);

    return isAccessError(error)
      ? { status: 'forbidden' }
      : { status: 'error', message: LOAD_FAILED };
  }
};

const Stock = () => {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [newMaterial, setNewMaterial] = useState<NewMaterial | null>(null);
  const [movementsById, setMovementsById] = useState<
    Record<string, StockMovementLine[]>
  >({});
  const [busyKeys, setBusyKeys] = useState<string[]>([]);
  const [failures, setFailures] = useState<
    Record<string, { isDenied: boolean; retry: () => void }>
  >({});
  // Material id -> the amount shown until the server's numbers have caught
  // up; null when the save did not change the amount.
  const [settling, setSettling] = useState<
    Record<string, { onHand: number | null; token: number }>
  >({});
  // The latest save whose last read of the list failed: its amounts stay as
  // shown until a read succeeds.
  const [unsettledToken, setUnsettledToken] = useState<number | null>(null);
  const inFlight = useRef(new Set<string>());
  const attemptIds = useRef<Record<string, string>>({});
  const startedReads = useRef(0);
  const shownRead = useRef(0);
  const settleCount = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;

    void loadState().then(setLoad);

    return () => pending.forEach(clearTimeout);
  }, []);

  const later = (action: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      action();
    }, delay);

    timers.current.add(timer);
  };

  const setDraft = (key: string, value: string) =>
    setDrafts((current) => ({ ...current, [key]: value }));

  const showSaved = (key: string) => {
    setSavedKey(key);
    later(
      () => setSavedKey((current) => (current === key ? null : current)),
      SAVED_TICK_MS,
    );
  };

  const showMovements = (materialId: string) =>
    void loadLatestMovements(new CoreApiClient(), materialId)
      .then((lines) =>
        setMovementsById((current) => ({ ...current, [materialId]: lines })),
      )
      // «Вся история» still leads to the movements, so a failed read only
      // leaves «Последнее» out.
      .catch((error) => console.error(error));

  // A request whose answer was lost may already be stored. Each attempt at a
  // create keeps one id from the press until it goes through, so its retry
  // overwrites that record instead of adding a second one.
  const attemptId = (key: string) => {
    attemptIds.current[key] ??= randomUuid();

    return attemptIds.current[key];
  };

  const endAttempt = (key: string) => {
    attemptIds.current = dropKey(attemptIds.current, key);
  };

  // One thing is open at a time, a row or the new material form: what is
  // typed and the errors under it belong to that one thing. A purchase or a
  // new material that has not gone through keeps its fields: «Повторить»
  // sends what they hold.
  const showRow = (rowId: string | null) => {
    setOpenId(rowId);
    setDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) =>
            attemptIds.current[
              key.replace(/:(quantity|price)$/, ':receipt')
            ] !== undefined,
        ),
      ),
    );
    setErrors({});

    if (attemptIds.current.add === undefined) setNewMaterial(null);
    if (rowId !== null) showMovements(rowId);
  };

  // A failure stays under its place until the same action is run again. A
  // key in flight is not started twice (Enter, then the blur that follows).
  const run = async (key: string, action: () => Promise<void>) => {
    if (inFlight.current.has(key)) return;

    inFlight.current.add(key);
    setBusyKeys([...inFlight.current]);
    setFailures((current) => dropKey(current, key));

    try {
      await action();
    } catch (error) {
      console.error(error);
      setFailures((current) => ({
        ...current,
        [key]: {
          isDenied: isAccessError(error),
          retry: () => void run(key, action),
        },
      }));
    } finally {
      inFlight.current.delete(key);
      setBusyKeys([...inFlight.current]);
    }
  };

  // The stored retry repeats the action as it was sent. A place whose fields
  // may have been corrected since passes its own, which reads them again.
  const failureNote = (key: string, retry = failures[key]?.retry) => {
    const failure = failures[key];

    if (!failure) return null;

    // Trying again cannot help a role that may not write here.
    return failure.isDenied ? (
      <ErrorNote text={NO_ACCESS} />
    ) : (
      <ErrorNote text={SAVE_FAILED} onRetry={retry} />
    );
  };

  // The role does not change while the screen is open, so the price check of
  // the first load is not repeated.
  const knownCanSeePrice =
    load.status === 'ready' ? load.data.canSeePrice : undefined;

  // Reads are numbered: one that lands after a newer one was shown is dropped
  // (null), or old amounts would come back without the «Обновляем…» mark.
  const readList = async (): Promise<LoadState | null> => {
    startedReads.current += 1;

    const read = startedReads.current;
    const next = await loadState(knownCanSeePrice);

    if (read < shownRead.current) return null;
    if (next.status === 'ready') shownRead.current = read;

    return next;
  };

  // The amounts shown in advance give way to the server's only when the last
  // read after a save succeeds. If it fails they stay, with the mark: a row
  // falling back to its old amount would get the purchase recorded twice.
  const readAgain = async (token: number, isLast: boolean) => {
    const next = await readList();

    if (next === null) return;

    if (next.status !== 'ready') {
      if (isLast) {
        setUnsettledToken((current) => Math.max(current ?? 0, token));
      }

      return;
    }

    setLoad(next);

    if (!isLast) return;

    // Earlier saves are settled by this read too; a later one keeps its mark
    // until its own last read.
    setSettling((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([, entry]) => entry.token > token),
      ),
    );
    setUnsettledToken((current) =>
      current !== null && current <= token ? null : current,
    );
  };

  const settle = (amounts: Record<string, number | null>) => {
    settleCount.current += 1;

    const token = settleCount.current;

    setSettling((current) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(amounts).map(([materialId, onHand]) => [
          materialId,
          { onHand: onHand ?? current[materialId]?.onHand ?? null, token },
        ]),
      ),
    }));
    SETTLE_REFETCH_MS.forEach((delay, index) =>
      later(
        () => void readAgain(token, index === SETTLE_REFETCH_MS.length - 1),
        delay,
      ),
    );
  };

  if (load.status === 'loading') {
    return (
      <Screen title="Склад">
        <SkeletonRows count={5} />
      </Screen>
    );
  }

  if (load.status === 'forbidden') {
    return (
      <Screen title="Склад">
        <Hint text={NO_ACCESS} />
      </Screen>
    );
  }

  if (load.status === 'error') {
    return (
      <Screen title="Склад">
        <ErrorNote
          text={load.message}
          onRetry={() => {
            setLoad({ status: 'loading' });
            void readList().then((next) => {
              if (next !== null) setLoad(next);
            });
          }}
        />
      </Screen>
    );
  }

  const { data } = load;
  const shownMaterials = data.materials.map((material) => {
    const onHand = settling[material.id]?.onHand ?? null;

    return onHand === null ? material : { ...material, onHand };
  });
  const onHandById = new Map(
    shownMaterials.map((material) => [material.id, material.onHand ?? 0]),
  );
  const rows = buildStockRows(shownMaterials, data.needs);

  const addReceipt = (row: StockRow) => {
    const key = `${row.id}:receipt`;
    const receipt = buildReceipt({
      materialId: row.id,
      quantity: drafts[`${row.id}:quantity`] ?? '',
      unitPrice: drafts[`${row.id}:price`] ?? '',
      today: todayInTashkent(),
    });

    if (!receipt.ok) {
      // «Повторить» under a closed row: the error is shown inside the row.
      if (openId !== row.id) showRow(row.id);

      setErrors((current) => ({ ...current, [key]: receipt.error }));

      return;
    }

    setErrors((current) => dropKey(current, key));
    void run(key, async () => {
      await createStockMovement(
        new CoreApiClient(),
        attemptId(key),
        receipt.data,
      );
      endAttempt(key);
      setDrafts((current) =>
        dropKey(dropKey(current, `${row.id}:quantity`), `${row.id}:price`),
      );
      settle({
        [row.id]: (onHandById.get(row.id) ?? 0) + receipt.data.quantity,
      });
      showMovements(row.id);
    });
  };

  const commitMinimumStock = (row: StockRow) => {
    const key = `${row.id}:minimumStock`;
    const draft = drafts[key];

    // TextInput commits on every blur, typed in or not.
    if (draft === undefined) return;

    const parsed = parseMinimumStock(draft);

    if (!parsed.ok) {
      setErrors((current) => ({ ...current, [key]: parsed.error }));

      return;
    }

    setErrors((current) => dropKey(current, key));

    if (parsed.value === row.minimumStock) {
      setDrafts((current) => dropKey(current, key));
      // Typing the saved value back withdraws a change that failed to save.
      setFailures((current) => dropKey(current, key));

      return;
    }

    void run(key, async () => {
      await updateMinimumStock(new CoreApiClient(), row.id, parsed.value);
      setLoad((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              data: {
                ...current.data,
                materials: current.data.materials.map((material) =>
                  material.id === row.id
                    ? { ...material, minimumStock: parsed.value }
                    : material,
                ),
              },
            }
          : current,
      );
      setDrafts((current) =>
        current[key] === draft ? dropKey(current, key) : current,
      );
      showSaved(key);
      settle({ [row.id]: null });
    });
  };

  const leaveRecount = () => {
    // A save on its way cannot be called back, so it is not left half seen.
    if (inFlight.current.has('recount')) return;

    setMode({ kind: 'list' });
    setFailures((current) => dropKey(current, 'recount'));
  };

  const startRecount = () => {
    showRow(null);
    // A recount left unfinished is not the attempt this one continues.
    attemptIds.current = Object.fromEntries(
      Object.entries(attemptIds.current).filter(
        ([key]) => !key.startsWith('recount:'),
      ),
    );
    setMode({ kind: 'recount', typed: {}, errors: {} });
  };

  const saveRecount = (typed: Record<string, string>) => {
    const recount = buildRecount(typed, todayInTashkent());

    if (!recount.ok) {
      setMode({ kind: 'recount', typed, errors: recount.errors });

      return;
    }

    // Nothing typed is nothing to save.
    if (recount.data.length === 0) {
      leaveRecount();

      return;
    }

    void run('recount', async () => {
      const counted: Record<string, number> = {};

      try {
        for (const entry of recount.data) {
          const entryKey = `recount:${entry.materialId}`;

          await createStockMovement(
            new CoreApiClient(),
            attemptId(entryKey),
            entry,
          );
          endAttempt(entryKey);
          counted[entry.materialId] = entry.countedQuantity;
          // A saved amount leaves the form, so whatever is sent next (the
          // retry after a failure) cannot count the material again: a second
          // recount of it would wipe its overuse figure.
          setMode((current) =>
            current.kind === 'recount'
              ? { ...current, typed: dropKey(current.typed, entry.materialId) }
              : current,
          );
        }

        setMode({ kind: 'list' });
      } finally {
        if (Object.keys(counted).length > 0) settle(counted);
      }
    });
  };

  const closeNewMaterial = () => {
    setNewMaterial(null);
    setErrors({});
    setFailures((current) => dropKey(current, 'add'));
    // A form opened later is another material: it must not overwrite the one
    // a lost request of this form may have stored.
    endAttempt('add');
  };

  const addMaterial = () => {
    if (newMaterial === null) {
      showRow(null);
      setNewMaterial(NEW_MATERIAL);

      return;
    }

    const name = newMaterial.name.trim();
    const minimumStock = parseMinimumStock(newMaterial.minimumStock);

    setErrors({
      ...(name === '' ? { 'add:name': 'Введите название' } : {}),
      ...(minimumStock.ok ? {} : { 'add:minimumStock': minimumStock.error }),
    });

    if (name === '' || !minimumStock.ok) return;

    void run('add', async () => {
      const materialId = attemptId('add');

      await createMaterial(new CoreApiClient(), materialId, {
        name,
        unit: newMaterial.unit,
        minimumStock: minimumStock.value,
      });
      endAttempt('add');

      const next = await readList();

      if (next !== null) setLoad(next);

      // Opened so the first purchase can be typed straight away.
      showRow(materialId);
      settle({ [materialId]: null });
    });
  };

  const renderOpenRow = (row: StockRow) => {
    const receiptKey = `${row.id}:receipt`;
    const minimumKey = `${row.id}:minimumStock`;
    const close = () => showRow(null);
    const lines = movementsById[row.id] ?? [];
    const receiptField = (
      field: 'quantity' | 'price',
      label: string,
      suffix: string,
    ) => (
      <Field key={field} label={label}>
        {/* No onCommit: leaving a field must not record the purchase. */}
        <TextInput
          label={label}
          inputMode={field === 'price' ? 'numeric' : 'decimal'}
          value={drafts[`${row.id}:${field}`] ?? ''}
          suffix={suffix}
          onChange={(value) => {
            setDraft(`${row.id}:${field}`, value);
            setErrors((current) => dropKey(current, receiptKey));
          }}
          onEnter={() => addReceipt(row)}
          onCancel={close}
        />
      </Field>
    );

    return (
      <>
        <Columns>
          {[
            receiptField('quantity', 'Купил', row.unitLabel),
            ...(data.canSeePrice
              ? [receiptField('price', 'Цена', `сум за ${row.unitLabel}`)]
              : []),
          ]}
        </Columns>
        {errors[receiptKey] ? (
          <Hint tone="danger" text={errors[receiptKey]} />
        ) : null}
        <Wrap>
          <Button
            variant="primary"
            isBusy={busyKeys.includes(receiptKey)}
            onClick={() => addReceipt(row)}
          >
            Добавить
          </Button>
        </Wrap>
        {row.needs.length > 0 ? (
          <Wrap>
            <span>Нужно на заказы:</span>
            {row.needs.map((need) => (
              <Link key={need.orderId} href={`/object/order/${need.orderId}`}>
                {`${need.orderName} ${formatQuantity(need.quantity, row.unitLabel)}`}
              </Link>
            ))}
          </Wrap>
        ) : null}
        <Field
          isInline
          label="Запас не меньше"
          error={errors[minimumKey]}
          isSaved={savedKey === minimumKey}
        >
          <TextInput
            label="Запас не меньше"
            inputMode="decimal"
            value={
              drafts[minimumKey] ?? String(row.minimumStock).replace('.', ',')
            }
            suffix={row.unitLabel}
            onChange={(value) => setDraft(minimumKey, value)}
            onCommit={() => commitMinimumStock(row)}
            // Escape takes the typed value back and leaves the row open:
            // closing it would blur the field and save what was cancelled.
            onCancel={() => {
              setDrafts((current) => dropKey(current, minimumKey));
              setErrors((current) => dropKey(current, minimumKey));
            }}
          />
        </Field>
        {row.overuseNote ? (
          <Hint tone="warning" text={row.overuseNote} />
        ) : null}
        {lines.length > 0 ? (
          <Hint
            text={`Последнее: ${lines
              .map((line) => movementText(line, row.unitLabel))
              .join(' · ')}`}
          />
        ) : null}
        <Wrap>
          <Link href="/objects/stockMovements">
            Вся история <span aria-hidden>›</span>
          </Link>
        </Wrap>
      </>
    );
  };

  const renderListRow = (row: StockRow) => {
    const isOpen = openId === row.id;

    return (
      <Fragment key={row.id}>
        <Row
          title={row.name || UNNAMED}
          value={`Есть ${row.onHandText} · Нужно на заказы ${row.reservedText}`}
          pill={
            settling[row.id] ? (
              <StatePill tone="neutral" text="Обновляем…" />
            ) : (
              <StatePill tone={row.pill.tone} text={row.pill.text} />
            )
          }
          isOpen={isOpen}
          onToggle={() => showRow(isOpen ? null : row.id)}
        >
          {isOpen ? renderOpenRow(row) : null}
        </Row>
        {/* Outside the row, so a save that fails after the row was closed is
            still seen. */}
        {failureNote(`${row.id}:receipt`, () => addReceipt(row))}
        {failureNote(`${row.id}:minimumStock`)}
      </Fragment>
    );
  };

  const renderRecountRow = (
    row: StockRow,
    recount: Extract<Mode, { kind: 'recount' }>,
  ) => (
    <StaticRow key={row.id}>
      <Field
        isInline
        label={row.name || UNNAMED}
        error={recount.errors[row.id]}
      >
        <TextInput
          label={row.name || UNNAMED}
          inputMode="decimal"
          value={recount.typed[row.id] ?? ''}
          // The unit stands in the field already, so only the number is shown.
          placeholder={formatQuantity(onHandById.get(row.id) ?? 0, '').trim()}
          suffix={row.unitLabel}
          onChange={(value) => {
            // The amounts being saved were read at the press: a change typed
            // during the save would be dropped with the old number recorded.
            if (inFlight.current.has('recount')) return;

            setMode((current) =>
              current.kind === 'recount'
                ? {
                    kind: 'recount',
                    typed: { ...current.typed, [row.id]: value },
                    errors: dropKey(current.errors, row.id),
                  }
                : current,
            );
          }}
          onEnter={() => saveRecount(recount.typed)}
          onCancel={leaveRecount}
        />
      </Field>
    </StaticRow>
  );

  const renderNewMaterial = (form: NewMaterial) => (
    <StaticRow>
      <Columns>
        <Field label="Название" error={errors['add:name']}>
          <TextInput
            label="Название"
            value={form.name}
            onChange={(name) => setNewMaterial({ ...form, name })}
            onEnter={addMaterial}
            onCancel={closeNewMaterial}
          />
        </Field>
        <Field label="Единица">
          <SelectInput
            label="Единица"
            value={form.unit}
            options={MATERIAL_UNIT_OPTIONS}
            onChange={(value) =>
              setNewMaterial({
                ...form,
                unit:
                  MATERIAL_UNIT_OPTIONS.find((option) => option.value === value)
                    ?.value ?? form.unit,
              })
            }
          />
        </Field>
        <Field label="Запас не меньше" error={errors['add:minimumStock']}>
          <TextInput
            label="Запас не меньше"
            inputMode="decimal"
            value={form.minimumStock}
            suffix={materialUnitLabel(form.unit)}
            onChange={(minimumStock) =>
              setNewMaterial({ ...form, minimumStock })
            }
            onEnter={addMaterial}
            onCancel={closeNewMaterial}
          />
        </Field>
      </Columns>
    </StaticRow>
  );

  if (rows.length === 0 && newMaterial === null) {
    return (
      <Screen title="Склад">
        <EmptyState
          text={EMPTY_TEXT}
          actionText="Добавить материал"
          onAction={addMaterial}
        />
      </Screen>
    );
  }

  const unsettledNote =
    unsettledToken === null ? null : (
      <ErrorNote
        text={LOAD_FAILED}
        onRetry={() => void readAgain(unsettledToken, true)}
      />
    );

  if (mode.kind === 'recount') {
    const isSaving = busyKeys.includes('recount');

    return (
      <Screen title="Склад">
        <StickyBar>
          {/* The line keeps its place while empty, so the list does not jump
              under the finger at the first digit. */}
          <Hint text={recountSummary(mode.typed) ?? NO_BREAK_SPACE} />
          <Wrap>
            <Button
              variant="primary"
              isWideOnPhone
              isBusy={isSaving}
              onClick={() => saveRecount(mode.typed)}
            >
              Сохранить пересчёт
            </Button>
            {isSaving ? null : (
              <Button variant="link" onClick={leaveRecount}>
                Отмена
              </Button>
            )}
          </Wrap>
          {/* The retry sends what the fields hold now, not what they held
              when the save failed. */}
          {failureNote('recount', () => saveRecount(mode.typed))}
        </StickyBar>
        {unsettledNote}
        <Section title="Материалы">
          {rows.map((row) => renderRecountRow(row, mode))}
        </Section>
      </Screen>
    );
  }

  return (
    <Screen
      title="Склад"
      action={
        rows.length > 0 ? (
          <Button onClick={startRecount}>Пересчитать склад</Button>
        ) : undefined
      }
    >
      {unsettledNote}
      <Section
        title="Материалы"
        footer={
          <>
            {failureNote('add', addMaterial)}
            <Wrap>
              <Button isBusy={busyKeys.includes('add')} onClick={addMaterial}>
                + Добавить материал
              </Button>
              {newMaterial === null ? null : (
                <Button variant="link" onClick={closeNewMaterial}>
                  Отмена
                </Button>
              )}
            </Wrap>
          </>
        }
      >
        {rows.map(renderListRow)}
        {newMaterial === null ? null : renderNewMaterial(newMaterial)}
      </Section>
    </Screen>
  );
};

export default defineFrontComponent({
  universalIdentifier: IDS.stock.frontComponent,
  name: 'warehouse',
  description: 'Склад: что есть, что нужно на заказы, что купить',
  component: Stock,
});
