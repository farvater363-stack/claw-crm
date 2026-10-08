import { useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { type WorkerCategory } from 'src/constants/select-options';
import { type PayrollScreenWorker } from 'src/payroll/load-payroll-data';
import { type SquareMeterSummaryRow } from 'src/payroll/payroll-screen';
// Type only, as a whole statement: that module imports node:crypto, which must not reach a front component's bundle.
import type { AccrualLine } from 'src/payroll/plan-order-accruals';
import { rowKeyOf, type WorkshopCatalog, type WorkshopRate } from 'src/payroll/workshop-pay';
import {
  createGrilleKind,
  removeWorkshopRate,
  saveWorkshopRate,
  setDesignKind,
  setWorkerCategories,
} from 'src/payroll/workshop-rates-data';
import {
  buildRateRows,
  listFixes,
  ownRatesCount,
  parseRaisePercent,
  type RateCell,
  type RateMaster,
  type RateRow,
  raisedRate,
  rateRecordName,
} from 'src/payroll/workshop-rates-screen';
import { parseOptionalMoney } from 'src/prices/prices-screen';
import { formatQuantity, formatWhole } from 'src/ui/format';
import {
  AmountLine,
  Button,
  ErrorNote,
  Field,
  Hint,
  Panel,
  SelectInput,
  Sheet,
  StatTiles,
  StaticRow,
  Tabs,
  TextInput,
  usePalette,
  Wrap,
} from 'src/ui/kit';
import { RADIUS, SPACE, TABULAR_NUMBERS, TYPE } from 'src/ui/tokens';
import { isAccessError } from 'src/utils/is-access-error';
import { randomUuid } from 'src/utils/random-uuid';

type SheetState =
  | { kind: 'usual'; rowKey: string; value: string }
  | { kind: 'cell'; rowKey: string; masterId: string; isOwn: boolean; value: string }
  | { kind: 'raise'; value: string; raiseOwn: boolean }
  | { kind: 'newKind'; kindId: string; rateId: string; name: string; value: string }
  | { kind: 'special'; rateId: string; designId: string; value: string }
  | { kind: 'master'; workerId: string; copyFrom: string }
  | { kind: 'assignKind'; designId: string; grilleKindId: string };

const SAVE_FAILED = 'Не удалось сохранить. Проверьте интернет и нажмите "Повторить"';
const NO_ACCESS = 'Доступно только владельцу';
const FROM_TODAY = 'Для заказов, установленных с сегодня. Уже начисленное не меняется.';
const USUAL = 'usual';

const MONEY_ERROR = 'Введите ставку целым числом больше нуля';

const parseRate = (raw: string): number | null => {
  const parsed = parseOptionalMoney(raw);

  return parsed.ok && parsed.value !== null && parsed.value > 0 ? parsed.value : null;
};

const Cell = ({
  cell,
  label,
  isUsual = false,
  onClick,
}: {
  cell: RateCell;
  label: string;
  isUsual?: boolean;
  onClick: () => void;
}) => {
  const colors = usePalette();

  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        minHeight: 40,
        padding: `0 ${SPACE.sm}px`,
        border: 'none',
        borderRadius: RADIUS.control,
        background: cell.isOwn ? colors.accentTint : 'transparent',
        color: isUsual || cell.isOwn ? colors.accent : colors.muted,
        font: 'inherit',
        fontWeight: isUsual || cell.isOwn ? 600 : 400,
        textDecoration: isUsual ? 'underline dotted' : 'none',
        textUnderlineOffset: 3,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        ...TABULAR_NUMBERS,
      }}
    >
      {cell.rate === null ? '—' : formatWhole(cell.rate)}
    </button>
  );
};

