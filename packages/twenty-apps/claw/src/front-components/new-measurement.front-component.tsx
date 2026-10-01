import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  openSidePanelPage,
  SidePanelPages,
  useColorScheme,
  useUserId,
} from 'twenty-sdk/front-component';

import {
  DISTRICT_OPTIONS,
  METAL_OPTIONS,
  METAL_SIZE_OPTIONS,
  SOURCE_OPTIONS,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import {
  buildMeasurementPayload,
  computeDraftTotal,
  computeOpeningAreaSquareMeters,
  computeOpeningQuote,
  computeOpeningsTotalAreaSquareMeters,
  createEmptyOpening,
  formatUzbekNationalPhone,
  type MeasurementDraft,
  type OpeningDraft,
  type QuotePriceEntry,
  toDateTimeLocalInputValue,
  UZBEK_PHONE_PREFIX,
} from 'src/measurer-form/measurer-form';
import { fromCurrency } from 'src/recalc/money';

type Design = { id: string; name: string };

type SavedItem = { id: string; openingNumber: number; label: string };

type SaveResult = {
  orderId: string;
  orderName: string | null;
  items: SavedItem[];
  failedOpeningNumbers: number[];
};

const ORDER_NAME_POLL_ATTEMPTS = 20;
const ORDER_NAME_POLL_INTERVAL_MS = 750;

const PALETTE = {
  light: {
    text: '#1f1f1f',
    muted: '#666666',
    border: '#d6d6d6',
    surface: '#ffffff',
    panel: '#f6f6f6',
    accent: '#1961ed',
    danger: '#b42318',
    success: '#067647',
  },
  dark: {
    text: '#ebebeb',
    muted: '#a6a6a6',
    border: '#3d3d3d',
    surface: '#1b1b1b',
    panel: '#242424',
    accent: '#5b8def',
    danger: '#f97066',
    success: '#47cd89',
  },
} as const;

// crypto.randomUUID is missing in the sandbox (no secure context); keys only
// need to be unique within this page.
let openingKeySequence = 0;
const createOpeningKey = () => `opening-${openingKeySequence++}`;

const createEmptyDraft = (): MeasurementDraft => ({
  clientName: '',
  clientPhone: '',
  district: '',
  addressLine: '',
  floor: '',
  source: '',
  measurementDate: toDateTimeLocalInputValue(new Date()),
  comment: '',
  openings: [createEmptyOpening(createOpeningKey())],
});

const formatSquareMeters = (value: number) =>
  `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} м²`;

const formatMoney = (value: number) =>
  `${value.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} сум`;

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const loadFormContext = async (userId: string) => {
  const { workspaceMembers, designs, priceListItems } =
    await new CoreApiClient().query({
      workspaceMembers: {
        __args: { filter: { userId: { eq: userId } }, first: 1 },
        edges: { node: { id: true } },
      },
      designs: {
        __args: { first: 200, orderBy: [{ name: 'AscNullsLast' }] },
        edges: { node: { id: true, name: true } },
      },
      // Price only: the measurer cannot read cost fields, and asking for them
      // fails the whole query.
      priceListItems: {
        __args: { first: 200 },
        edges: {
          node: {
            designId: true,
            metal: true,
            metalSize: true,
            pricePerSquareMeter: { amountMicros: true, currencyCode: true },
          },
        },
      },
    });

  return {
    measurerId: workspaceMembers?.edges[0]?.node?.id ?? null,
    designs: (designs?.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name ?? '',
    })),
    priceList: (priceListItems?.edges ?? []).map(({ node }) => ({
      designId: node.designId ?? null,
      metal: node.metal ?? null,
      metalSize: node.metalSize ?? null,
      pricePerSquareMeter: fromCurrency(node.pricePerSquareMeter),
    })),
  };
};

// The on-order-created trigger numbers the order a moment after it exists.
const waitForOrderName = async (orderId: string): Promise<string | null> => {
  for (let attempt = 0; attempt < ORDER_NAME_POLL_ATTEMPTS; attempt++) {
    const { orders } = await new CoreApiClient().query({
      orders: {
        __args: { filter: { id: { eq: orderId } }, first: 1 },
        edges: { node: { name: true } },
      },
    });
    const name = orders?.edges[0]?.node?.name ?? '';

    if (name !== '') return name;

    await wait(ORDER_NAME_POLL_INTERVAL_MS);
  }

  return null;
};

