import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  openSidePanelPage,
  SidePanelPages,
  uploadFile,
  useColorScheme,
  useUserId,
} from 'twenty-sdk/front-component';

import { DISTRICT_OPTIONS, SOURCE_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import {
  buildMeasurementPayload,
  computeDraftTotal,
  computeOpeningAreaSquareMeters,
  computeOpeningQuote,
  computeOpeningsTotalAreaSquareMeters,
  computeVisorTotal,
  buildOpeningPhotoLabel,
  createEmptyOpening,
  describePhotoUploadFailure,
  formatUzbekNationalPhone,
  type GrilleOption,
  hasOpeningWithoutPrice,
  MAX_PHOTOS_PER_OPENING,
  type MeasurementDraft,
  type OpeningDraft,
  type OpeningPhoto,
  takePhotosWithinLimit,
  toDateTimeLocalInputValue,
  UZBEK_PHONE_PREFIX,
  type VisorOption,
} from 'src/measurer-form/measurer-form';
import { fromCurrency } from 'src/recalc/money';
import { formatMoney, formatQuantity } from 'src/ui/format';
import { PhotoTile } from 'src/ui/kit';
import { PALETTE, SPACE } from 'src/ui/tokens';

type SavedItem = {
  id: string;
  openingNumber: number;
  label: string;
  photoCount: number;
};

type SaveResult = {
  orderId: string;
  orderName: string | null;
  items: SavedItem[];
  failedOpeningNumbers: number[];
  photoFailureOpeningNumbers: number[];
  isVisorFailed: boolean;
};

const ORDER_NAME_POLL_ATTEMPTS = 20;
const ORDER_NAME_POLL_INTERVAL_MS = 750;
const THUMBNAIL_MAX_SIDE_PX = 160;

// crypto.randomUUID is missing in the sandbox (no secure context); keys only
// need to be unique within this page.
let openingKeySequence = 0;
const createOpeningKey = () => `opening-${openingKeySequence++}`;
let photoKeySequence = 0;
const createPhotoKey = () => `photo-${photoKeySequence++}`;

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
  visorServiceId: '',
  visorLengthMeters: '',
});

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const loadFormContext = async (userId: string) => {
  const { workspaceMembers, designs, extraServices } =
    await new CoreApiClient().query({
      workspaceMembers: {
        __args: { filter: { userId: { eq: userId } }, first: 1 },
        edges: { node: { id: true } },
      },
      // Price only: the measurer cannot read cost fields, and asking for them
      // fails the whole query.
      designs: {
        __args: { first: 200, orderBy: [{ name: 'AscNullsLast' }] },
        edges: {
          node: {
            id: true,
            name: true,
            pricePerSquareMeter: { amountMicros: true, currencyCode: true },
            photos: { url: true },
          },
        },
      },
      extraServices: {
        __args: { filter: { kind: { eq: 'VISOR' } }, first: 200 },
        edges: {
          node: {
            id: true,
            name: true,
            price: { amountMicros: true, currencyCode: true },
          },
        },
      },
    });

  return {
    measurerId: workspaceMembers?.edges[0]?.node?.id ?? null,
    grilles: (designs?.edges ?? []).map(({ node }): GrilleOption => ({
      id: node.id,
      name: node.name ?? '',
      photoUrl: node.photos?.[0]?.url ?? null,
      pricePerSquareMeter: fromCurrency(node.pricePerSquareMeter),
    })),
    visorOptions: (extraServices?.edges ?? [])
      .map(({ node }) => ({
        id: node.id,
        name: node.name ?? '',
        price: fromCurrency(node.price),
      }))
      .sort((left, right) =>
        left.name.localeCompare(right.name, 'ru', { numeric: true }),
      ),
  };
};

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// A tablet photo is several MB; previewing it at full size would push every
// one through the sandbox bridge as a data URL.
const createThumbnailUrl = async (file: File): Promise<string | null> => {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      THUMBNAIL_MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );

    canvas
      .getContext('2d')
      ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    return await readAsDataUrl(
      await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 }),
    );
  } catch {
    return null;
  }
};