export const WorkshopRatesTab = ({
  month,
  monthLabel,
  catalog,
  workers,
  accruals,
  onChanged,
}: {
  month: string;
  monthLabel: string;
  catalog: WorkshopCatalog;
  workers: PayrollScreenWorker[];
  accruals: AccrualLine[];
  // Reads the screen again; a failed read leaves the table as it was
  onChanged: () => Promise<void>;
}) => {
  const colors = usePalette();
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [failure, setFailure] = useState<{ isDenied: boolean; retry: () => void } | null>(null);
  const isSavingRef = useRef(false);
  const copyIds = useRef(new Map<string, string>());

  const masters: RateMaster[] = workers
    .filter((worker) => worker.isActive && worker.categories.includes('MASTER'))
    .map((worker) => ({ id: worker.id, name: worker.name || 'Без имени' }))
    .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
  const rows = buildRateRows(catalog, masters);
  const rowByKey = new Map(rows.map((row) => [row.key, row]));
  const fixes = listFixes(catalog, rows);
  const designsWithoutKind = catalog.designs.filter(
    (design) => design.grilleKindId === null || !catalog.kinds.some((kind) => kind.id === design.grilleKindId),
  ).length;
  const workshopThisMonth = accruals
    .filter((line) => line.work === 'MASTER' && line.earnedOn.startsWith(month))
    .reduce((sum, line) => sum + line.amount, 0);
  const masterName = (masterId: string | null) =>
    masterId === null ? null : (masters.find((master) => master.id === masterId)?.name ?? null);

  const closeSheet = () => {
    setSheet(null);
    setError(null);
    setFailure(null);
  };

  // One write at a time; after it the table is read again, so it shows what the server holds.
  const run = async (write: () => Promise<void>) => {
    if (isSavingRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);
    setFailure(null);

    try {
      await write();
      await onChanged();
      closeSheet();
    } catch (saveError) {
      console.error(saveError);
      setFailure({ isDenied: isAccessError(saveError), retry: () => void run(write) });
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const nameOf = (record: WorkshopRate, workerName: string | null) =>
    rateRecordName({ label: rowByKey.get(rowKeyOf(record))?.label ?? '' }, workerName);

  const recordOf = (row: RateRow, workerId: string | null, rate: number, id: string) => ({
    id,
    name: rateRecordName(row, masterName(workerId)),
    grilleKindId: row.grilleKindId,
    designId: row.designId,
    workerId,
    rate,
  });

  const saveUsual = (row: RateRow, raw: string) => {
    const rate = parseRate(raw);

    if (rate === null) {
      setError(MONEY_ERROR);

      return;
    }

    setError(null);
    void run(() =>
      saveWorkshopRate(new CoreApiClient(), recordOf(row, null, rate, row.usual.record?.id ?? randomUuid())),
    );
  };

  const removeSpecial = (row: RateRow) => {
    const records = [row.usual, ...Object.values(row.byMaster)].flatMap((cell) =>
      cell.record === null ? [] : [cell.record],
    );

    void run(async () => {
      for (const record of records) {
        await removeWorkshopRate(new CoreApiClient(), record.id);
      }
    });
  };

  const saveCell = (row: RateRow, masterId: string, isOwn: boolean, raw: string) => {
    const own = row.byMaster[masterId]?.record ?? null;

    if (!isOwn) {
      setError(null);

      if (own === null) {
        closeSheet();

        return;
      }

      void run(() => removeWorkshopRate(new CoreApiClient(), own.id));

      return;
    }

    const rate = parseRate(raw);

    if (rate === null) {
      setError(MONEY_ERROR);

      return;
    }

    setError(null);
    void run(() => saveWorkshopRate(new CoreApiClient(), recordOf(row, masterId, rate, own?.id ?? randomUuid())));
  };

  const saveRaise = (raw: string, raiseOwn: boolean) => {
    const parsed = parseRaisePercent(raw);

    if (!parsed.ok) {
      setError(parsed.error);

      return;
    }

    setError(null);
    const records = catalog.rates.filter((record) => raiseOwn || record.workerId === null);

    void run(async () => {
      for (const record of records) {
        await saveWorkshopRate(new CoreApiClient(), {
          ...record,
          name: nameOf(record, masterName(record.workerId)),
          rate: raisedRate(record.rate, parsed.value),
        });
      }
    });
  };

  const saveNewKind = (kindId: string, rateId: string, name: string, raw: string) => {
    const trimmed = name.trim();
    const rate = parseRate(raw);

    if (trimmed === '') {
      setError('Введите название вида');

      return;
    }

    if (catalog.kinds.some((kind) => kind.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setError('Такой вид уже есть');

      return;
    }

    if (rate === null) {
      setError(MONEY_ERROR);

      return;
    }

    setError(null);
    void run(async () => {
      await createGrilleKind(new CoreApiClient(), kindId, trimmed);
      await saveWorkshopRate(new CoreApiClient(), {
        id: rateId,
        name: `${trimmed} · обычная`,
        grilleKindId: kindId,
        designId: null,
        workerId: null,
        rate,
      });
    });
  };

  const saveSpecial = (rateId: string, designId: string, raw: string) => {
    const design = catalog.designs.find((entry) => entry.id === designId);
    const rate = parseRate(raw);

    if (design === undefined) {
      setError('Выберите решётку');

      return;
    }

    if (rate === null) {
      setError(MONEY_ERROR);

      return;
    }

    setError(null);
    void run(() =>
      saveWorkshopRate(new CoreApiClient(), {
        id: rateId,
        name: `«${design.name}» · обычная`,
        grilleKindId: null,
        designId: design.id,
        workerId: null,
        rate,
      }),
    );
  };

  const saveMaster = (workerId: string, copyFrom: string) => {
    const worker = workers.find((entry) => entry.id === workerId);

    if (worker === undefined) {
      setError('Выберите работника');

      return;
    }

    setError(null);
    const copied = copyFrom === USUAL ? [] : catalog.rates.filter((record) => record.workerId === copyFrom);
    const categories: WorkerCategory[] = [...worker.categories, 'MASTER'];

    void run(async () => {
      for (const record of copied) {
        const key = `${workerId}:${record.id}`;
        // One id per copied cell for as long as the screen is open, so a retry overwrites the same copies.
        const id = copyIds.current.get(key) ?? randomUuid();

        copyIds.current.set(key, id);
        await saveWorkshopRate(new CoreApiClient(), {
          ...record,
          id,
          name: nameOf(record, worker.name),
          workerId,
        });
      }

      await setWorkerCategories(new CoreApiClient(), workerId, categories);
    });
  };

  const saveAssignKind = (designId: string, grilleKindId: string) => {
    if (grilleKindId === '') {
      setError('Выберите вид');

      return;
    }

    setError(null);
    void run(() => setDesignKind(new CoreApiClient(), designId, grilleKindId));
  };

  const failureNote =
    failure === null ? null : failure.isDenied ? (
      <ErrorNote text={NO_ACCESS} />
    ) : (
      <ErrorNote text={SAVE_FAILED} onRetry={failure.retry} />
    );

  const footer = (text: string, onSave: () => void, note?: string) => (
    <>
      <Button variant="primary" isWideOnPhone isBusy={isSaving} onClick={onSave}>
        {text}
      </Button>
      {note ? <Hint text={note} /> : null}
      {failureNote}
    </>
  );

  const renderSheet = () => {
    if (sheet === null) return null;

    if (sheet.kind === 'usual') {
      const row = rowByKey.get(sheet.rowKey);

      if (row === undefined) return null;

      return (
        <Sheet
          title={row.label}
          isBusy={isSaving}
          onClose={closeSheet}
          footer={footer('Сохранить ставку', () => saveUsual(row, sheet.value), FROM_TODAY)}
        >
          <Field label="Обычная ставка цеха за м²" error={error}>
            <TextInput
              label="Обычная ставка цеха за м²"
              inputMode="numeric"
              isMoney
              isLarge
              suffix="сум"
              value={sheet.value}
              onChange={(value) => setSheet({ ...sheet, value })}
              onEnter={() => saveUsual(row, sheet.value)}
              onCancel={closeSheet}
            />
          </Field>
          {masters.length > 0 ? (
            <Hint text="Мастера без своей ставки получают обычную; она поменяется у них сама." />
          ) : null}
          {row.designId !== null ? (
            <Wrap>
              <Button variant="link" onClick={() => removeSpecial(row)}>
                Убрать особую ставку
              </Button>
            </Wrap>
          ) : null}
        </Sheet>
      );
    }

    if (sheet.kind === 'cell') {
      const row = rowByKey.get(sheet.rowKey);
      const name = masterName(sheet.masterId);

      if (row === undefined || name === null) return null;

      const usualText = row.usual.rate === null ? 'ставки нет' : formatWhole(row.usual.rate);

      return (
        <Sheet
          title={`${name} · ${row.label}`}
          isBusy={isSaving}
          onClose={closeSheet}
          footer={footer('Сохранить', () => saveCell(row, sheet.masterId, sheet.isOwn, sheet.value), FROM_TODAY)}
        >
          <Field label="Ставка за м²">
            <Tabs
              value={sheet.isOwn ? 'own' : USUAL}
              options={[
                { value: USUAL, label: `Как обычно (${usualText})` },
                { value: 'own', label: 'Своя' },
              ]}
              onChange={(value) => setSheet({ ...sheet, isOwn: value === 'own' })}
            />
          </Field>
          {sheet.isOwn ? (
            <Field label="Своя ставка, сум" error={error}>
              <TextInput
                label="Своя ставка, сум"
                inputMode="numeric"
                isMoney
                isLarge
                suffix="сум"
                value={sheet.value}
                onChange={(value) => setSheet({ ...sheet, value })}
                onEnter={() => saveCell(row, sheet.masterId, sheet.isOwn, sheet.value)}
                onCancel={closeSheet}
              />
            </Field>
          ) : null}
        </Sheet>
      );
    }

    if (sheet.kind === 'raise') {
      const parsed = parseRaisePercent(sheet.value);
      const usualRows = rows.filter((row) => row.usual.rate !== null);

      return (
        <Sheet
          title="Поднять все ставки"
          isBusy={isSaving}
          onClose={closeSheet}
          footer={footer('Поднять', () => saveRaise(sheet.value, sheet.raiseOwn), FROM_TODAY)}
        >
          <Field label="На сколько процентов" error={error}>
            <TextInput
              label="На сколько процентов"
              inputMode="decimal"
              isLarge
              suffix="%"
              value={sheet.value}
              onChange={(value) => setSheet({ ...sheet, value })}
              onEnter={() => saveRaise(sheet.value, sheet.raiseOwn)}
              onCancel={closeSheet}
            />
          </Field>
          {usualRows.map((row) => (
            <AmountLine
              key={row.key}
              amount={
                parsed.ok && row.usual.rate !== null
                  ? `${formatWhole(row.usual.rate)} → ${formatWhole(raisedRate(row.usual.rate, parsed.value))}`
                  : formatWhole(row.usual.rate ?? 0)
              }
            >
              {row.label}
            </AmountLine>
          ))}
          <Field label="Свои ставки мастеров">
            <Tabs
              value={sheet.raiseOwn ? 'yes' : 'no'}
              options={[
                { value: 'yes', label: 'Тоже поднять' },
                { value: 'no', label: 'Не трогать' },
              ]}
              onChange={(value) => setSheet({ ...sheet, raiseOwn: value === 'yes' })}
            />
          </Field>
        </Sheet>
      );
    }

    if (sheet.kind === 'newKind') {
      return (
        <Sheet
          title="Новый вид решётки"
          isBusy={isSaving}
          onClose={closeSheet}
          footer={footer(
            'Добавить вид',
            () => saveNewKind(sheet.kindId, sheet.rateId, sheet.name, sheet.value),
            'Вид появится и в Ценах. Все мастера получают обычную ставку, свою можно поставить потом.',
          )}
        >
          <Field label="Название">
            <TextInput
              label="Название"
              value={sheet.name}
              onChange={(name) => setSheet({ ...sheet, name })}
              onCancel={closeSheet}
            />
          </Field>
          <Field label="Обычная ставка цеха за м², сум" error={error}>
            <TextInput
              label="Обычная ставка цеха за м², сум"
              inputMode="numeric"
              isMoney
              isLarge
              suffix="сум"
              value={sheet.value}
              onChange={(value) => setSheet({ ...sheet, value })}
              onEnter={() => saveNewKind(sheet.kindId, sheet.rateId, sheet.name, sheet.value)}
              onCancel={closeSheet}
            />
          </Field>
        </Sheet>
      );
    }

    if (sheet.kind === 'special') {
      const taken = new Set(rows.flatMap((row) => (row.designId === null ? [] : [row.designId])));
      const options = catalog.designs
        .filter((design) => !taken.has(design.id))
        .sort((left, right) => left.name.localeCompare(right.name, 'ru', { numeric: true }))
        .map((design) => ({ value: design.id, label: design.name || 'Без названия' }));

      return (
        <Sheet
          title="Особая решётка"
          isBusy={isSaving}
          onClose={closeSheet}
          footer={footer(
            'Сохранить',
            () => saveSpecial(sheet.rateId, sheet.designId, sheet.value),
            'Для решётки сложнее своего вида. Её проёмы платятся по этой строке.',
          )}
        >
          <Field label="Решётка">
            <SelectInput
              label="Решётка"
              value={sheet.designId}
              options={[{ value: '', label: 'Выберите решётку' }, ...options]}
              onChange={(designId) => setSheet({ ...sheet, designId })}
            />
          </Field>
          <Field label="Обычная ставка цеха за м², сум" error={error}>
            <TextInput
              label="Обычная ставка цеха за м², сум"
              inputMode="numeric"
              isMoney
              isLarge
              suffix="сум"
              value={sheet.value}
              onChange={(value) => setSheet({ ...sheet, value })}
              onEnter={() => saveSpecial(sheet.rateId, sheet.designId, sheet.value)}
              onCancel={closeSheet}
            />
          </Field>
        </Sheet>
      );
    }

    if (sheet.kind === 'master') {
      const candidates = workers
        .filter((worker) => worker.isActive && !worker.categories.includes('MASTER'))
        .map((worker) => ({ value: worker.id, label: worker.name || 'Без имени' }));

      return (
        <Sheet
          title="Мастер в таблицу"
          isBusy={isSaving}
          onClose={closeSheet}
          footer={footer(
            'Добавить',
            () => saveMaster(sheet.workerId, sheet.copyFrom),
            'Работник станет мастером цеха. Потом можно поменять отдельные клетки.',
          )}
        >
          {candidates.length === 0 ? (
            <Hint text="Все работники уже в таблице. Нового работника добавьте во вкладке «Работники» и отметьте «Цех»." />
          ) : (
            <>
              <Field label="Работник" error={error}>
                <SelectInput
                  label="Работник"
                  value={sheet.workerId}
                  options={[{ value: '', label: 'Выберите работника' }, ...candidates]}
                  onChange={(workerId) => setSheet({ ...sheet, workerId })}
                />
              </Field>
              <Field label="Ставки">
                <SelectInput
                  label="Ставки"
                  value={sheet.copyFrom}
                  options={[
                    { value: USUAL, label: 'Как обычно' },
                    ...masters.map((master) => ({ value: master.id, label: `Как у ${master.name}` })),
                  ]}
                  onChange={(copyFrom) => setSheet({ ...sheet, copyFrom })}
                />
              </Field>
            </>
          )}
        </Sheet>
      );
    }

    const design = catalog.designs.find((entry) => entry.id === sheet.designId);

    return (
      <Sheet
        title={`«${design?.name || 'Без названия'}»: вид решётки`}
        isBusy={isSaving}
        onClose={closeSheet}
        footer={footer('Сохранить', () => saveAssignKind(sheet.designId, sheet.grilleKindId))}
      >
        <Field label="Вид" error={error}>
          <SelectInput
            label="Вид"
            value={sheet.grilleKindId}
            options={[
              { value: '', label: 'Выберите вид' },
              ...rows
                .filter((row) => row.grilleKindId !== null)
                .map((row) => ({
                  value: row.grilleKindId as string,
                  label:
                    row.usual.rate === null ? row.label : `${row.label} · ${formatWhole(row.usual.rate)} за м²`,
                })),
            ]}
            onChange={(grilleKindId) => setSheet({ ...sheet, grilleKindId })}
          />
        </Field>
      </Sheet>
    );
  };

  const openSheet = (next: SheetState) => {
    setError(null);
    setFailure(null);
    setSheet(next);
  };

  const heading = {
    ...TYPE.label,
    color: colors.muted,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontSize: '12px',
    padding: `${SPACE.sm}px ${SPACE.md}px`,
    borderBottom: `1px solid ${colors.border}`,
    whiteSpace: 'nowrap',
  } as const;
  const cellStyle = {
    padding: `${SPACE.xs}px ${SPACE.md}px`,
    borderBottom: `1px solid ${colors.border}`,
    verticalAlign: 'middle',
  } as const;

  return (
    <>
      <StatTiles
        tiles={[
          { label: 'Мастеров цеха', value: String(masters.length), tone: 'neutral' },
          { label: 'Своих ставок', value: String(ownRatesCount(rows)), tone: 'neutral' },
          {
            label: 'Решёток без вида',
            value: String(designsWithoutKind),
            tone: designsWithoutKind > 0 ? 'warning' : 'neutral',
          },
          { label: `Цех за ${monthLabel.toLowerCase()}`, value: formatWhole(workshopThisMonth), tone: 'neutral' },
        ]}
      />
      <div style={{ height: SPACE.lg }} />
      <Panel
        title="Цех: ставка за м²"
        action={
          <Wrap>
            <Button onClick={() => openSheet({ kind: 'raise', value: '', raiseOwn: true })}>Поднять все на %</Button>
            <Button onClick={() => openSheet({ kind: 'newKind', kindId: randomUuid(), rateId: randomUuid(), name: '', value: '' })}>
              + Вид решётки
            </Button>
            <Button onClick={() => openSheet({ kind: 'special', rateId: randomUuid(), designId: '', value: '' })}>+ Особая решётка</Button>
            <Button onClick={() => openSheet({ kind: 'master', workerId: '', copyFrom: USUAL })}>+ Мастер</Button>
          </Wrap>
        }
        footer={
          <>
            <Wrap>
              <span style={{ ...TYPE.label, color: colors.muted }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
                    marginRight: SPACE.xs,
                    borderRadius: 3,
                    background: colors.accentTint,
                    border: `1px solid ${colors.accent}`,
                    verticalAlign: -1,
                  }}
                />
                своя ставка мастера
              </span>
              <span style={{ ...TYPE.label, color: colors.muted }}>серая: как обычно, меняется вместе с обычной</span>
            </Wrap>
            <Hint text="Нажмите на клетку, чтобы дать мастеру свою ставку или вернуть обычную. Строки таблицы и есть «Виды решёток» из Цен: добавили, переименовали или удалили вид там, таблица меняется вместе с ним." />
          </>
        }
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', ...TYPE.body }}>
            <thead>
              <tr>
                <th style={{ ...heading, textAlign: 'left' }}>Вид решётки</th>
                <th style={{ ...heading, textAlign: 'right', borderRight: `1px solid ${colors.border}` }}>
                  Обычная
                </th>
                {masters.map((master) => (
                  <th key={master.id} style={{ ...heading, textAlign: 'right' }}>
                    {master.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td style={{ ...cellStyle, minWidth: 140 }}>
                    <div>{row.label}</div>
                    {row.note ? <div style={{ ...TYPE.label, color: colors.muted }}>{row.note}</div> : null}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', borderRight: `1px solid ${colors.border}` }}>
                    <Cell
                      cell={row.usual}
                      isUsual
                      label={`${row.label}, обычная ставка`}
                      onClick={() =>
                        openSheet({
                          kind: 'usual',
                          rowKey: row.key,
                          value: row.usual.rate === null ? '' : formatWhole(row.usual.rate),
                        })
                      }
                    />
                  </td>
                  {masters.map((master) => {
                    const cell = row.byMaster[master.id];

                    return (
                      <td key={master.id} style={{ ...cellStyle, textAlign: 'right' }}>
                        <Cell
                          cell={cell}
                          label={`${master.name}, ${row.label}`}
                          onClick={() =>
                            openSheet({
                              kind: 'cell',
                              rowKey: row.key,
                              masterId: master.id,
                              isOwn: cell.isOwn,
                              value: cell.rate === null ? '' : formatWhole(cell.rate),
                            })
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {masters.length === 0 ? (
          <StaticRow>
            <Hint text="Мастеров цеха пока нет: отметьте «Цех» у работника или нажмите «+ Мастер»." />
          </StaticRow>
        ) : null}
      </Panel>
      {fixes.length > 0 ? (
        <Panel title="Нужно поправить">
          {fixes.map((fix) => (
            <StaticRow key={fix.kind === 'design' ? fix.designId : fix.rowKey}>
              <Wrap>
                <span style={{ flex: '1 1 200px' }}>
                  <span style={{ fontWeight: 600 }}>{fix.name}</span>
                  <div style={{ ...TYPE.label, color: colors.muted }}>{fix.text}</div>
                </span>
                {fix.kind === 'design' ? (
                  <Button onClick={() => openSheet({ kind: 'assignKind', designId: fix.designId, grilleKindId: '' })}>
                    Указать вид
                  </Button>
                ) : (
                  <Button onClick={() => openSheet({ kind: 'usual', rowKey: fix.rowKey, value: '' })}>
                    Поставить ставку
                  </Button>
                )}
              </Wrap>
            </StaticRow>
          ))}
        </Panel>
      ) : null}
      <Hint text="Цеху платят за м² каждого проёма по ставке его решётки. Пока в таблице нет ставки, мастеру платят по его старой ставке за м² из «Условий»." />
      {renderSheet()}
    </>
  );
};

// The mockup's statement: one line per row of «Ставки цеха», with its m², rate and sum.
export const SquareMeterSummaryTable = ({ rows }: { rows: SquareMeterSummaryRow[] }) => {
  const colors = usePalette();

  if (rows.length === 0) return null;

  const line = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr)',
    gap: SPACE.sm,
    alignItems: 'center',
    padding: `${SPACE.sm}px 0`,
    borderTop: `1px solid ${colors.border}`,
  } as const;
  const number = { ...TABULAR_NUMBERS, textAlign: 'right', whiteSpace: 'nowrap' } as const;
  const heading = {
    ...TYPE.label,
    color: colors.muted,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontSize: '12px',
  } as const;
  const totalBasis = rows.reduce((sum, row) => sum + row.basis, 0);
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div role="table" aria-label="Цех за м² по видам">
      <div role="row" style={{ ...line, borderTop: 'none' }}>
        <span role="columnheader" style={heading}>
          За что
        </span>
        <span role="columnheader" style={{ ...heading, textAlign: 'right' }}>
          м²
        </span>
        <span role="columnheader" style={{ ...heading, textAlign: 'right' }}>
          Ставка
        </span>
        <span role="columnheader" style={{ ...heading, textAlign: 'right' }}>
          Сумма
        </span>
      </div>
      {rows.map((row) => (
        <div role="row" key={row.key} style={line}>
          <span role="cell">
            {row.label}
            {row.isOwn ? (
              <span
                style={{
                  ...TYPE.label,
                  marginLeft: SPACE.sm,
                  padding: `0 ${SPACE.sm}px`,
                  borderRadius: 99,
                  background: colors.accentTint,
                  color: colors.accent,
                  fontWeight: 600,
                }}
              >
                своя
              </span>
            ) : null}
          </span>
          <span role="cell" style={number}>
            {formatQuantity(row.basis, '')}
          </span>
          <span role="cell" style={number}>
            {formatWhole(row.rate)}
          </span>
          <span role="cell" style={number}>
            {formatWhole(row.amount)}
          </span>
        </div>
      ))}
      <div role="row" style={{ ...line, borderTop: `2px solid ${colors.text}`, fontWeight: 700 }}>
        <span role="cell">Итого за м²</span>
        <span role="cell" style={number}>
          {formatQuantity(Math.round(totalBasis * 100) / 100, '')}
        </span>
        <span role="cell" />
        <span role="cell" style={number}>
          {formatWhole(totalAmount)}
        </span>
      </div>
    </div>
  );
};
