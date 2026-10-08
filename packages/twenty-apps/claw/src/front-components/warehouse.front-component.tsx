import { Fragment, useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { defineFrontComponent } from 'twenty-sdk/define';
import { uploadFile } from 'twenty-sdk/front-component';

import { IDS } from 'src/constants/universal-identifiers';
import { useElementWidth } from 'src/measurer-form/measurer-form-ui';
import { todayInTashkent } from 'src/pricing/dates';
import {
  attachInvoicePhotos,
  createPurchase,
  createPurchaseLine,
  createStockOut,
  createSupplier,
  createSupplierPayment,
  loadStockBooks,
  type StockBooks,
} from 'src/stock/load-stock-books';
import {
  createMaterial,
  createStockMovement,
  loadStockData,
  type StockData,
  updateMinimumStock,
} from 'src/stock/load-stock-data';
import {
  buildDebtPayment,
  buildPurchaseEntry,
  buildStockOut,
  type DebtPaymentDraft,
  type PurchaseDraft,
  purchaseName,
  type StockOutDraft,
} from 'src/stock/stock-forms';
import {
  buildStockMonthReport,
  summarizePurchases,
  summarizeSuppliers,
  valueStockMovements,
} from 'src/stock/stock-ledger';
import {
  buildBuyList,
  buildRecount,
  buildStockRows,
  type BuyList,
  parseMinimumStock,
  recountSummary,
  type StockRow,
  stockValue,
} from 'src/stock/stock-screen';
import {
  MATERIALS_TABLE_MIN_WIDTH,
  MaterialsTable,
} from 'src/stock/materials-table';
import {
  DebtPaymentSheet,
  type NewMaterialDraft,
  NewMaterialSheet,
  PurchaseSheet,
  RecountSheet,
  StockOutSheet,
} from 'src/stock/stock-sheets';
import {
  buildOutEntries,
  historyLineText,
  monthLabel,
  OUT_FILTERS,
  type OutFilter,
  purchaseLinesText,
  purchaseList,
  shiftMonth,
} from 'src/stock/stock-views';
import {
  formatDayMonth,
  formatMoney,
  formatQuantity,
  formatWhole,
} from 'src/ui/format';
import {
  AmountLine,
  Button,
  EmptyState,
  ErrorNote,
  Field,
  Hint,
  InfoCards,
  LevelBar,
  Link,
  Panel,
  Row,
  Screen,
  SkeletonRows,
  StatePill,
  StatTiles,
  StaticRow,
  TabStrip,
  Tabs,
  TextInput,
  Wrap,
} from 'src/ui/kit';
import { SPACE } from 'src/ui/tokens';
import { dropKey } from 'src/utils/drop-key';
import { isAccessError } from 'src/utils/is-access-error';
import { randomUuid } from 'src/utils/random-uuid';

type Ready = { data: StockData; books: StockBooks };

type LoadState =
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'error'; message: string }
  | ({ status: 'ready' } & Ready);

type Tab = 'stock' | 'in' | 'out' | 'report';

type Errors = Record<string, string>;

type OpenSheet =
  | { kind: 'purchase'; draft: PurchaseDraft; errors: Errors }
  | { kind: 'out'; draft: StockOutDraft; errors: Errors }
  | { kind: 'recount'; typed: Record<string, string>; errors: Errors }
  | { kind: 'material'; draft: NewMaterialDraft; errors: Errors }
  | { kind: 'debt'; draft: DebtPaymentDraft; errors: Errors };

const TABS: { value: Tab; label: string }[] = [
  { value: 'stock', label: 'Остатки' },
  { value: 'in', label: 'Приход' },
  { value: 'out', label: 'Расход' },
  { value: 'report', label: 'Отчёт за месяц' },
];

// Wide enough for the materials table beside nothing else, as in the mockup.
const SCREEN_MAX_WIDTH = 1080;
const SAVED_TICK_MS = 2_000;
// The server recomputes the stock after a save. The list is read again when
// that is usually done, and once more for a slow run.
const SETTLE_REFETCH_MS = [2_000, 6_000];
const HISTORY_LINES = 5;
const UNNAMED = 'Без названия';
const SAVE_FAILED =
  'Не удалось сохранить. Проверьте интернет и нажмите "Повторить"';
const LOAD_FAILED =
  'Не удалось загрузить склад. Проверьте интернет и нажмите "Повторить"';
// Shown in place of a failure when the cause is the role, not the network.
const NO_ACCESS = 'Склад ведут владелец и менеджер';
const COPY_FAILED = 'Не удалось скопировать. Выделите список и скопируйте его';
const EMPTY_TEXT =
  'Добавьте то, что покупаете для работы: профиль, прут, краску. Приложение будет считать, сколько нужно на заказы.';