// uploadFile needs this workspace's id for orderItem.photos, which differs
// from the universalIdentifier the app declares.
const fetchPhotosFieldMetadataId = async (): Promise<string | null> => {
  const { objects } = await new MetadataApiClient().query({
    objects: {
      __args: {
        paging: { first: 1 },
        filter: { universalIdentifier: { eq: IDS.orderItem.object } },
      },
      edges: { node: { fieldsList: { id: true, universalIdentifier: true } } },
    },
  });

  return (
    objects.edges[0]?.node.fieldsList?.find(
      (field) => field.universalIdentifier === IDS.orderItem.photos,
    )?.id ?? null
  );
};

const attachOpeningPhotos = async (
  item: SavedItem,
  photos: OpeningPhoto[],
  fieldMetadataId: string,
): Promise<number> => {
  const uploaded: { fileId: string; label: string }[] = [];

  for (const [index, photo] of photos.entries()) {
    const result = await uploadFile(photo.file, {
      fieldMetadataId,
      fileName: photo.file.name,
    });

    if (result.status === 'uploaded') {
      uploaded.push({
        fileId: result.file.fileId,
        // A tablet camera names every shot image.jpg.
        label: buildOpeningPhotoLabel(
          item.openingNumber,
          index + 1,
          photo.file.name,
        ),
      });
    }
  }

  if (uploaded.length > 0) {
    await new CoreApiClient().mutation({
      updateOrderItem: {
        __args: { id: item.id, data: { photos: uploaded } },
        id: true,
      },
    });
  }

  return uploaded.length;
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
  const [grilles, setGrilles] = useState<GrilleOption[]>([]);
  const [visorOptions, setVisorOptions] = useState<VisorOption[]>([]);
  const [measurerId, setMeasurerId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [photoLimitNotice, setPhotoLimitNotice] = useState<{
    openingKey: string;
    skippedCount: number;
  } | null>(null);
  const [photoPickCount, setPhotoPickCount] = useState(0);

  useEffect(() => {
    if (userId === null) return;

    loadFormContext(userId)
      .then((context) => {
        setGrilles(context.grilles);
        setVisorOptions(context.visorOptions);
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
    thumbnail: {
      alignItems: 'center',
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: '6px',
      boxSizing: 'border-box',
      display: 'flex',
      height: '88px',
      justifyContent: 'center',
      overflow: 'hidden',
      padding: 0,
      position: 'relative',
      width: '88px',
    },
    removePhotoButton: {
      background: 'rgba(0, 0, 0, 0.6)',
      border: 'none',
      borderRadius: '50%',
      color: '#ffffff',
      cursor: 'pointer',
      fontSize: '18px',
      height: '32px',
      lineHeight: '32px',
      padding: 0,
      position: 'absolute',
      right: '4px',
      top: '4px',
      width: '32px',
    },
    visuallyHidden: {
      height: '1px',
      opacity: 0,
      overflow: 'hidden',
      position: 'absolute',
      width: '1px',
    },
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

  const updateOpeningPhotos = (
    openingKey: string,
    update: (photos: OpeningPhoto[]) => OpeningPhoto[],
  ) =>
    setDraft((current) => ({
      ...current,
      openings: current.openings.map((opening) =>
        opening.key === openingKey
          ? { ...opening, photos: update(opening.photos) }
          : opening,
      ),
    }));

  // Photos join the draft before their thumbnails exist, so a save started
  // while thumbnails are still being drawn still uploads them.
  const addPhotos = async (opening: OpeningDraft, files: File[]) => {
    setPhotoPickCount((count) => count + 1);

    const { photos, skippedCount } = takePhotosWithinLimit(
      opening.photos,
      files
        .filter((file) => file.type.startsWith('image/'))
        .map((file) => ({ key: createPhotoKey(), file, thumbnailUrl: null })),
    );
    const added = photos.slice(opening.photos.length);

    setPhotoLimitNotice(
      skippedCount > 0 ? { openingKey: opening.key, skippedCount } : null,
    );
    updateOpeningPhotos(
      opening.key,
      (current) => takePhotosWithinLimit(current, added).photos,
    );

    // One at a time: decoding several camera photos at once can exhaust a
    // tablet's memory.
    for (const photo of added) {
      const thumbnailUrl = await createThumbnailUrl(photo.file);

      updateOpeningPhotos(opening.key, (current) =>
        current.map((candidate) =>
          candidate.key === photo.key
            ? { ...candidate, thumbnailUrl }
            : candidate,
        ),
      );
    }
  };

  const removePhoto = (openingKey: string, photoKey: string) =>
    updateOpeningPhotos(openingKey, (photos) =>
      photos.filter((photo) => photo.key !== photoKey),
    );

  const resetForm = () => {
    setDraft(createEmptyDraft());
    setErrors([]);
    setResult(null);
    setPhotoLimitNotice(null);
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
          photoCount: 0,
        });
      } catch {
        failedOpeningNumbers.push(index + 1);
      }
    }

    // Photos go up only once their item exists, so a failed upload never
    // costs the measurer the order.
    const photoFailureOpeningNumbers: number[] = [];
    const itemsWithPhotos = items.filter(
      (item) => draft.openings[item.openingNumber - 1].photos.length > 0,
    );

    if (itemsWithPhotos.length > 0) {
      const photosFieldMetadataId = await fetchPhotosFieldMetadataId().catch(
        () => null,
      );

      for (const item of itemsWithPhotos) {
        const photos = draft.openings[item.openingNumber - 1].photos;

        if (photosFieldMetadataId !== null) {
          item.photoCount = await attachOpeningPhotos(
            item,
            photos,
            photosFieldMetadataId,
          ).catch(() => 0);
        }

        if (item.photoCount < photos.length) {
          photoFailureOpeningNumbers.push(item.openingNumber);
        }
      }
    }

    let isVisorFailed = false;

    if (payload.visor !== null) {
      try {
        const { createOrderExtraService } = await client.mutation({
          createOrderExtraService: {
            __args: { data: { ...payload.visor, orderId } },
            id: true,
          },
        });

        if (!createOrderExtraService?.id) throw new Error('empty response');
      } catch {
        isVisorFailed = true;
      }
    }

    const orderName = await waitForOrderName(orderId).catch(() => null);

    setResult({
      orderId,
      orderName,
      items,
      failedOpeningNumbers,
      photoFailureOpeningNumbers,
      isVisorFailed,
    });
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
          {result.isVisorFailed && (
            <p role="alert" style={styles.error}>
              Заказ создан, но козырёк не сохранён. Откройте заказ и добавьте
              его в доп. услуги вручную.
            </p>
          )}
          {result.photoFailureOpeningNumbers.length > 0 && (
            <p role="alert" style={styles.error}>
              {describePhotoUploadFailure(result.photoFailureOpeningNumbers)}
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
                  {item.photoCount > 0 && `, фото: ${item.photoCount}`}
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
  const openingsTotal = computeDraftTotal(draft.openings, grilles);
  const visorTotal = computeVisorTotal(draft, visorOptions);
  const draftTotal =
    openingsTotal === null ||
    (draft.visorServiceId !== '' && visorTotal === null)
      ? null
      : openingsTotal + (visorTotal ?? 0);
  const totalAwaitsManagerPrice = hasOpeningWithoutPrice(
    draft.openings,
    grilles,
  );

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
        const hasSize = computeOpeningAreaSquareMeters(opening) !== null;
        // All pieces, so the area and the sum beside it describe the same thing.
        const areaText = formatQuantity(
          computeOpeningsTotalAreaSquareMeters([opening]),
          'м²',
        );
        const quote = computeOpeningQuote(opening, grilles);

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
              {/* A visor-only order needs no opening. */}
              {(draft.openings.length > 1 || draft.visorServiceId !== '') && (
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => removeOpening(opening.key)}
                >
                  Удалить проём
                </button>
              )}
            </div>
            <div style={styles.wide}>
              <div style={{ ...styles.label, marginBottom: '6px' }}>
                Решётка
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                  gap: SPACE.sm,
                }}
              >
                {grilles.map((grille) => (
                  <PhotoTile
                    key={grille.id}
                    name={grille.name}
                    photoUrl={grille.photoUrl}
                    isSelected={opening.designId === grille.id}
                    onSelect={() =>
                      updateOpening(opening.key, { designId: grille.id })
                    }
                    caption={
                      opening.designId === grille.id &&
                      grille.pricePerSquareMeter !== null
                        ? `${formatMoney(grille.pricePerSquareMeter)} за м²`
                        : undefined
                    }
                  />
                ))}
                <PhotoTile
                  name="Другая"
                  photoUrl={null}
                  isSelected={opening.designId === ''}
                  onSelect={() => updateOpening(opening.key, { designId: '' })}
                />
              </div>
            </div>
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
            {hasSize && (
              <div style={styles.area}>
                {quote === null
                  ? areaText
                  : `${areaText} · ${formatMoney(quote.lineTotal)}`}
              </div>
            )}
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
            <div style={styles.wide}>
              <div style={{ ...styles.label, marginBottom: '6px' }}>
                Фото: {opening.photos.length} из {MAX_PHOTOS_PER_OPENING}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {opening.photos.map((photo, photoIndex) => (
                  <div key={photo.key} style={styles.thumbnail}>
                    {photo.thumbnailUrl === null ? (
                      <span style={{ fontSize: '12px', padding: '4px' }}>
                        {photo.file.name}
                      </span>
                    ) : (
                      <img
                        src={photo.thumbnailUrl}
                        alt={`Фото ${photoIndex + 1}, проём ${index + 1}`}
                        style={{
                          height: '100%',
                          objectFit: 'cover',
                          width: '100%',
                        }}
                      />
                    )}
                    <button
                      type="button"
                      aria-label={`Удалить фото ${photoIndex + 1}, проём ${index + 1}`}
                      style={styles.removePhotoButton}
                      onClick={() => removePhoto(opening.key, photo.key)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {opening.photos.length < MAX_PHOTOS_PER_OPENING && (
                  <label
                    style={{
                      ...styles.secondaryButton,
                      ...styles.thumbnail,
                      color: colors.accent,
                      flexDirection: 'column',
                    }}
                  >
                    + Фото
                    {/* No capture attribute: tablets then offer both the
                        camera and the gallery. Re-keyed per pick so choosing
                        the same file again still fires onChange. */}
                    <input
                      key={photoPickCount}
                      type="file"
                      accept="image/*"
                      multiple
                      aria-label={`Добавить фото, проём ${index + 1}`}
                      style={styles.visuallyHidden}
                      onChange={(event) =>
                        addPhotos(opening, Array.from(event.target.files ?? []))
                      }
                    />
                  </label>
                )}
              </div>
              {photoLimitNotice?.openingKey === opening.key && (
                <p role="status" style={{ ...styles.error, margin: '8px 0 0' }}>
                  Не больше {MAX_PHOTOS_PER_OPENING} фото на проём: лишние (
                  {photoLimitNotice.skippedCount}) не добавлены.
                </p>
              )}
            </div>
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

      <h3 style={styles.heading}>Козырёк</h3>
      <section style={styles.section}>
        {field(
          'Козырёк',
          <select
            style={styles.input}
            value={draft.visorServiceId}
            onChange={(event) =>
              updateDraft({ visorServiceId: event.target.value })
            }
          >
            <option value="">Не нужен</option>
            {visorOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.price === null
                  ? option.name
                  : `${option.name} · ${formatMoney(option.price)} за п.м.`}
              </option>
            ))}
          </select>,
        )}
        {draft.visorServiceId !== '' &&
          field(
            'Длина, м',
            <input
              inputMode="decimal"
              style={styles.input}
              value={draft.visorLengthMeters}
              onChange={(event) =>
                updateDraft({ visorLengthMeters: event.target.value })
              }
            />,
          )}
        {visorTotal !== null && (
          <div style={styles.area}>{formatMoney(visorTotal)}</div>
        )}
      </section>

      <p style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 16px' }}>
        Итого площадь: {formatQuantity(totalAreaSquareMeters, 'м²')}
      </p>

      {(draftTotal !== null || totalAwaitsManagerPrice) && (
        <p style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 16px' }}>
          {draftTotal === null
            ? 'Цену назовёт менеджер'
            : `Итого: ${formatMoney(draftTotal)}`}
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