const NewMeasurement = () => {
  const colors = PALETTE[useColorScheme()];
  const userId = useUserId();
  const [draft, setDraft] = useState<MeasurementDraft>(createEmptyDraft);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [priceList, setPriceList] = useState<QuotePriceEntry[]>([]);
  const [measurerId, setMeasurerId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);

  useEffect(() => {
    if (userId === null) return;

    loadFormContext(userId)
      .then((context) => {
        setDesigns(context.designs);
        setPriceList(context.priceList);
        setMeasurerId(context.measurerId);

        if (context.measurerId === null) {
          setLoadError('Не удалось определить текущего пользователя.');
        }
      })
      .catch((error: unknown) =>
        setLoadError(`Не удалось загрузить форму: ${describeError(error)}`),
      );
  }, [userId]);

  const styles = {
    page: {
      boxSizing: 'border-box',
      color: colors.text,
      fontFamily: 'inherit',
      fontSize: '16px',
      margin: '0 auto',
      maxWidth: '760px',
      padding: '16px',
      width: '100%',
    },
    section: {
      background: colors.panel,
      border: `1px solid ${colors.border}`,
      borderRadius: '8px',
      display: 'grid',
      gap: '12px',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      marginBottom: '16px',
      padding: '16px',
    },
    heading: { fontSize: '18px', fontWeight: 600, margin: '0 0 12px' },
    label: {
      color: colors.muted,
      display: 'flex',
      flexDirection: 'column',
      fontSize: '13px',
      gap: '4px',
    },
    wide: { gridColumn: '1 / -1' },
    input: {
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: '6px',
      boxSizing: 'border-box',
      color: colors.text,
      fontSize: '16px',
      minHeight: '44px',
      padding: '8px 10px',
      width: '100%',
    },
    primaryButton: {
      background: colors.accent,
      border: 'none',
      borderRadius: '6px',
      color: '#ffffff',
      cursor: 'pointer',
      fontSize: '16px',
      fontWeight: 600,
      minHeight: '48px',
      padding: '10px 20px',
    },
    secondaryButton: {
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: '6px',
      color: colors.text,
      cursor: 'pointer',
      fontSize: '15px',
      minHeight: '44px',
      padding: '8px 16px',
    },
    link: {
      alignItems: 'center',
      boxSizing: 'border-box',
      display: 'inline-flex',
      textDecoration: 'none',
    },
    area: { alignSelf: 'end', fontWeight: 600, paddingBottom: '10px' },
    error: { color: colors.danger, margin: '0 0 12px' },
  } satisfies Record<string, CSSProperties>;

  const updateDraft = (changes: Partial<MeasurementDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const updateOpening = (key: string, changes: Partial<OpeningDraft>) =>
    setDraft((current) => ({
      ...current,
      openings: current.openings.map((opening) =>
        opening.key === key ? { ...opening, ...changes } : opening,
      ),
    }));

  const addOpening = () =>
    setDraft((current) => ({
      ...current,
      openings: [...current.openings, createEmptyOpening(createOpeningKey())],
    }));

  const removeOpening = (key: string) =>
    setDraft((current) => ({
      ...current,
      openings: current.openings.filter((opening) => opening.key !== key),
    }));

  const resetForm = () => {
    setDraft(createEmptyDraft());
    setErrors([]);
    setResult(null);
  };

  const handleSave = async () => {
    if (measurerId === null || isSaving) return;

    const payload = buildMeasurementPayload(draft, measurerId);

    if (!payload.isValid) {
      setErrors(payload.errors);

      return;
    }

    setErrors([]);
    setIsSaving(true);

    const client = new CoreApiClient();
    let orderId: string | null = null;

    try {
      const { createOrder } = await client.mutation({
        createOrder: { __args: { data: payload.order }, id: true },
      });

      orderId = createOrder?.id ?? null;
    } catch (error) {
      setErrors([
        `Заказ не сохранён. Данные формы на месте, попробуйте ещё раз. (${describeError(error)})`,
      ]);
      setIsSaving(false);

      return;
    }

    if (orderId === null) {
      setErrors(['Заказ не сохранён: сервер не вернул номер записи.']);
      setIsSaving(false);

      return;
    }

    const items: SavedItem[] = [];
    const failedOpeningNumbers: number[] = [];

    for (const [index, item] of payload.items.entries()) {
      try {
        const { createOrderItem } = await client.mutation({
          createOrderItem: { __args: { data: { ...item, orderId } }, id: true },
        });

        if (!createOrderItem?.id) throw new Error('empty response');

        items.push({
          id: createOrderItem.id,
          openingNumber: index + 1,
          label: `${item.widthCm}×${item.heightCm}${item.projectionCm > 0 ? `×${item.projectionCm}` : ''} см, ${item.quantity} шт`,
        });
      } catch {
        failedOpeningNumbers.push(index + 1);
      }
    }

    const orderName = await waitForOrderName(orderId).catch(() => null);

    setResult({ orderId, orderName, items, failedOpeningNumbers });
    setIsSaving(false);
  };

  const openItemForPhotos = (itemId: string) =>
    openSidePanelPage({
      page: SidePanelPages.ViewRecord,
      recordId: itemId,
      objectNameSingular: 'orderItem',
    });

  if (result !== null) {
    return (
      <div style={styles.page}>
        <section style={{ ...styles.section, display: 'block' }}>
          <h2 style={{ ...styles.heading, color: colors.success }}>
            Замер сохранён
          </h2>
          <p style={{ fontSize: '22px', fontWeight: 600, margin: '0 0 16px' }}>
            Заказ {result.orderName ?? '(номер появится через минуту)'}
          </p>
          {result.failedOpeningNumbers.length > 0 && (
            <p role="alert" style={styles.error}>
              Заказ создан, но не сохранены проёмы №{' '}
              {result.failedOpeningNumbers.join(', ')}. Откройте заказ и
              добавьте их вручную.
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {/* Plain links load the page afresh: the host's cached order
                lists do not see records created through the API, and the
                SDK's client-side navigate would show them stale. */}
            <a
              href={`/object/order/${result.orderId}`}
              style={{ ...styles.primaryButton, ...styles.link }}
            >
              Открыть заказ
            </a>
            <a
              href="/objects/orders"
              style={{ ...styles.secondaryButton, ...styles.link }}
            >
              К списку заказов
            </a>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={resetForm}
            >
              Новый замер
            </button>
          </div>
        </section>
        {result.items.length > 0 && (
          <section style={{ ...styles.section, display: 'block' }}>
            <h3 style={styles.heading}>Фото проёмов</h3>
            {result.items.map((item) => (
              <div
                key={item.id}
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                }}
              >
                <span>
                  Проём {item.openingNumber}: {item.label}
                </span>
                <button
                  type="button"
                  aria-label={`Добавить фото: проём ${item.openingNumber}`}
                  style={styles.secondaryButton}
                  onClick={() => openItemForPhotos(item.id)}
                >
                  Добавить фото
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
    );
  }

  const field = (label: string, control: ReactNode, style?: CSSProperties) => (
    <label style={{ ...styles.label, ...style }}>
      {label}
      {control}
    </label>
  );

  const totalAreaSquareMeters = computeOpeningsTotalAreaSquareMeters(
    draft.openings,
  );
  const draftTotal = computeDraftTotal(draft.openings, priceList);

  return (
    <div style={styles.page}>
      <h2 style={{ ...styles.heading, fontSize: '22px' }}>Новый замер</h2>
      {loadError !== null && (
        <p role="alert" style={styles.error}>
          {loadError}
        </p>
      )}

      <h3 style={styles.heading}>Клиент</h3>
      <section style={styles.section}>
        {field(
          'Имя клиента',
          <input
            style={styles.input}
            value={draft.clientName}
            onChange={(event) =>
              updateDraft({ clientName: event.target.value })
            }
          />,
        )}
        {field(
          'Телефон',
          <span style={{ alignItems: 'center', display: 'flex', gap: '6px' }}>
            <span style={{ color: colors.text, fontSize: '16px' }}>
              {UZBEK_PHONE_PREFIX}
            </span>
            <input
              type="tel"
              inputMode="tel"
              placeholder="90 123 45 67"
              maxLength={16}
              style={styles.input}
              value={draft.clientPhone}
              onChange={(event) =>
                updateDraft({ clientPhone: event.target.value })
              }
              onBlur={() =>
                setDraft((current) => ({
                  ...current,
                  clientPhone: formatUzbekNationalPhone(current.clientPhone),
                }))
              }
            />
          </span>,
        )}
        {field(
          'Район',
          <select
            style={styles.input}
            value={draft.district}
            onChange={(event) =>
              updateDraft({
                district: event.target.value as MeasurementDraft['district'],
              })
            }
          >
            <option value="">—</option>
            {DISTRICT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>,
        )}
        {field(
          'Адрес',
          <input
            style={styles.input}
            value={draft.addressLine}
            onChange={(event) =>
              updateDraft({ addressLine: event.target.value })
            }
          />,
        )}
        {field(
          'Этаж',
          <input
            inputMode="numeric"
            style={styles.input}
            value={draft.floor}
            onChange={(event) => updateDraft({ floor: event.target.value })}
          />,
        )}
        {field(
          'Источник',
          <select
            style={styles.input}
            value={draft.source}
            onChange={(event) =>
              updateDraft({
                source: event.target.value as MeasurementDraft['source'],
              })
            }
          >
            <option value="">—</option>
            {SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>,
        )}
        {field(
          'Дата замера',
          <input
            type="datetime-local"
            style={styles.input}
            value={draft.measurementDate}
            onChange={(event) =>
              updateDraft({ measurementDate: event.target.value })
            }
          />,
          // A grid cell is too narrow to show the time part.
          styles.wide,
        )}
        {field(
          'Комментарий',
          <textarea
            rows={2}
            style={styles.input}
            value={draft.comment}
            onChange={(event) => updateDraft({ comment: event.target.value })}
          />,
          styles.wide,
        )}
      </section>

      <h3 style={styles.heading}>Проёмы</h3>
      {draft.openings.map((opening, index) => {
        const areaSquareMeters = computeOpeningAreaSquareMeters(opening);
        const quote = computeOpeningQuote(opening, priceList);

        return (
          <section
            key={opening.key}
            aria-label={`Проём ${index + 1}`}
            style={styles.section}
          >
            <div
              style={{
                ...styles.wide,
                alignItems: 'center',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <strong>Проём {index + 1}</strong>
              {draft.openings.length > 1 && (
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => removeOpening(opening.key)}
                >
                  Удалить проём
                </button>
              )}
            </div>
            {field(
              'Дизайн',
              <select
                style={styles.input}
                value={opening.designId}
                onChange={(event) =>
                  updateOpening(opening.key, { designId: event.target.value })
                }
              >
                <option value="">—</option>
                {designs.map((design) => (
                  <option key={design.id} value={design.id}>
                    {design.name}
                  </option>
                ))}
              </select>,
            )}
            {field(
              'Металл',
              <select
                style={styles.input}
                value={opening.metal}
                onChange={(event) =>
                  updateOpening(opening.key, {
                    metal: event.target.value as OpeningDraft['metal'],
                  })
                }
              >
                <option value="">—</option>
                {METAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>,
            )}
            {field(
              'Размер металла',
              <select
                style={styles.input}
                value={opening.metalSize}
                onChange={(event) =>
                  updateOpening(opening.key, {
                    metalSize: event.target.value as OpeningDraft['metalSize'],
                  })
                }
              >
                <option value="">—</option>
                {METAL_SIZE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>,
            )}
            {(
              [
                ['widthCm', 'Ширина, см', 'decimal'],
                ['heightCm', 'Высота, см', 'decimal'],
                ['projectionCm', 'Вылет, см', 'decimal'],
                ['quantity', 'Количество', 'numeric'],
              ] as const
            ).map(([key, label, inputMode]) =>
              field(
                label,
                <input
                  key={key}
                  inputMode={inputMode}
                  style={styles.input}
                  value={opening[key]}
                  onChange={(event) =>
                    updateOpening(opening.key, { [key]: event.target.value })
                  }
                />,
              ),
            )}
            <div style={styles.area}>
              Площадь:{' '}
              {areaSquareMeters === null
                ? '—'
                : formatSquareMeters(areaSquareMeters)}
              {quote !== null && (
                <>
                  <br />
                  {formatMoney(quote.pricePerSquareMeter)} за м² ·{' '}
                  {formatMoney(quote.lineTotal)}
                </>
              )}
              {quote === null &&
                areaSquareMeters !== null &&
                opening.metal !== '' && (
                  <>
                    <br />
                    Цены нет в прайсе
                  </>
                )}
            </div>
            {field(
              'Заметки',
              <textarea
                rows={2}
                style={styles.input}
                value={opening.notes}
                onChange={(event) =>
                  updateOpening(opening.key, { notes: event.target.value })
                }
              />,
              styles.wide,
            )}
          </section>
        );
      })}

      <button
        type="button"
        style={{ ...styles.secondaryButton, marginBottom: '16px' }}
        onClick={addOpening}
      >
        + Добавить проём
      </button>

      <p style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 16px' }}>
        Итого площадь: {formatSquareMeters(totalAreaSquareMeters)}
      </p>

      {draftTotal !== null && (
        <p style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 16px' }}>
          Итого: {formatMoney(draftTotal)}
        </p>
      )}

      {errors.length > 0 && (
        <div role="alert" style={styles.error}>
          {errors.map((error) => (
            <p key={error} style={{ margin: '0 0 4px' }}>
              {error}
            </p>
          ))}
        </div>
      )}

      <button
        type="button"
        style={{ ...styles.primaryButton, opacity: isSaving ? 0.6 : 1 }}
        disabled={isSaving || measurerId === null}
        onClick={handleSave}
      >
        {isSaving ? 'Сохранение…' : 'Сохранить'}
      </button>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: IDS.measurerForm.frontComponent,
  name: 'new-measurement',
  description: 'Форма замерщика: заказ и проёмы с планшета',
  component: NewMeasurement,
});
