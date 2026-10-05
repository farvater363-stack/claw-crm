import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
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

import { AWAITING_MEASUREMENT_STATUSES } from 'src/constants/order-status-sets';
import {
  DISCOUNT_KIND_OPTIONS,
  type DiscountKind,
  DISTRICT_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethod,
  SOURCE_OPTIONS,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import {
  buildMeasurementPayload,
  computeDraftTotal,
  computeOpeningAreaSquareMeters,
  computeOpeningQuote,
  computeOpeningsTotalAreaSquareMeters,
  computeOpeningVisorTotal,
  computePaymentPreview,
  buildOpeningPhotoLabel,
  createEmptyOpening,
  describePhotoUploadFailure,
  draftFromScheduledOrder,
  EMPTY_PAYMENT_DRAFT,
  formatUzbekNationalPhone,
  type GrilleOption,
  isVisorOnlyOpening,
  MAX_PHOTOS_PER_OPENING,
  MEASUREMENT_ORDER_STORAGE_KEY,
  type MeasurementDraft,
  NEW_CLIENT_TARGET,
  type OpeningDraft,
  type OpeningPhoto,
  type PaymentDraft,
  resolveTargetOrderId,
  type ScheduledOrder,
  scheduledOrderLabel,
  sortScheduledOrders,
  takePhotosWithinLimit,
  toDateTimeLocalInputValue,
  toOrderUpdateData,
  UZBEK_PHONE_PREFIX,
  type VisorOption,
} from 'src/measurer-form/measurer-form';
import { todayInTashkent } from 'src/pricing/dates';
import { fromCurrency, toCurrency } from 'src/recalc/money';
import { formatMoney, formatQuantity } from 'src/ui/format';
import { Columns, Field, PhotoTile, SelectInput, TextInput } from 'src/ui/kit';
import { PALETTE, SPACE } from 'src/ui/tokens';
import { randomUuid } from 'src/utils/random-uuid';

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
  isPaymentFailed: boolean;
  isSignatureFailed: boolean;
};

type Step = 'measurement' | 'payment';

type SignaturePoint = { x: number; y: number };
type SignatureStroke = SignaturePoint[];

const ORDER_NAME_POLL_ATTEMPTS = 20;
const ORDER_NAME_POLL_INTERVAL_MS = 750;
const THUMBNAIL_MAX_SIDE_PX = 160;

// An opening's key is also the id of the order item it is saved as, so a save
// sent twice writes the same item again and does not add a second one.
const createOpening = () => createEmptyOpening(randomUuid(), randomUuid());
// crypto.randomUUID is missing in the sandbox (no secure context); keys only
// need to be unique within this page.
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
  openings: [createOpening()],
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
    grilles: (designs?.edges ?? []).map(
      ({ node }): GrilleOption => ({
        id: node.id,
        name: node.name ?? '',
        photoUrl: node.photos?.[0]?.url ?? null,
        pricePerSquareMeter: fromCurrency(node.pricePerSquareMeter),
      }),
    ),
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

const SCHEDULED_ORDERS_LIMIT = 50;

// Read once and removed, so a later visit to the form starts with nothing picked.
const readPreselectedOrderId = (): string | null => {
  try {
    const orderId = globalThis.sessionStorage.getItem(
      MEASUREMENT_ORDER_STORAGE_KEY,
    );

    globalThis.sessionStorage.removeItem(MEASUREMENT_ORDER_STORAGE_KEY);

    return orderId;
  } catch {
    return null;
  }
};