const MONEY_LINKS = [
  {
    title: 'Приход',
    text: 'Купили материал. Оплата поставщику записывается как расход денег, а долг виден у поставщика.',
  },
  {
    title: 'Расход на заказ',
    text: 'Материал ушёл в цех по составу решётки. Его цена ложится в себестоимость заказа.',
  },
  {
    title: 'Брак, отходы, недостача',
    text: 'Материал пропал без заказа. Это отдельный убыток: видно, сколько теряем за месяц.',
  },
];
const NEW_MATERIAL: NewMaterialDraft = {
  name: '',
  unit: 'METER',
  minimumStock: '',
};

const loadState = async (knownCanSeePrice?: boolean): Promise<LoadState> => {
  try {
    const client = new CoreApiClient();
    const data = await loadStockData(client, knownCanSeePrice);
    const books = await loadStockBooks(client, data.canSeePrice);

    return { status: 'ready', data, books };
  } catch (error) {
    console.error(error);

    return isAccessError(error)
      ? { status: 'forbidden' }
      : { status: 'error', message: LOAD_FAILED };
  }
};

// uploadFile needs this workspace's id for purchase.invoicePhotos, which
// differs from the universalIdentifier the app declares.
const fetchInvoicePhotosFieldId = async (): Promise<string> => {
  const { objects } = await new MetadataApiClient().query({
    objects: {
      __args: {
        paging: { first: 1 },
        filter: { universalIdentifier: { eq: IDS.purchase.object } },
      },
      edges: { node: { fieldsList: { id: true, universalIdentifier: true } } },
    },
  });
  const fieldMetadataId = objects.edges[0]?.node.fieldsList?.find(
    (field) => field.universalIdentifier === IDS.purchase.invoicePhotos,
  )?.id;

  if (!fieldMetadataId) throw new Error('purchase.invoicePhotos not found');

  return fieldMetadataId;
};

