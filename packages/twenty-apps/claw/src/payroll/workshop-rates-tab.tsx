import { useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { type PayrollScreenWorker } from 'src/payroll/load-payroll-data';
import { type SquareMeterSummaryRow } from 'src/payroll/payroll-screen';
// Type only, as a whole statement: that module imports node:crypto, which must not reach a front component's bundle.
import type { AccrualLine } from 'src/payroll/plan-order-accruals';
import { type WorkshopCatalog } from 'src/payroll/workshop-pay';
import {
  type RateWrite,
  removeWorkshopRate,
  saveWorkshopRate,
  saveWorkshopRates,
} from 'src/payroll/workshop-rates-data';
import {
  buildRateRows,
  type CellWrite,
  hasUnpaidCell,
  legacyKindRates,
  ownRatesCount,
  parseRaisePercent,
  planBulkRate,
  planCopyColumn,
  planRaise,
  type RateCell,
  type RateMaster,
  type RateRow,
  raisedRate,
  rateRecordName,
  USUAL_COLUMN,
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
  | { kind: 'bulk'; column: string; value: string }
  | { kind: 'copy'; from: string; to: string };

const SAVE_FAILED = 'Не удалось сохранить. Проверьте интернет и нажмите "Повторить"';
const NO_ACCESS = 'Доступно только владельцу';
const FROM_TODAY = 'Для заказов, установленных с сегодня. Уже начисленное не меняется.';
const USUAL = USUAL_COLUMN;

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
  // The ticked grilles, by row key. Nothing ticked means the whole table.
  const [ticked, setTicked] = useState<string[]>([]);
  const isSavingRef = useRef(false);

  const masters: RateMaster[] = workers
    .filter((worker) => worker.isActive && worker.categories.includes('MASTER'))
    .map((worker) => ({ id: worker.id, name: worker.name || 'Без имени' }))
    .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
  const rows = buildRateRows(catalog, masters);
  const rowByKey = new Map(rows.map((row) => [row.key, row]));
  const unpaidRows = rows.filter(hasUnpaidCell).length;
  const leftovers = legacyKindRates(catalog);
  const tickedRows = rows.filter((row) => ticked.includes(row.key));
  const targetRows = tickedRows.length > 0 ? tickedRows : rows;
  const targetText =
    tickedRows.length > 0 ? `Отмечено решёток: ${tickedRows.length}` : `Все решётки: ${rows.length}`;
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

  const recordOf = (row: RateRow, workerId: string | null, rate: number, id: string) => ({
    id,
    name: rateRecordName(row, masterName(workerId)),
    grilleKindId: row.grilleKindId,
    designId: row.designId,
    workerId,
    rate,
  });

  // The ids of new cells are taken once, here, so «Повторить» overwrites the same records.
  const toWrites = (cells: CellWrite[]): RateWrite[] =>
    cells.map(({ row, workerId, recordId, rate }) => recordOf(row, workerId, rate, recordId ?? randomUuid()));

  const saveBulk = (column: string, raw: string) => {
    const rate = parseRate(raw);

    if (rate === null) {
      setError(MONEY_ERROR);

      return;
    }

    setError(null);
    const writes = toWrites(planBulkRate(targetRows, column, rate));

    void run(() => saveWorkshopRates(new CoreApiClient(), writes));
  };

  const saveCopy = (from: string, to: string) => {
    if (from === '' || to === '' || from === to) {
      setError('Выберите двух разных мастеров');

      return;
    }

    setError(null);
    const plan = planCopyColumn(targetRows, from, to);
    const writes = toWrites(plan.writes);

    void run(async () => {
      await saveWorkshopRates(new CoreApiClient(), writes);

      for (const id of plan.removeIds) {
        await removeWorkshopRate(new CoreApiClient(), id);
      }
    });
  };

  const removeLeftovers = () =>
    void run(async () => {
      for (const record of leftovers) {
        await removeWorkshopRate(new CoreApiClient(), record.id);
      }
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
    const writes = toWrites(planRaise(targetRows, parsed.value, raiseOwn));

    void run(() => saveWorkshopRates(new CoreApiClient(), writes));
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
                Убрать все ставки этой решётки
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
      const usualRows = targetRows.filter((row) => row.usual.rate !== null);

      return (
        <Sheet
          title={tickedRows.length > 0 ? 'Поднять ставки отмеченных' : 'Поднять все ставки'}
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

    if (sheet.kind === 'bulk') {
      const save = () => saveBulk(sheet.column, sheet.value);

      return (
        <Sheet
          title="Поставить ставку"
          isBusy={isSaving}
          onClose={closeSheet}
          footer={footer('Поставить', save, FROM_TODAY)}
        >
          <Hint text={`${targetText}. Чтобы поставить не всем, сначала отметьте решётки галочками.`} />
          <Field label="Кому">
            <SelectInput
              label="Кому"
              value={sheet.column}
              options={[
                { value: USUAL, label: 'Обычная: всем мастерам без своей ставки' },
                ...masters.map((master) => ({ value: master.id, label: `Своя ставка: ${master.name}` })),
              ]}
              onChange={(column) => setSheet({ ...sheet, column })}
            />
          </Field>
          <Field label="Ставка за м²" error={error}>
            <TextInput
              label="Ставка за м²"
              inputMode="numeric"
              isMoney
              isLarge
              suffix="сум"
              value={sheet.value}
              onChange={(value) => setSheet({ ...sheet, value })}
              onEnter={save}
              onCancel={closeSheet}
            />
          </Field>
        </Sheet>
      );
    }

    if (sheet.kind === 'copy') {
      const options = [
        { value: '', label: 'Выберите мастера' },
        ...masters.map((master) => ({ value: master.id, label: master.name })),
      ];

      return (
        <Sheet
          title="Скопировать ставки мастера"
          isBusy={isSaving}
          onClose={closeSheet}
          footer={footer('Скопировать', () => saveCopy(sheet.from, sheet.to), FROM_TODAY)}
        >
          <Hint text={`${targetText}. У второго мастера ставки станут такими же, как у первого.`} />
          <Field label="Чьи ставки взять">
            <SelectInput
              label="Чьи ставки взять"
              value={sheet.from}
              options={options}
              onChange={(from) => setSheet({ ...sheet, from })}
            />
          </Field>
          <Field label="Кому поставить" error={error}>
            <SelectInput
              label="Кому поставить"
              value={sheet.to}
              options={options}
              onChange={(to) => setSheet({ ...sheet, to })}
            />
          </Field>
        </Sheet>
      );
    }

    return null;
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
            label: 'Решёток без ставки',
            value: String(unpaidRows),
            tone: unpaidRows > 0 ? 'warning' : 'neutral',
          },
          { label: `Цех за ${monthLabel.toLowerCase()}`, value: formatWhole(workshopThisMonth), tone: 'neutral' },
        ]}
      />
      <div style={{ height: SPACE.lg }} />
      <Panel
        title="Цех: ставка за м²"
        action={
          <Wrap>
            <Button variant="primary" onClick={() => openSheet({ kind: 'bulk', column: USUAL, value: '' })}>
              Поставить ставку
            </Button>
            <Button onClick={() => openSheet({ kind: 'copy', from: '', to: '' })}>Скопировать мастера</Button>
            <Button onClick={() => openSheet({ kind: 'raise', value: '', raiseOwn: true })}>Поднять на %</Button>
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
            <Hint text="Строки таблицы и есть решётки из «Цен»: новая решётка появляется здесь сама. Нажмите на клетку, чтобы поменять одну ставку. Чтобы поставить сразу много, отметьте решётки галочками и нажмите «Поставить ставку»; без галочек кнопки работают для всех решёток." />
          </>
        }
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', ...TYPE.body }}>
            <thead>
              <tr>
                <th style={{ ...heading, width: 1 }}>
                  <input
                    type="checkbox"
                    aria-label="Отметить все решётки"
                    checked={rows.length > 0 && tickedRows.length === rows.length}
                    onChange={(event) => setTicked(event.target.checked ? rows.map((row) => row.key) : [])}
                    style={{ width: 20, height: 20, accentColor: colors.accent }}
                  />
                </th>
                <th style={{ ...heading, textAlign: 'left' }}>Решётка</th>
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
                  <td style={cellStyle}>
                    <input
                      type="checkbox"
                      aria-label={`Отметить ${row.label}`}
                      checked={ticked.includes(row.key)}
                      onChange={(event) =>
                        setTicked((current) =>
                          event.target.checked
                            ? [...current, row.key]
                            : current.filter((key) => key !== row.key),
                        )
                      }
                      style={{ width: 20, height: 20, accentColor: colors.accent }}
                    />
                  </td>
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
            <Hint text="Мастеров цеха пока нет. Добавьте работника в «Команде» и отметьте ему работу «Мастер»: у него появится столбец." />
          </StaticRow>
        ) : null}
      </Panel>
      {leftovers.length > 0 ? (
        <Panel title="Остались старые ставки по видам решёток">
          <StaticRow>
            <Wrap>
              <span style={{ flex: '1 1 200px' }}>
                {`Их ${leftovers.length}. Они ещё платят за решётку, у которой в таблице нет ставки.`}
              </span>
              <Button isBusy={isSaving} onClick={removeLeftovers}>
                Убрать старые ставки
              </Button>
            </Wrap>
            {sheet === null ? failureNote : null}
          </StaticRow>
        </Panel>
      ) : null}
      <Hint text="Цеху платят за м² каждого проёма по ставке его решётки у этого мастера. Ставка действует для заказов, установленных со дня, когда её сохранили: уже начисленное не меняется. Столбцы таблицы и есть мастера цеха: их добавляют в «Команде»." />
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