// The measurer's own scheduled measurements, plus the order the form was opened
// for, whoever its measurer is (a manager can open it from the order card).
const loadScheduledOrders = async (
  measurerId: string,
  preselectedOrderId: string | null,
): Promise<ScheduledOrder[]> => {
  const { orders } = await new CoreApiClient().query({
    orders: {
      __args: {
        filter: {
          or: [
            {
              measurerId: { eq: measurerId },
              status: { in: [...AWAITING_MEASUREMENT_STATUSES] },
            },
            ...(preselectedOrderId === null
              ? []
              : [{ id: { eq: preselectedOrderId } }]),
          ],
        },
        first: SCHEDULED_ORDERS_LIMIT,
      },
      edges: {
        node: {
          id: true,
          name: true,
          clientName: true,
          clientPhone: true,
          district: true,
          addressLine: true,
          floor: true,
          measurementDate: true,
          comment: true,
          source: true,
        },
      },
    },
  });

  return sortScheduledOrders(
    (orders?.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name ?? '',
      clientName: node.clientName ?? null,
      clientPhone: node.clientPhone ?? null,
      district: node.district ?? null,
      addressLine: node.addressLine ?? null,
      floor:
        node.floor === null || node.floor === undefined
          ? null
          : Number(node.floor),
      measurementDate: node.measurementDate ?? null,
      comment: node.comment ?? null,
      source: node.source ?? null,
    })),
  );
};

// One set per filled form: every record a save creates carries its id, so a
// save sent twice (a lost response, a double tap) writes the same records again
// and never a second order or prepayment.
const createSaveIds = () => ({
  order: randomUuid(),
  payment: randomUuid(),
});

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

// uploadFile needs this workspace's id of the files field, which differs from
// the universalIdentifier the app declares.
const fetchFieldMetadataId = async (
  objectUniversalIdentifier: string,
  fieldUniversalIdentifier: string,
): Promise<string | null> => {
  const { objects } = await new MetadataApiClient().query({
    objects: {
      __args: {
        paging: { first: 1 },
        filter: { universalIdentifier: { eq: objectUniversalIdentifier } },
      },
      edges: { node: { fieldsList: { id: true, universalIdentifier: true } } },
    },
  });

  return (
    objects.edges[0]?.node.fieldsList?.find(
      (field) => field.universalIdentifier === fieldUniversalIdentifier,
    )?.id ?? null
  );
};

const SIGNATURE_PAD_HEIGHT_PX = 180;
const SIGNATURE_PADDING_PX = 12;
const SIGNATURE_FILE_NAME = 'Подпись клиента.png';

// The sandbox has no <canvas> element, so the strokes are kept as points,
// shown as SVG and drawn into an image only when the order is saved.
const renderSignatureFile = async (
  strokes: SignatureStroke[],
): Promise<File> => {
  const points = strokes.flat();
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const canvas = new OffscreenCanvas(
    Math.max(...points.map((point) => point.x)) -
      left +
      2 * SIGNATURE_PADDING_PX,
    Math.max(...points.map((point) => point.y)) -
      top +
      2 * SIGNATURE_PADDING_PX,
  );
  const context = canvas.getContext('2d');

  if (context === null) throw new Error('no 2d context');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#000000';
  context.lineWidth = 2;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.translate(SIGNATURE_PADDING_PX - left, SIGNATURE_PADDING_PX - top);

  for (const stroke of strokes) {
    context.beginPath();
    context.moveTo(stroke[0].x, stroke[0].y);
    // Starts with the first point again, so a single tap leaves a dot.
    stroke.forEach((point) => context.lineTo(point.x, point.y));
    context.stroke();
  }

  return new File(
    [await canvas.convertToBlob({ type: 'image/png' })],
    SIGNATURE_FILE_NAME,
    { type: 'image/png' },
  );
};

const attachClientSignature = async (
  orderId: string,
  strokes: SignatureStroke[],
) => {
  const fieldMetadataId = await fetchFieldMetadataId(
    IDS.order.object,
    IDS.order.clientSignature,
  );

  if (fieldMetadataId === null) throw new Error('no signature field');

  const result = await uploadFile(await renderSignatureFile(strokes), {
    fieldMetadataId,
    fileName: SIGNATURE_FILE_NAME,
  });

  if (result.status !== 'uploaded') throw new Error('upload failed');

  await new CoreApiClient().mutation({
    updateOrder: {
      __args: {
        id: orderId,
        data: {
          clientSignature: [
            { fileId: result.file.fileId, label: SIGNATURE_FILE_NAME },
          ],
        },
      },
      id: true,
    },
  });
};