const Stock = () => {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [tab, setTab] = useState<Tab>('stock');
  const { ref: widthRef, width } = useElementWidth();
  const [month, setMonth] = useState(() => todayInTashkent().slice(0, 7));
  const [outFilter, setOutFilter] = useState<OutFilter>('all');
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
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
  const lineCount = useRef(0);
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

  const showSaved = (key: string) => {
    setSavedKey(key);
    later(
      () => setSavedKey((current) => (current === key ? null : current)),
      SAVED_TICK_MS,
    );
  };

  // A request whose answer was lost may already be stored. Each attempt at a
  // create keeps one id from the press until it goes through, so its retry
  // overwrites that record instead of adding a second one.
  const attemptId = (key: string) => {
    attemptIds.current[key] ??= randomUuid();

    return attemptIds.current[key];
  };

  // A form left or saved is not the attempt the next one continues.
  const forgetAttempts = (prefix: string) => {
    attemptIds.current = Object.fromEntries(
      Object.entries(attemptIds.current).filter(
        ([key]) => !key.startsWith(prefix),
      ),
    );
  };

  const newLineKey = () => {
    lineCount.current += 1;

    return `line-${lineCount.current}`;
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

  const { data, books } = load;
  const canSeeMoney = data.canSeePrice;
  const canPaySuppliers = books.payments !== null;
  const shownMaterials = data.materials.map((material) => {
    const onHand = settling[material.id]?.onHand ?? null;

    return onHand === null ? material : { ...material, onHand };
  });
  const materialsByName = [...shownMaterials].sort((left, right) =>
    (left.name ?? '').localeCompare(right.name ?? '', 'ru', { numeric: true }),
  );
  const onHandById = new Map(
    shownMaterials.map((material) => [material.id, material.onHand ?? 0]),
  );
  const rows = buildStockRows(shownMaterials, data.needs);
  const buyList = buildBuyList(shownMaterials, data.prices);
  const shelfValue = stockValue(shownMaterials, data.prices);
  const valued = valueStockMovements(books.movements);
  const payments = books.payments ?? [];
  const purchases = summarizePurchases({
    purchases: books.purchases,
    suppliers: books.suppliers,
    valued,
    payments,
  });
  const suppliers = summarizeSuppliers({
    suppliers: books.suppliers,
    purchases,
    payments,
  });
  const debts = suppliers.filter((supplier) => supplier.debt > 0);
  const totalDebt = debts.reduce((sum, supplier) => sum + supplier.debt, 0);
  const today = todayInTashkent();
  const unitOf = (materialId: string) =>
    shownMaterials.find((material) => material.id === materialId)?.unitLabel ??
    '';
  const nameOf = (materialId: string) =>
    shownMaterials.find((material) => material.id === materialId)?.name ||
    UNNAMED;

  const closeSheet = () => {
    if (sheet === null) return;

    // A save on its way cannot be called back, so it is not left half seen.
    if (inFlight.current.has(sheet.kind)) return;

    setFailures((current) => dropKey(current, sheet.kind));
    forgetAttempts(`${sheet.kind}:`);
    setSheet(null);
    setPhotos([]);
  };

  const openPurchase = (
    lines: { materialId: string; quantity: string; price: string }[],
  ) => {
    forgetAttempts('purchase:');
    setPhotos([]);
    setSheet({
      kind: 'purchase',
      errors: {},
      draft: {
        supplierId: '',
        newSupplierName: '',
        date: today,
        lines: (lines.length > 0
          ? lines
          : [{ materialId: '', quantity: '', price: '' }]
        ).map((line) => ({ ...line, key: newLineKey() })),
        payment: 'ALL',
        paidAmount: '',
        wallet: 'CASH',
        comment: '',
      },
    });
  };

  // Opens with what the list says to buy, at the last prices: the usual trip
  // needs only the numbers that differ corrected.
  const openPurchaseFromList = (list: BuyList) =>
    openPurchase(
      list.lines.map((line) => ({
        materialId: line.id,
        quantity: String(line.quantity).replace('.', ','),
        price: line.lastPrice === null ? '' : formatWhole(line.lastPrice),
      })),
    );

  const openOut = (materialId = '') => {
    forgetAttempts('out:');
    setSheet({
      kind: 'out',
      errors: {},
      draft: {
        kind: 'SCRAP',
        orderId: '',
        materialId,
        quantity: '',
        date: today,
        comment: '',
      },
    });
  };

  const openDebt = (supplierId = '') => {
    forgetAttempts('debt:');

    const debt = debts.find((supplier) => supplier.id === supplierId)?.debt;

    setSheet({
      kind: 'debt',
      errors: {},
      draft: {
        supplierId,
        amount: debt === undefined ? '' : formatWhole(debt),
        wallet: 'CASH',
        date: today,
        comment: '',
      },
    });
  };

  const savePurchase = (draft: PurchaseDraft) => {
    const entry = buildPurchaseEntry(draft, canSeeMoney);

    if (!entry.ok) {
      setSheet({ kind: 'purchase', draft, errors: entry.errors });

      return;
    }

    setSheet({ kind: 'purchase', draft, errors: {} });

    const { data: purchase } = entry;
    const picked = photos;

    void run('purchase', async () => {
      const client = new CoreApiClient();
      const supplierId =
        purchase.newSupplierName === null
          ? purchase.supplierId
          : attemptId('purchase:supplier');

      if (purchase.newSupplierName !== null && supplierId !== null) {
        await createSupplier(client, supplierId, purchase.newSupplierName);
      }

      const supplierName =
        purchase.newSupplierName ??
        books.suppliers.find((supplier) => supplier.id === supplierId)?.name ??
        null;
      const purchaseId = attemptId('purchase:record');

      await createPurchase(client, purchaseId, {
        name: purchaseName(purchase.date, supplierName),
        date: purchase.date,
        supplierId,
        comment: purchase.comment,
      });

      for (const [index, line] of purchase.lines.entries()) {
        await createPurchaseLine(
          client,
          attemptId(`purchase:line:${index}`),
          { id: purchaseId, date: purchase.date },
          line,
        );
      }

      if (purchase.payment !== null) {
        await createSupplierPayment(client, attemptId('purchase:payment'), {
          name: `Оплата поставщику${supplierName ? ` · ${supplierName}` : ''}`,
          amount: purchase.payment.amount,
          wallet: purchase.payment.wallet,
          date: purchase.date,
          supplierId,
          purchaseId,
          comment: null,
        });
      }

      const images = picked.filter((file) => file.type.startsWith('image/'));

      if (images.length > 0) {
        const fieldMetadataId = await fetchInvoicePhotosFieldId();
        const uploaded: { fileId: string; label: string }[] = [];

        for (const image of images) {
          const result = await uploadFile(image, {
            fieldMetadataId,
            fileName: image.name,
          });

          if (result.status !== 'uploaded') throw new Error(result.reason);

          uploaded.push({ fileId: result.file.fileId, label: image.name });
        }

        await attachInvoicePhotos(client, purchaseId, uploaded);
      }

      forgetAttempts('purchase:');
      setSheet(null);
      setPhotos([]);
      setTab('in');
      setMonth(purchase.date.slice(0, 7));
      settle(
        Object.fromEntries(
          purchase.lines.map((line) => [
            line.materialId,
            (onHandById.get(line.materialId) ?? 0) +
              purchase.lines
                .filter((other) => other.materialId === line.materialId)
                .reduce((sum, other) => sum + other.quantity, 0),
          ]),
        ),
      );
    });
  };

  const saveOut = (draft: StockOutDraft) => {
    const entry = buildStockOut(
      draft,
      draft.materialId === '' ? null : (onHandById.get(draft.materialId) ?? 0),
    );

    if (!entry.ok) {
      setSheet({ kind: 'out', draft, errors: entry.errors });

      return;
    }

    setSheet({ kind: 'out', draft, errors: {} });
    void run('out', async () => {
      await createStockOut(
        new CoreApiClient(),
        attemptId('out:record'),
        entry.data,
      );
      forgetAttempts('out:');
      setSheet(null);
      setTab('out');
      setMonth(entry.data.date.slice(0, 7));
      settle({
        [entry.data.materialId]:
          (onHandById.get(entry.data.materialId) ?? 0) - entry.data.quantity,
      });
    });
  };

  const saveRecount = (typed: Record<string, string>) => {
    const recount = buildRecount(typed, today);

    if (!recount.ok) {
      setSheet({ kind: 'recount', typed, errors: recount.errors });

      return;
    }

    // Nothing typed is nothing to save.
    if (recount.data.length === 0) {
      closeSheet();

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
          forgetAttempts(entryKey);
          counted[entry.materialId] = entry.countedQuantity;
          // A saved amount leaves the form, so whatever is sent next (the
          // retry after a failure) cannot count the material again: a second
          // recount of it would wipe its overuse figure.
          setSheet((current) =>
            current?.kind === 'recount'
              ? { ...current, typed: dropKey(current.typed, entry.materialId) }
              : current,
          );
        }

        setSheet(null);
      } finally {
        if (Object.keys(counted).length > 0) settle(counted);
      }
    });
  };

  const saveMaterial = (draft: NewMaterialDraft) => {
    const name = draft.name.trim();
    const minimumStock = parseMinimumStock(draft.minimumStock);
    const sheetErrors: Errors = {
      ...(name === '' ? { name: 'Введите название' } : {}),
      ...(minimumStock.ok ? {} : { minimumStock: minimumStock.error }),
    };

    setSheet({ kind: 'material', draft, errors: sheetErrors });

    if (name === '' || !minimumStock.ok) return;

    void run('material', async () => {
      const materialId = attemptId('material:record');

      await createMaterial(new CoreApiClient(), materialId, {
        name,
        unit: draft.unit,
        minimumStock: minimumStock.value,
      });
      forgetAttempts('material:');

      const next = await readList();

      if (next !== null) setLoad(next);

      setSheet(null);
      setTab('stock');
      setOpenId(materialId);
    });
  };

  const saveDebt = (draft: DebtPaymentDraft) => {
    const debt =
      debts.find((supplier) => supplier.id === draft.supplierId)?.debt ?? 0;
    const entry = buildDebtPayment(draft, debt);

    if (!entry.ok) {
      setSheet({ kind: 'debt', draft, errors: entry.errors });

      return;
    }

    setSheet({ kind: 'debt', draft, errors: {} });

    const supplierName =
      books.suppliers.find((supplier) => supplier.id === entry.data.supplierId)
        ?.name ?? null;

    void run('debt', async () => {
      await createSupplierPayment(
        new CoreApiClient(),
        attemptId('debt:record'),
        {
          name: `Оплата поставщику${supplierName ? ` · ${supplierName}` : ''}`,
          amount: entry.data.amount,
          wallet: entry.data.wallet,
          date: entry.data.date,
          supplierId: entry.data.supplierId,
          purchaseId: null,
          comment: entry.data.comment,
        },
      );
      forgetAttempts('debt:');
      setSheet(null);

      const next = await readList();

      if (next !== null) setLoad(next);
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
              ...current,
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

  const copyBuyList = (list: BuyList) => {
    const copied = () => {
      setCopyNote('Скопировано');
      later(() => setCopyNote(null), SAVED_TICK_MS);
    };

    try {
      void navigator.clipboard
        .writeText(list.copyText)
        .then(copied, () => setCopyNote(COPY_FAILED));
    } catch {
      setCopyNote(COPY_FAILED);
    }
  };

  const priceNote = (row: StockRow): string | null => {
    const price = data.prices[row.id];

    if (!price || price.last === null) return null;

    return [
      `Цена закупки ${formatMoney(price.last)} за ${row.unitLabel}`,
      ...(price.average !== null && price.average !== price.last
        ? [`средняя ${formatMoney(price.average)}`]
        : []),
    ].join(', ');
  };

  const renderOpenRow = (row: StockRow) => {
    const minimumKey = `${row.id}:minimumStock`;
    const history = valued
      .filter((movement) => movement.materialId === row.id)
      .slice(-HISTORY_LINES)
      .reverse();

    return (
      <>
        <Wrap>
          <Button
            variant="primary"
            onClick={() =>
              openPurchase([
                {
                  materialId: row.id,
                  quantity: '',
                  price:
                    data.prices[row.id]?.last === null ||
                    data.prices[row.id]?.last === undefined
                      ? ''
                      : formatWhole(data.prices[row.id]?.last ?? 0),
                },
              ])
            }
          >
            + Приход
          </Button>
          <Button onClick={() => openOut(row.id)}>− Расход</Button>
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
            onChange={(value) =>
              setDrafts((current) => ({ ...current, [minimumKey]: value }))
            }
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
        {priceNote(row) ? <Hint text={priceNote(row) ?? ''} /> : null}
        {history.length > 0 ? <span>История:</span> : null}
        {history.map((movement) => (
          <Hint
            key={movement.id}
            text={historyLineText(
              movement,
              row.unitLabel,
              books.orderNames,
              formatDayMonth,
            )}
          />
        ))}
      </>
    );
  };

  const renderListRow = (row: StockRow) => {
    const isOpen = openId === row.id;

    return (
      <Fragment key={row.id}>
        <Row
          title={row.name || UNNAMED}
          value={
            <span style={{ display: 'grid', gap: SPACE.xs, minWidth: 160 }}>
              <span>{`Есть ${row.onHandText} · ${row.needText}`}</span>
              <LevelBar level={row.level} tone={row.pill.tone} />
            </span>
          }
          pill={
            settling[row.id] ? (
              <StatePill tone="neutral" text="Обновляем…" />
            ) : (
              <StatePill tone={row.pill.tone} text={row.pill.text} />
            )
          }
          isOpen={isOpen}
          onToggle={() => {
            setOpenId(isOpen ? null : row.id);
            setErrors({});
          }}
        >
          {isOpen ? renderOpenRow(row) : null}
        </Row>
        {/* Outside the row, so a save that fails after the row was closed is
            still seen. */}
        {failureNote(`${row.id}:minimumStock`)}
      </Fragment>
    );
  };

  const monthPicker = (
    <Wrap>
      <Button
        label="Прошлый месяц"
        onClick={() => setMonth(shiftMonth(month, -1))}
      >
        ‹
      </Button>
      <span style={{ fontWeight: 600 }}>{monthLabel(month)}</span>
      <Button
        label="Следующий месяц"
        onClick={() => setMonth(shiftMonth(month, 1))}
      >
        ›
      </Button>
    </Wrap>
  );

  const materialButtons = (
    <Wrap>
      <Button variant="primary" onClick={() => openPurchase([])}>
        + Приход
      </Button>
      <Button onClick={() => openOut()}>− Расход</Button>
      <Button
        onClick={() => {
          forgetAttempts('recount:');
          setSheet({ kind: 'recount', typed: {}, errors: {} });
        }}
      >
        Пересчитать
      </Button>
      <Button
        onClick={() => {
          forgetAttempts('material:');
          setSheet({ kind: 'material', draft: NEW_MATERIAL, errors: {} });
        }}
      >
        + Материал
      </Button>
    </Wrap>
  );

  const renderStockTab = () => (
    <>
      {buyList.lines.length > 0 ? (
        <Panel
          title="Купить сегодня"
          subtitle={
            buyList.total === null
              ? undefined
              : `≈ ${formatMoney(buyList.total)}`
          }
          footer={
            <>
              <Wrap>
                <Button
                  variant="primary"
                  isWideOnPhone
                  onClick={() => openPurchaseFromList(buyList)}
                >
                  Записать приход
                </Button>
                <Button onClick={() => copyBuyList(buyList)}>
                  Скопировать список
                </Button>
              </Wrap>
              {copyNote === null ? null : <Hint text={copyNote} />}
            </>
          }
        >
          {buyList.lines.map((line) => (
            <StaticRow key={line.id}>
              <Wrap>
                <span style={{ flex: 1 }}>{line.name || UNNAMED}</span>
                <span>{formatQuantity(line.quantity, line.unitLabel)}</span>
                {line.sum === null ? null : (
                  <Hint text={formatMoney(line.sum)} />
                )}
              </Wrap>
            </StaticRow>
          ))}
        </Panel>
      ) : null}
      <Panel
        title="Что лежит на складе"
        action={materialButtons}
        footer={
          <Hint text="Нажмите на материал: там его история, приход, расход и запас." />
        }
      >
        {width >= MATERIALS_TABLE_MIN_WIDTH ? (
          <MaterialsTable
            rows={rows}
            prices={data.prices}
            canSeeMoney={canSeeMoney}
            openId={openId}
            settlingIds={Object.keys(settling)}
            onToggle={(rowId) => {
              setOpenId(openId === rowId ? null : rowId);
              setErrors({});
            }}
            renderOpen={(row) => (
              <>
                {renderOpenRow(row)}
                {failureNote(`${row.id}:minimumStock`)}
              </>
            )}
          />
        ) : (
          rows.map(renderListRow)
        )}
      </Panel>
      {canSeeMoney ? (
        <Panel title="Как склад связан с деньгами">
          <div style={{ padding: `0 ${SPACE.lg}px ${SPACE.lg}px` }}>
            <InfoCards cards={MONEY_LINKS} />
          </div>
        </Panel>
      ) : null}
    </>
  );

  const renderInTab = () => {
    const list = purchaseList(purchases, valued, month);
    const monthTotal = list.reduce(
      (sum, purchase) => sum + (purchase.total ?? 0),
      0,
    );

    return (
      <>
        <Panel
          title={`Приходы за ${monthLabel(month).toLowerCase()}`}
          subtitle={
            canSeeMoney && list.length > 0
              ? `всего ${formatMoney(monthTotal)}, приходов: ${list.length}`
              : undefined
          }
          action={
            <Button variant="primary" onClick={() => openPurchase([])}>
              + Новый приход
            </Button>
          }
        >
          {list.length === 0 ? (
            <StaticRow>
              <Hint text="В этом месяце приходов нет" />
            </StaticRow>
          ) : null}
          {list.map((purchase) => {
            const isOpen = openId === purchase.id;
            const linesText = purchaseLinesText(
              purchase,
              shownMaterials,
              formatWhole,
            );

            return (
              <Row
                key={purchase.id}
                title={
                  <>
                    {`${formatDayMonth(purchase.date)} · ${purchase.supplierName ?? (purchase.isLoose ? nameOf(purchase.lines[0]?.materialId ?? '') : 'Без поставщика')}`}
                    {isOpen ? null : <Hint isSmall text={linesText} />}
                  </>
                }
                value={
                  canSeeMoney && purchase.total !== null
                    ? formatMoney(purchase.total)
                    : undefined
                }
                pill={
                  !canPaySuppliers ||
                  purchase.isLoose ? undefined : purchase.debt > 0 ? (
                    <StatePill
                      tone="warning"
                      text={`Долг ${formatMoney(purchase.debt)}`}
                    />
                  ) : purchase.total !== null ? (
                    <StatePill tone="success" text="Оплачено" />
                  ) : undefined
                }
                isOpen={isOpen}
                onToggle={() => setOpenId(isOpen ? null : purchase.id)}
              >
                {isOpen ? (
                  <>
                    <span>{linesText}</span>
                    {purchase.comment ? <Hint text={purchase.comment} /> : null}
                    {canPaySuppliers &&
                    !purchase.isLoose &&
                    purchase.paid > 0 ? (
                      <Hint text={`Оплачено ${formatMoney(purchase.paid)}`} />
                    ) : null}
                    {(books.invoicePhotoCounts[purchase.id] ?? 0) > 0 ? (
                      <Link href={`/object/purchase/${purchase.id}`}>
                        Фото накладной <span aria-hidden>›</span>
                      </Link>
                    ) : null}
                    {canPaySuppliers &&
                    purchase.debt > 0 &&
                    purchase.supplierId ? (
                      <Wrap>
                        <Button
                          onClick={() => openDebt(purchase.supplierId ?? '')}
                        >
                          Отдать долг
                        </Button>
                      </Wrap>
                    ) : null}
                  </>
                ) : null}
              </Row>
            );
          })}
        </Panel>
        {suppliers.length > 0 ? (
          <Panel title="Поставщики">
            {suppliers.map((supplier) => (
              <StaticRow key={supplier.id}>
                <Wrap>
                  <span style={{ flex: 1, fontWeight: 600 }}>
                    {supplier.name}
                  </span>
                  {canPaySuppliers ? (
                    supplier.debt > 0 ? (
                      <>
                        <StatePill
                          tone="warning"
                          text={`Долг ${formatMoney(supplier.debt)}`}
                        />
                        <Button onClick={() => openDebt(supplier.id)}>
                          Отдать долг
                        </Button>
                      </>
                    ) : (
                      <StatePill tone="success" text="Долга нет" />
                    )
                  ) : null}
                </Wrap>
                <Hint
                  text={`Приходов: ${supplier.purchaseCount}${canSeeMoney ? ` на ${formatMoney(supplier.purchased)}` : ''}`}
                />
              </StaticRow>
            ))}
          </Panel>
        ) : null}
      </>
    );
  };

  const renderOutTab = () => {
    const entries = buildOutEntries({
      valued,
      month,
      filter: outFilter,
      materials: shownMaterials,
      orderNames: books.orderNames,
    });
    const total = entries.reduce((sum, entry) => sum + (entry.value ?? 0), 0);

    return (
      <>
        <Panel
          title={`Расходы за ${monthLabel(month).toLowerCase()}`}
          subtitle={
            canSeeMoney && entries.length > 0
              ? `всего ${formatMoney(total)}`
              : undefined
          }
          action={
            <Button variant="primary" onClick={() => openOut()}>
              + Записать расход
            </Button>
          }
        >
          <div style={{ padding: `0 ${SPACE.lg}px ${SPACE.lg}px` }}>
            <Tabs
              value={outFilter}
              options={OUT_FILTERS}
              onChange={setOutFilter}
            />
          </div>
          {entries.length === 0 ? (
            <StaticRow>
              <Hint text="Ничего не ушло" />
            </StaticRow>
          ) : null}
          {entries.map((entry) => (
            <StaticRow key={entry.key}>
              <Wrap>
                <span style={{ flex: 1, fontWeight: 600 }}>
                  {`${formatDayMonth(entry.date)} · `}
                  {entry.orderId === null ? (
                    entry.title
                  ) : (
                    <Link href={`/object/order/${entry.orderId}`}>
                      {entry.title}
                    </Link>
                  )}
                </span>
                {canSeeMoney && entry.value !== null ? (
                  <span>{formatMoney(entry.value)}</span>
                ) : null}
              </Wrap>
              <span>{entry.lines}</span>
              {entry.note ? (
                <Hint
                  tone={entry.isOveruse ? 'warning' : 'neutral'}
                  text={entry.note}
                />
              ) : null}
            </StaticRow>
          ))}
        </Panel>
      </>
    );
  };

  const renderReportTab = () => {
    const report = buildStockMonthReport(valued, month);
    const money = (value: number) => formatMoney(value);
    const lines: [string, number, boolean?][] = [
      [`Было на 1 число`, report.opening],
      [`Приход: ${report.receiptCount}`, report.received],
      [`Ушло на заказы: ${report.orderCount}`, -report.toOrders],
      ...(report.overuse > 0
        ? ([[`  из них сверх нормы`, -report.overuse]] as [string, number][])
        : []),
      ['Брак', -report.scrap],
      ['Отходы', -report.waste],
      [
        report.recount < 0
          ? 'Недостача при пересчёте'
          : 'Излишек при пересчёте',
        report.recount,
      ],
      ['Для цеха', -report.workshopUse],
      ['Вернул поставщику', -report.returned],
      ['Другое', -report.otherOut],
    ];

    return (
      <>
        {canSeeMoney ? (
          <Panel title="Движение склада в деньгах">
            <StaticRow>
              {lines
                .filter(([, value], index) => index < 3 || value !== 0)
                .map(([label, value]) => (
                  <AmountLine
                    key={label}
                    amount={`${value > 0 && label !== 'Было на 1 число' ? '+' : ''}${money(value)}`}
                  >
                    {label}
                  </AmountLine>
                ))}
              <AmountLine amount={money(report.closing)} isTotal>
                Осталось на конец месяца
              </AmountLine>
              {report.losses > 0 && report.toOrders > 0 ? (
                <Hint
                  tone="warning"
                  text={`Потери ${formatMoney(report.losses)}: ${Math.round((report.losses / report.toOrders) * 100)}% от того, что ушло на заказы`}
                />
              ) : null}
              {report.hasUnpriced ? (
                <Hint text="У части материала нет цены закупки: он посчитан как 0." />
              ) : null}
            </StaticRow>
          </Panel>
        ) : null}
        <Panel title="По материалам">
          {report.materials.length === 0 ? (
            <StaticRow>
              <Hint text="Движений нет" />
            </StaticRow>
          ) : null}
          {report.materials.map((line) => {
            const unit = unitOf(line.materialId);
            const amount = (value: number) => formatQuantity(value, unit);

            return (
              <StaticRow key={line.materialId}>
                <span style={{ fontWeight: 600 }}>
                  {nameOf(line.materialId)}
                </span>
                <Hint
                  text={[
                    `Было ${amount(line.opening)}`,
                    `пришло ${amount(line.received)}`,
                    `на заказы ${amount(line.toOrders)}`,
                    ...(line.lost !== 0 ? [`потери ${amount(line.lost)}`] : []),
                    ...(line.other !== 0
                      ? [`другое ${amount(line.other)}`]
                      : []),
                    `осталось ${amount(line.closing)}`,
                  ].join(' · ')}
                />
              </StaticRow>
            );
          })}
        </Panel>
      </>
    );
  };

  const renderSheet = () => {
    if (sheet === null) return null;

    if (sheet.kind === 'purchase') {
      return (
        <PurchaseSheet
          draft={sheet.draft}
          errors={sheet.errors}
          materials={materialsByName}
          suppliers={books.suppliers}
          canSeeMoney={canSeeMoney}
          isSaving={busyKeys.includes('purchase')}
          failure={failureNote('purchase', () => savePurchase(sheet.draft))}
          photoNames={photos.map((photo) => photo.name)}
          newLineKey={newLineKey}
          onChange={(draft) => {
            // What is being saved was read at the press.
            if (inFlight.current.has('purchase')) return;

            setSheet({ kind: 'purchase', draft, errors: sheet.errors });
          }}
          onPickPhotos={(files) => setPhotos(files)}
          onSave={() => savePurchase(sheet.draft)}
          onClose={closeSheet}
        />
      );
    }

    if (sheet.kind === 'out') {
      const price =
        data.prices[sheet.draft.materialId]?.average ??
        data.prices[sheet.draft.materialId]?.last ??
        null;
      const quantity = Number(sheet.draft.quantity.replace(',', '.'));

      return (
        <StockOutSheet
          draft={sheet.draft}
          errors={sheet.errors}
          materials={materialsByName}
          orders={books.orders}
          estimate={
            canSeeMoney && price !== null && quantity > 0
              ? `≈ ${formatMoney(Math.round(quantity * price))}`
              : null
          }
          isSaving={busyKeys.includes('out')}
          failure={failureNote('out', () => saveOut(sheet.draft))}
          onChange={(draft) => {
            if (inFlight.current.has('out')) return;

            setSheet({ kind: 'out', draft, errors: sheet.errors });
          }}
          onSave={() => saveOut(sheet.draft)}
          onClose={closeSheet}
        />
      );
    }

    if (sheet.kind === 'recount') {
      return (
        <RecountSheet
          materials={materialsByName}
          typed={sheet.typed}
          errors={sheet.errors}
          summary={recountSummary(sheet.typed)}
          isSaving={busyKeys.includes('recount')}
          failure={failureNote('recount', () => saveRecount(sheet.typed))}
          onType={(materialId, value) => {
            // The amounts being saved were read at the press: a change typed
            // during the save would be dropped with the old number recorded.
            if (inFlight.current.has('recount')) return;

            setSheet({
              kind: 'recount',
              typed: { ...sheet.typed, [materialId]: value },
              errors: dropKey(sheet.errors, materialId),
            });
          }}
          onSave={() => saveRecount(sheet.typed)}
          onClose={closeSheet}
        />
      );
    }

    if (sheet.kind === 'material') {
      return (
        <NewMaterialSheet
          draft={sheet.draft}
          errors={sheet.errors}
          isSaving={busyKeys.includes('material')}
          failure={failureNote('material', () => saveMaterial(sheet.draft))}
          onChange={(draft) =>
            setSheet({ kind: 'material', draft, errors: sheet.errors })
          }
          onSave={() => saveMaterial(sheet.draft)}
          onClose={closeSheet}
        />
      );
    }

    return (
      <DebtPaymentSheet
        draft={sheet.draft}
        errors={sheet.errors}
        debts={debts}
        isSaving={busyKeys.includes('debt')}
        failure={failureNote('debt', () => saveDebt(sheet.draft))}
        onChange={(draft) => {
          if (inFlight.current.has('debt')) return;

          const debt = debts.find(
            (supplier) => supplier.id === draft.supplierId,
          )?.debt;

          setSheet({
            kind: 'debt',
            // Picking another supplier offers that supplier's whole debt.
            draft:
              draft.supplierId !== sheet.draft.supplierId && debt !== undefined
                ? { ...draft, amount: formatWhole(debt) }
                : draft,
            errors: sheet.errors,
          });
        }}
        onSave={() => saveDebt(sheet.draft)}
        onClose={closeSheet}
      />
    );
  };

  if (rows.length === 0 && sheet === null) {
    return (
      <Screen title="Склад">
        <EmptyState
          text={EMPTY_TEXT}
          actionText="Добавить материал"
          onAction={() =>
            setSheet({ kind: 'material', draft: NEW_MATERIAL, errors: {} })
          }
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

  const monthReport = buildStockMonthReport(valued, month);

  return (
    <Screen
      title="Склад"
      subtitle="Приход и расход материала, с деньгами"
      maxWidth={SCREEN_MAX_WIDTH}
      action={monthPicker}
    >
      <div ref={widthRef}>
        {unsettledNote}
        <TabStrip
          value={tab}
          options={TABS}
          onChange={(next) => {
            setTab(next);
            setOpenId(null);
          }}
        />
        <div style={{ height: SPACE.lg }} />
        {canSeeMoney ? (
          <>
            <StatTiles
              tiles={[
                {
                  label: 'На складе на сумму',
                  value: shelfValue === null ? '—' : formatWhole(shelfValue),
                  tone: 'neutral',
                },
                {
                  label: 'Пришло за месяц',
                  value: `+${formatWhole(monthReport.received)}`,
                  tone: 'in',
                },
                {
                  label: 'Ушло за месяц',
                  value: `−${formatWhole(monthReport.opening + monthReport.received - monthReport.closing)}`,
                  tone: 'out',
                },
                ...(canPaySuppliers
                  ? [
                      {
                        label: 'Должны поставщикам',
                        value: formatWhole(totalDebt),
                        tone:
                          totalDebt > 0
                            ? ('warning' as const)
                            : ('neutral' as const),
                      },
                    ]
                  : []),
              ]}
            />
            <div style={{ height: SPACE.lg }} />
          </>
        ) : null}
        {tab === 'stock' ? renderStockTab() : null}
        {tab === 'in' ? renderInTab() : null}
        {tab === 'out' ? renderOutTab() : null}
        {tab === 'report' ? renderReportTab() : null}
      </div>
      {renderSheet()}
    </Screen>
  );
};

export default defineFrontComponent({
  universalIdentifier: IDS.stock.frontComponent,
  name: 'warehouse',
  description: 'Склад: остатки, приход, расход и отчёт за месяц',
  component: Stock,
});