const SignaturePad = ({
  strokes,
  onChange,
  borderColor,
}: {
  strokes: SignatureStroke[];
  onChange: (update: (strokes: SignatureStroke[]) => SignatureStroke[]) => void;
  borderColor: string;
}) => {
  const pad = useRef<HTMLDivElement>(null);
  // Where the pad sits on the screen while one stroke is drawn; null between
  // strokes. A pointer event carries screen coordinates only.
  const origin = useRef<SignaturePoint | null>(null);

  const pointOf = (event: PointerEvent<HTMLDivElement>): SignaturePoint => ({
    x: Math.round(event.clientX - (origin.current?.x ?? 0)),
    y: Math.round(event.clientY - (origin.current?.y ?? 0)),
  });

  // The sandbox starts measuring an element at the first read and has nothing
  // to give until then; read once here, so the first stroke finds the pad.
  useEffect(() => {
    pad.current?.getBoundingClientRect();
  }, []);

  const start = (event: PointerEvent<HTMLDivElement>) => {
    const rect = pad.current?.getBoundingClientRect();

    if (rect === undefined || rect.width === 0) return;

    origin.current = { x: rect.x, y: rect.y };

    const point = pointOf(event);

    onChange((current) => [...current, [point]]);
  };

  const extend = (event: PointerEvent<HTMLDivElement>) => {
    if (origin.current === null) return;

    const point = pointOf(event);

    onChange((current) => [
      ...current.slice(0, -1),
      [...(current[current.length - 1] ?? []), point],
    ]);
  };

  const end = () => {
    origin.current = null;
  };

  return (
    <div
      ref={pad}
      role="img"
      aria-label="Поле для подписи клиента"
      style={{
        background: '#ffffff',
        border: `1px solid ${borderColor}`,
        borderRadius: '6px',
        cursor: 'crosshair',
        height: `${SIGNATURE_PAD_HEIGHT_PX}px`,
        overflow: 'hidden',
        position: 'relative',
        // Without it a finger drawing on the pad scrolls the page instead.
        touchAction: 'none',
        userSelect: 'none',
      }}
      onPointerDown={start}
      onPointerMove={extend}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
    >
      <svg
        width="100%"
        height="100%"
        style={{ inset: 0, pointerEvents: 'none', position: 'absolute' }}
      >
        {strokes.map((stroke, index) => (
          <polyline
            key={index}
            // A lone point is doubled so a tap shows as a dot.
            points={[stroke[0], ...stroke]
              .map((point) => `${point.x},${point.y}`)
              .join(' ')}
            fill="none"
            stroke="#000000"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
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
  const [payment, setPayment] = useState<PaymentDraft>(EMPTY_PAYMENT_DRAFT);
  const [scheduledOrders, setScheduledOrders] = useState<ScheduledOrder[]>([]);
  // What «Чей замер» holds: '' until the measurer chooses
  const [target, setTarget] = useState('');
  const [saveIds, setSaveIds] = useState(createSaveIds);
  const [step, setStep] = useState<Step>('measurement');
  const [signature, setSignature] = useState<SignatureStroke[]>([]);
  // The order whose card opened the form: «Назад» returns there
  const [openedFromOrderId, setOpenedFromOrderId] = useState<string | null>(
    null,
  );
  const [isLeaving, setIsLeaving] = useState(false);
  // State is read from the render's closure, so two taps before the next
  // render would both pass a check on isSaving.
  const isSaveInFlight = useRef(false);

  useEffect(() => {
    if (userId === null) return;

    loadFormContext(userId)
      .then(async (context) => {
        setGrilles(context.grilles);
        setVisorOptions(context.visorOptions);

        if (context.measurerId === null) {
          setLoadError('Не удалось определить текущего пользователя.');

          return;
        }

        const preselectedOrderId = readPreselectedOrderId();
        const orders = await loadScheduledOrders(
          context.measurerId,
          preselectedOrderId,
        );
        const preselected = orders.find(
          (order) => order.id === preselectedOrderId,
        );

        setScheduledOrders(orders);
        // Only now can the form save: without the list a scheduled client
        // would be saved as a new one.
        setMeasurerId(context.measurerId);

        if (preselected !== undefined) {
          setTarget(preselected.id);
          setOpenedFromOrderId(preselected.id);
          setDraft((current) => ({
            ...current,
            ...draftFromScheduledOrder(preselected),
          }));
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
    sum: { fontSize: '18px', fontWeight: 600, margin: 0 },
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
      openings: [...current.openings, createOpening()],
    }));

  const removeOpening = (key: string) =>
    setDraft((current) => ({
      ...current,
      openings: current.openings.filter((opening) => opening.key !== key),
    }));

  const updatePayment = (changes: Partial<PaymentDraft>) =>
    setPayment((current) => ({ ...current, ...changes }));

  // «Новый клиент» keeps what is already typed.
  const pickTarget = (value: string) => {
    const order = scheduledOrders.find((candidate) => candidate.id === value);

    setTarget(value);

    if (order !== undefined) {
      updateDraft(draftFromScheduledOrder(order));
    }
  };

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
    // The order just measured no longer waits for a measurement.
    setScheduledOrders((current) =>
      current.filter((order) => order.id !== result?.orderId),
    );
    setDraft(createEmptyDraft());
    setPayment(EMPTY_PAYMENT_DRAFT);
    setSaveIds(createSaveIds());
    setTarget('');
    setErrors([]);
    setResult(null);
    setPhotoLimitNotice(null);
    setStep('measurement');
    setSignature([]);
    setIsLeaving(false);
  };

  const totalAreaSquareMeters = computeOpeningsTotalAreaSquareMeters(
    draft.openings,
  );
  const draftTotal = computeDraftTotal(draft.openings, grilles, visorOptions);
  const preview = computePaymentPreview(draftTotal, payment);
  const today = todayInTashkent();
  const isDirty =
    draft.clientName !== '' ||
    draft.clientPhone !== '' ||
    draft.openings.some(
      (opening) => opening.widthCm !== '' || opening.photos.length > 0,
    );

  // The payment has its own screen, so the sizes are checked before it opens.
  const goToPayment = () => {
    const targetOrder = resolveTargetOrderId(target, scheduledOrders);
    const payload = buildMeasurementPayload(draft, measurerId ?? '', {
      orderId: null,
      payment: EMPTY_PAYMENT_DRAFT,
      subtotal: null,
      today,
    });
    const stepErrors = [
      ...(targetOrder.ok ? [] : [targetOrder.error]),
      ...(payload.isValid ? [] : payload.errors),
    ];

    setErrors(stepErrors);

    if (stepErrors.length === 0) setStep('payment');
  };

  const save = async () => {
    if (measurerId === null) {
      if (loadError !== null) setErrors([loadError]);

      return;
    }

    const targetOrder = resolveTargetOrderId(target, scheduledOrders);

    if (!targetOrder.ok) {
      setErrors([targetOrder.error]);

      return;
    }

    const payload = buildMeasurementPayload(draft, measurerId, {
      orderId: targetOrder.orderId,
      payment,
      subtotal: draftTotal,
      today,
    });

    if (!payload.isValid) {
      setErrors(payload.errors);

      return;
    }

    setErrors([]);
    setIsSaving(true);

    const client = new CoreApiClient();
    let orderId: string | null = null;

    try {
      if (payload.orderId === null) {
        const { createOrder } = await client.mutation({
          createOrder: {
            __args: {
              data: { id: saveIds.order, ...payload.order },
              upsert: true,
            },
            id: true,
          },
        });

        orderId = createOrder?.id ?? null;
      } else {
        const { updateOrder } = await client.mutation({
          updateOrder: {
            __args: {
              id: payload.orderId,
              data: toOrderUpdateData(payload.order),
            },
            id: true,
          },
        });

        orderId = updateOrder?.id ?? null;
      }
    } catch (error) {
      setErrors([
        `Заказ не сохранён. Данные формы на месте, попробуйте ещё раз. (${describeError(error)})`,
      ]);

      return;
    }

    if (orderId === null) {
      setErrors(['Заказ не сохранён: сервер не вернул номер записи.']);

      return;
    }

    const items: SavedItem[] = [];
    const failedOpeningNumbers: number[] = [];

    for (const item of payload.items) {
      const openingNumber =
        draft.openings.findIndex((opening) => opening.key === item.id) + 1;

      try {
        const { createOrderItem } = await client.mutation({
          createOrderItem: {
            __args: { data: { ...item, orderId }, upsert: true },
            id: true,
          },
        });

        if (!createOrderItem?.id) throw new Error('empty response');

        items.push({
          id: createOrderItem.id,
          openingNumber,
          label: `${item.widthCm}×${item.heightCm}${item.projectionCm > 0 ? `×${item.projectionCm}` : ''} см, ${item.quantity} шт`,
          photoCount: 0,
        });
      } catch {
        failedOpeningNumbers.push(openingNumber);
      }
    }

    // Photos go up only once their item exists, so a failed upload never
    // costs the measurer the order.
    const photoFailureOpeningNumbers: number[] = [];
    const itemsWithPhotos = items.filter(
      (item) => draft.openings[item.openingNumber - 1].photos.length > 0,
    );

    if (itemsWithPhotos.length > 0) {
      const photosFieldMetadataId = await fetchFieldMetadataId(
        IDS.orderItem.object,
        IDS.orderItem.photos,
      ).catch(() => null);

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
    const savedItemIds = new Set(items.map((item) => item.id));

    for (const visor of payload.visors) {
      try {
        const { createOrderExtraService } = await client.mutation({
          createOrderExtraService: {
            __args: {
              data: {
                ...visor,
                // An opening that was not saved cannot be pointed at.
                orderItemId:
                  visor.orderItemId !== null &&
                  savedItemIds.has(visor.orderItemId)
                    ? visor.orderItemId
                    : null,
                orderId,
              },
              upsert: true,
            },
            id: true,
          },
        });

        if (!createOrderExtraService?.id) throw new Error('empty response');
      } catch {
        isVisorFailed = true;
      }
    }

    let isPaymentFailed = false;

    if (payload.firstPayment !== null) {
      const { amount, ...firstPayment } = payload.firstPayment;

      try {
        const { createOrderPayment } = await client.mutation({
          createOrderPayment: {
            __args: {
              data: {
                id: saveIds.payment,
                orderId,
                ...firstPayment,
                amount: toCurrency(amount),
              },
              upsert: true,
            },
            id: true,
          },
        });

        if (!createOrderPayment?.id) throw new Error('empty response');
      } catch {
        isPaymentFailed = true;
      }
    }

    const isSignatureFailed =
      signature.length > 0 &&
      (await attachClientSignature(orderId, signature).then(
        () => false,
        () => true,
      ));

    const orderName = await waitForOrderName(orderId).catch(() => null);

    setResult({
      orderId,
      orderName,
      items,
      failedOpeningNumbers,
      photoFailureOpeningNumbers,
      isVisorFailed,
      isPaymentFailed,
      isSignatureFailed,
    });
  };

  const handleSave = async () => {
    if (isSaveInFlight.current) return;

    isSaveInFlight.current = true;

    try {
      await save();
    } finally {
      isSaveInFlight.current = false;
      setIsSaving(false);
    }
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
              Заказ создан, но не все козырьки сохранены. Откройте заказ и
              добавьте их в «Козырьки и услуги» вручную.
            </p>
          )}
          {result.isPaymentFailed && (
            <p role="alert" style={styles.error}>
              Заказ сохранён, но предоплата не записана. Откройте заказ и
              запишите её вручную.
            </p>
          )}
          {result.isSignatureFailed && (
            <p role="alert" style={styles.error}>
              Заказ сохранён, но подпись клиента не загрузилась.
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

  const errorList = errors.length > 0 && (
    <div role="alert" style={styles.error}>
      {errors.map((error) => (
        <p key={error} style={{ margin: '0 0 4px' }}>
          {error}
        </p>
      ))}
    </div>
  );

  if (step === 'payment') {
    return (
      <div style={styles.page}>
        <button
          type="button"
          style={{ ...styles.secondaryButton, marginBottom: '16px' }}
          onClick={() => {
            setErrors([]);
            setStep('measurement');
          }}
        >
          ← Назад к замеру
        </button>
        <h2 style={{ ...styles.heading, fontSize: '22px' }}>Оплата</h2>
        <p style={{ color: colors.muted, margin: '0 0 16px' }}>
          {[
            draft.clientName.trim(),
            `проёмов: ${draft.openings.length}`,
            formatQuantity(totalAreaSquareMeters, 'м²'),
          ]
            .filter((part) => part !== '')
            .join(' · ')}
        </p>
        <section style={{ ...styles.section, display: 'block' }}>
          {preview.subtotal === null ||
          preview.total === null ||
          preview.balance === null ? (
            <p style={styles.sum}>Цену назовёт менеджер</p>
          ) : (
            <div style={{ display: 'grid', gap: SPACE.md }}>
              <p style={styles.sum}>
                {`Сумма: ${formatMoney(preview.subtotal)}`}
              </p>
              <Columns>
                <Field label="Скидка" error={preview.errors.discountValue}>
                  <TextInput
                    label="Скидка"
                    inputMode="decimal"
                    value={payment.discountValue}
                    onChange={(discountValue) =>
                      updatePayment({ discountValue })
                    }
                  />
                </Field>
                <Field label="Скидка в">
                  <SelectInput
                    label="Скидка в"
                    value={payment.discountKind}
                    onChange={(discountKind) =>
                      updatePayment({
                        discountKind: discountKind as DiscountKind,
                      })
                    }
                    options={DISCOUNT_KIND_OPTIONS.map(({ value, label }) => ({
                      value,
                      label,
                    }))}
                  />
                </Field>
              </Columns>
              {preview.discount > 0 && (
                <p style={styles.sum}>
                  {`Скидка: −${formatMoney(preview.discount)}`}
                </p>
              )}
              <p style={styles.sum}>{`Итого: ${formatMoney(preview.total)}`}</p>
              <Columns>
                <Field label="Предоплата" error={preview.errors.prepayment}>
                  <TextInput
                    label="Предоплата"
                    inputMode="numeric"
                    suffix="сум"
                    value={payment.prepayment}
                    onChange={(prepayment) => updatePayment({ prepayment })}
                  />
                </Field>
                <Field label="Способ">
                  <SelectInput
                    label="Способ"
                    value={payment.method}
                    onChange={(method) =>
                      updatePayment({ method: method as PaymentMethod })
                    }
                    options={PAYMENT_METHOD_OPTIONS.map(({ value, label }) => ({
                      value,
                      label,
                    }))}
                  />
                </Field>
              </Columns>
              <Field label="Комментарий к оплате">
                <TextInput
                  label="Комментарий к оплате"
                  value={payment.comment}
                  onChange={(comment) => updatePayment({ comment })}
                />
              </Field>
              <p style={styles.sum}>
                {`Остаток: ${formatMoney(preview.balance)}`}
              </p>
            </div>
          )}
        </section>
        <h3 style={styles.heading}>Подпись клиента</h3>
        <section style={{ ...styles.section, display: 'block' }}>
          <p
            style={{ color: colors.muted, fontSize: '13px', margin: '0 0 8px' }}
          >
            Клиент расписывается пальцем: согласен с размерами и суммой.
          </p>
          <SignaturePad
            strokes={signature}
            onChange={setSignature}
            borderColor={colors.border}
          />
          {signature.length > 0 && (
            <button
              type="button"
              style={{ ...styles.secondaryButton, marginTop: '8px' }}
              onClick={() => setSignature([])}
            >
              Очистить подпись
            </button>
          )}
        </section>

        {errorList}

        <button
          type="button"
          style={{ ...styles.primaryButton, opacity: isSaving ? 0.6 : 1 }}
          aria-busy={isSaving}
          onClick={handleSave}
        >
          {isSaving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    );
  }

  const leaveHref =
    openedFromOrderId === null
      ? '/objects/orders'
      : `/object/order/${openedFromOrderId}`;

  return (
    <div style={styles.page}>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        {isLeaving ? (
          <>
            <span>Выйти без сохранения? Введённое пропадёт.</span>
            <a
              href={leaveHref}
              style={{ ...styles.secondaryButton, ...styles.link }}
            >
              Выйти
            </a>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => setIsLeaving(false)}
            >
              Остаться
            </button>
          </>
        ) : isDirty ? (
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => setIsLeaving(true)}
          >
            ← Назад
          </button>
        ) : (
          <a
            href={leaveHref}
            style={{ ...styles.secondaryButton, ...styles.link }}
          >
            ← Назад
          </a>
        )}
      </div>
      <h2 style={{ ...styles.heading, fontSize: '22px' }}>Новый замер</h2>
      {loadError !== null && (
        <p role="alert" style={styles.error}>
          {loadError}
        </p>
      )}

      {scheduledOrders.length > 0 && (
        <section style={{ ...styles.section, display: 'block' }}>
          <Field label="Чей замер">
            <SelectInput
              label="Чей замер"
              value={target}
              onChange={pickTarget}
              options={[
                { value: '', label: 'Выберите' },
                ...scheduledOrders.map((order) => ({
                  value: order.id,
                  label: scheduledOrderLabel(order, today),
                })),
                { value: NEW_CLIENT_TARGET, label: 'Новый клиент' },
              ]}
            />
          </Field>
        </section>
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
        const visorTotal = computeOpeningVisorTotal(opening, visorOptions);

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
              'Козырёк',
              <select
                style={styles.input}
                value={opening.visorServiceId}
                onChange={(event) =>
                  updateOpening(opening.key, {
                    visorServiceId: event.target.value,
                  })
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
            {opening.visorServiceId !== '' &&
              field(
                'Длина козырька, см',
                <input
                  inputMode="decimal"
                  style={styles.input}
                  value={opening.visorLengthCm}
                  onChange={(event) =>
                    updateOpening(opening.key, {
                      visorLengthCm: event.target.value,
                    })
                  }
                />,
              )}
            {visorTotal !== null && visorTotal > 0 && (
              <div style={styles.area}>Козырёк: {formatMoney(visorTotal)}</div>
            )}
            {isVisorOnlyOpening(opening) && (
              <p style={{ ...styles.wide, color: colors.muted, margin: 0 }}>
                Без ширины и высоты сохранится только козырёк, без решётки.
              </p>
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

      <p style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 16px' }}>
        Итого площадь: {formatQuantity(totalAreaSquareMeters, 'м²')}
      </p>

      {errorList}

      <button type="button" style={styles.primaryButton} onClick={goToPayment}>
        Далее: оплата
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
