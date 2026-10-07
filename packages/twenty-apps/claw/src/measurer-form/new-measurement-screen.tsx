import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import {
  openSidePanelPage,
  SidePanelPages,
  uploadFile,
  useUserId,
} from 'twenty-sdk/front-component';

import { AWAITING_MEASUREMENT_STATUSES } from 'src/constants/order-status-sets';
import {
  DISCOUNT_KIND_OPTIONS,
  type DiscountKind,
  DISTRICT_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethod,
  PROJECTION_KIND_OPTIONS,
  type ProjectionKind,
  SOURCE_OPTIONS,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import {
  buildMeasurementPayload,
  buildOpeningPhotoLabel,
  computeDraftTotal,
  computeOpeningAreaSquareMeters,
  computeOpeningQuote,
  computeOpeningsTotalAreaSquareMeters,
  computeOpeningVisorTotal,
  computePaymentPreview,
  copyOpening,
  createEmptyOpening,
  describeMeasurementTime,
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
  parseDecimalInput,
  type PaymentDraft,
  resolveTargetOrderId,
  type ScheduledOrder,
  sortScheduledOrders,
  takePhotosWithinLimit,
  toDateTimeLocalInputValue,
  toOrderUpdateData,
  UZBEK_PHONE_PREFIX,
  type VisorOption,
} from 'src/measurer-form/measurer-form';
import {
  BigNumber,
  Card,
  ChoiceChips,
  ErrorList,
  Fact,
  FieldLabel,
  FilterChips,
  ListRow,
  NoteBox,
  OpeningSketch,
  PickButton,
  PickerGroup,
  PickerPanel,
  QuantityStepper,
  QuickPicks,
  SectionTitle,
  Segmented,
  SignaturePad,
  type SignatureStroke,
  SummaryLine,
  TextArea,
  TileGrid,
  useElementWidth,
  VisitCards,
} from 'src/measurer-form/measurer-form-ui';
import {
  countUses,
  matchesSearch,
  pickQuickOptions,
  rankByUse,
  sortByName,
} from 'src/measurer-form/option-search';
import { formatItemSize } from 'src/pricing/compute-item-area';
import { todayInTashkent } from 'src/pricing/dates';
import { fromCurrency, toCurrency } from 'src/recalc/money';
import { formatMoney, formatQuantity, formatWhole } from 'src/ui/format';
import { Button, Field, PhotoTile, TextInput, usePalette } from 'src/ui/kit';
import {
  CONTROL_HEIGHT,
  RADIUS,
  SPACE,
  TABULAR_NUMBERS,
  TYPE,
} from 'src/ui/tokens';
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

type Picker = {
  openingKey: string;
  kind: 'grille' | 'visor';
  query: string;
  grilleKind: string;
};

type Usage = { grilles: Map<string, number>; visors: Map<string, number> };

const ORDER_NAME_POLL_ATTEMPTS = 20;
const ORDER_NAME_POLL_INTERVAL_MS = 750;
const THUMBNAIL_MAX_SIDE_PX = 160;
const USAGE_SAMPLE_SIZE = 500;
const QUICK_GRILLE_COUNT = 5;
const QUICK_VISOR_COUNT = 3;
const PICKER_POPULAR_COUNT = 6;
const ALL_KINDS = '';
// Side summary beside the form from this page width (a tablet on its side)
const SIDE_SUMMARY_MIN_WIDTH = 900;
// Sketch beside the opening's inputs from this card width
const SKETCH_BESIDE_MIN_WIDTH = 640;
const SUMMARY_WIDTH = 320;
const PREPAYMENT_SHARES = [
  { label: '30%', share: 0.3 },
  { label: '50%', share: 0.5 },
  { label: 'Вся сумма', share: 1 },
];

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
            grilleKind: { name: true },
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
      kindName: node.grilleKind?.name ?? null,
      photoUrl: node.photos?.[0]?.url ?? null,
      pricePerSquareMeter: fromCurrency(node.pricePerSquareMeter),
    })),
    visorOptions: sortByName<VisorOption>(
      (extraServices?.edges ?? []).map(({ node }): VisorOption => ({
        id: node.id,
        name: node.name ?? '',
        price: fromCurrency(node.price),
      })),
    ),
  };
};

// How often each grille and visor went into recent orders, for the quick
// picks. Without it the pickers still list everything by name.
const loadUsage = async (): Promise<Usage> => {
  const { orderItems, orderExtraServices } = await new CoreApiClient().query({
    orderItems: {
      __args: {
        first: USAGE_SAMPLE_SIZE,
        orderBy: [{ createdAt: 'DescNullsLast' }],
      },
      edges: { node: { designId: true } },
    },
    orderExtraServices: {
      __args: {
        first: USAGE_SAMPLE_SIZE,
        orderBy: [{ createdAt: 'DescNullsLast' }],
      },
      edges: { node: { extraServiceId: true } },
    },
  });

  return {
    grilles: countUses(
      (orderItems?.edges ?? []).map(({ node }) => node.designId ?? null),
    ),
    visors: countUses(
      (orderExtraServices?.edges ?? []).map(
        ({ node }) => node.extraServiceId ?? null,
      ),
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

const findLabel = (
  options: readonly { value: string; label: string }[],
  value: string,
) => options.find((option) => option.value === value)?.label ?? null;

const countOpenings = (count: number) =>
  `${count} ${count % 10 === 1 && count % 100 !== 11 ? 'проём' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'проёма' : 'проёмов'}`;

const describeSize = (opening: OpeningDraft): string | null => {
  const widthCm = parseDecimalInput(opening.widthCm);
  const heightCm = parseDecimalInput(opening.heightCm);

  if (widthCm === null || heightCm === null || widthCm <= 0 || heightCm <= 0) {
    return null;
  }

  return formatItemSize({
    widthCm,
    heightCm,
    projectionCm:
      opening.projectionKind === 'NONE'
        ? 0
        : (parseDecimalInput(opening.projectionCm) ?? 0),
    projectionKind: opening.projectionKind,
  });
};

const quantityOf = (opening: OpeningDraft) =>
  parseDecimalInput(opening.quantity) ?? 1;

// Each opening's own errors start with its label, «Проём 2: …»
const errorsOf = (errors: string[], openingNumber: number) =>
  errors.filter((error) => error.startsWith(`Проём ${openingNumber}:`));

export const NewMeasurement = () => {
  const colors = usePalette();
  const userId = useUserId();
  const page = useElementWidth();
  const [draft, setDraft] = useState<MeasurementDraft>(createEmptyDraft);
  const [grilles, setGrilles] = useState<GrilleOption[]>([]);
  const [visorOptions, setVisorOptions] = useState<VisorOption[]>([]);
  const [usage, setUsage] = useState<Usage>({
    grilles: new Map(),
    visors: new Map(),
  });
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
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(
    () => draft.openings[0]?.key ?? null,
  );
  const [picker, setPicker] = useState<Picker | null>(null);
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

    loadUsage()
      .then(setUsage)
      .catch(() => undefined);
  }, [userId]);

  const updateDraft = (changes: Partial<MeasurementDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const updateOpening = (key: string, changes: Partial<OpeningDraft>) =>
    setDraft((current) => ({
      ...current,
      openings: current.openings.map((opening) =>
        opening.key === key ? { ...opening, ...changes } : opening,
      ),
    }));

  const addOpening = () => {
    const opening = createOpening();

    setDraft((current) => ({
      ...current,
      openings: [...current.openings, opening],
    }));
    setExpandedKey(opening.key);
    setPicker(null);
  };

  const duplicateOpening = (source: OpeningDraft) => {
    const opening = copyOpening(source, randomUuid(), randomUuid());

    setDraft((current) => {
      const index = current.openings.findIndex(
        (candidate) => candidate.key === source.key,
      );

      return {
        ...current,
        openings: [
          ...current.openings.slice(0, index + 1),
          opening,
          ...current.openings.slice(index + 1),
        ],
      };
    });
    setExpandedKey(opening.key);
    setPicker(null);
  };

  const removeOpening = (key: string) => {
    setDraft((current) => ({
      ...current,
      openings: current.openings.filter((opening) => opening.key !== key),
    }));
    setPicker(null);
  };

  const toggleOpening = (key: string) => {
    setExpandedKey((current) => (current === key ? null : key));
    setPicker(null);
  };

  const updatePayment = (changes: Partial<PaymentDraft>) =>
    setPayment((current) => ({ ...current, ...changes }));

  // «Новый клиент» keeps what is already typed.
  const pickTarget = (value: string) => {
    const order = scheduledOrders.find((candidate) => candidate.id === value);

    setTarget(value);
    setIsEditingClient(false);

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
    const fresh = createEmptyDraft();

    // The order just measured no longer waits for a measurement.
    setScheduledOrders((current) =>
      current.filter((order) => order.id !== result?.orderId),
    );
    setDraft(fresh);
    setPayment(EMPTY_PAYMENT_DRAFT);
    setSaveIds(createSaveIds());
    setTarget('');
    setErrors([]);
    setResult(null);
    setPhotoLimitNotice(null);
    setStep('measurement');
    setSignature([]);
    setIsLeaving(false);
    setIsEditingClient(false);
    setExpandedKey(fresh.openings[0].key);
    setPicker(null);
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
    draft.addressLine !== '' ||
    draft.comment !== '' ||
    draft.openings.some(
      (opening) =>
        opening.widthCm !== '' ||
        opening.notes !== '' ||
        opening.visorServiceId !== '' ||
        opening.photos.length > 0,
    );
  const isSideSummary = page.width >= SIDE_SUMMARY_MIN_WIDTH;
  const isSketchBeside =
    page.width - (isSideSummary ? SUMMARY_WIDTH + SPACE.xl : 0) >=
    SKETCH_BESIDE_MIN_WIDTH + 2 * SPACE.lg;
  const grilleOf = (opening: OpeningDraft) =>
    grilles.find((grille) => grille.id === opening.designId) ?? null;
  const visorOf = (opening: OpeningDraft) =>
    visorOptions.find((visor) => visor.id === opening.visorServiceId) ?? null;
  const openingTotal = (opening: OpeningDraft): number | null => {
    const grilleTotal = isVisorOnlyOpening(opening)
      ? 0
      : (computeOpeningQuote(opening, grilles)?.lineTotal ?? null);
    const visorTotal = computeOpeningVisorTotal(opening, visorOptions);

    return grilleTotal === null || visorTotal === null
      ? null
      : grilleTotal + visorTotal;
  };
  const openingArea = (opening: OpeningDraft) => {
    const area = computeOpeningAreaSquareMeters(opening);

    return area === null
      ? null
      : computeOpeningsTotalAreaSquareMeters([opening]);
  };
  const describeGrille = (opening: OpeningDraft) =>
    grilleOf(opening)?.name ??
    (isVisorOnlyOpening(opening) ? 'Только козырёк' : 'Другая решётка');

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
    setPicker(null);

    if (stepErrors.length === 0) {
      setStep('payment');

      return;
    }

    const firstWrongOpening = draft.openings.find(
      (_, index) => errorsOf(stepErrors, index + 1).length > 0,
    );

    if (firstWrongOpening !== undefined) setExpandedKey(firstWrongOpening.key);
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
          label: `${formatItemSize(item)} см, ${item.quantity} шт`,
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

  const leaveHref =
    openedFromOrderId === null
      ? '/objects/orders'
      : `/object/order/${openedFromOrderId}`;

  const linkButton = (isPrimary: boolean): CSSProperties => ({
    display: 'inline-flex',
    font: 'inherit',
    cursor: 'pointer',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: CONTROL_HEIGHT,
    padding: `0 ${SPACE.lg}px`,
    borderRadius: RADIUS.control,
    background: isPrimary ? colors.accent : 'transparent',
    border: isPrimary ? 'none' : `1px solid ${colors.border}`,
    color: isPrimary ? colors.onAccent : colors.text,
    fontWeight: 600,
    textDecoration: 'none',
  });

  const primaryWide: CSSProperties = {
    width: '100%',
    minHeight: CONTROL_HEIGHT + SPACE.sm,
    background: colors.accent,
    border: 'none',
    borderRadius: RADIUS.control,
    color: colors.onAccent,
    font: 'inherit',
    ...TYPE.rowTitle,
    cursor: 'pointer',
  };

  const pageStyle: CSSProperties = {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: isSideSummary ? 1240 : 760,
    margin: '0 auto',
    padding: SPACE.lg,
    color: colors.text,
    fontFamily: 'inherit',
    ...TYPE.body,
  };

  // Measured outside the centred column: the column's own width is capped
  const frame = (children: ReactNode) => (
    <div ref={page.ref} style={{ width: '100%' }}>
      <div style={pageStyle}>{children}</div>
    </div>
  );

  const column = (gap: number = SPACE.xl): CSSProperties => ({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap,
    alignContent: 'start',
    minWidth: 0,
  });

  if (result !== null) {
    return frame(
      <>
        <div style={{ ...column(), maxWidth: 820, margin: '0 auto' }}>
          <div>
            <a href={leaveHref} style={linkButton(false)}>
              ← Назад
            </a>
          </div>
          <Card padding={SPACE.xl}>
            <span style={{ color: colors.success, fontWeight: 600 }}>
              ✓ Замер сохранён
            </span>
            <h2 style={{ margin: 0, fontSize: '32px', lineHeight: '38px' }}>
              Заказ {result.orderName ?? '(номер появится через минуту)'}
            </h2>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: `${SPACE.sm}px ${SPACE.xl}px`,
                ...TABULAR_NUMBERS,
              }}
            >
              {draft.clientName.trim() !== '' && (
                <Fact label="Клиент" value={draft.clientName.trim()} />
              )}
              <Fact
                label="Площадь"
                value={formatQuantity(totalAreaSquareMeters, 'м²')}
              />
              {preview.total !== null && preview.balance !== null && (
                <>
                  <Fact label="Итого" value={formatMoney(preview.total)} />
                  <Fact
                    label="Предоплата"
                    value={formatMoney(preview.prepayment)}
                  />
                  <Fact label="Остаток" value={formatMoney(preview.balance)} />
                </>
              )}
            </div>
            <ErrorList
              errors={[
                ...(result.failedOpeningNumbers.length > 0
                  ? [
                      `Заказ создан, но не сохранены проёмы № ${result.failedOpeningNumbers.join(', ')}. Откройте заказ и добавьте их вручную.`,
                    ]
                  : []),
                ...(result.isVisorFailed
                  ? [
                      'Заказ создан, но не все козырьки сохранены. Откройте заказ и добавьте их в «Козырьки и услуги» вручную.',
                    ]
                  : []),
                ...(result.isPaymentFailed
                  ? [
                      'Заказ сохранён, но предоплата не записана. Откройте заказ и запишите её вручную.',
                    ]
                  : []),
                ...(result.isSignatureFailed
                  ? ['Заказ сохранён, но подпись клиента не загрузилась.']
                  : []),
                ...(result.photoFailureOpeningNumbers.length > 0
                  ? [
                      describePhotoUploadFailure(
                        result.photoFailureOpeningNumbers,
                      ),
                    ]
                  : []),
              ]}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.md }}>
              {/* Plain links load the page afresh: the host's cached order
                  lists do not see records created through the API, and the
                  SDK's client-side navigate would show them stale. */}
              <a
                href={`/object/order/${result.orderId}`}
                style={linkButton(true)}
              >
                Открыть заказ
              </a>
              <a href="/objects/orders" style={linkButton(false)}>
                К списку заказов
              </a>
              <Button onClick={resetForm}>Новый замер</Button>
            </div>
          </Card>
          {result.items.length > 0 && (
            <div style={column(SPACE.md)}>
              <SectionTitle title="Фото проёмов" />
              <Card>
                {result.items.map((item) => (
                  <div key={item.id} style={column(SPACE.sm)}>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: SPACE.md,
                      }}
                    >
                      <span>
                        <strong>Проём {item.openingNumber}</strong>:{' '}
                        {item.label}
                        {item.photoCount > 0 && `, фото: ${item.photoCount}`}
                      </span>
                      <button
                        type="button"
                        aria-label={`Добавить фото: проём ${item.openingNumber}`}
                        style={linkButton(false)}
                        onClick={() => openItemForPhotos(item.id)}
                      >
                        Добавить фото
                      </button>
                    </div>
                    {/* The photos picked in the form, which stays filled until
                        «Новый замер». */}
                    <PhotoRow
                      photos={
                        draft.openings[item.openingNumber - 1]?.photos ?? []
                      }
                      openingNumber={item.openingNumber}
                    />
                  </div>
                ))}
              </Card>
            </div>
          )}
        </div>
      </>,
    );
  }

  const header = (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: SPACE.md,
      }}
    >
      {step === 'payment' ? (
        <button
          type="button"
          style={linkButton(false)}
          onClick={() => {
            setErrors([]);
            // The client signed for these sizes and this sum.
            setSignature([]);
            setStep('measurement');
          }}
        >
          ← К замеру
        </button>
      ) : isLeaving ? (
        <>
          <span>Выйти без сохранения? Введённое пропадёт.</span>
          <a href={leaveHref} style={linkButton(false)}>
            Выйти
          </a>
          <Button onClick={() => setIsLeaving(false)}>Остаться</Button>
        </>
      ) : isDirty ? (
        <button
          type="button"
          style={linkButton(false)}
          onClick={() => setIsLeaving(true)}
        >
          ← Назад
        </button>
      ) : (
        <a href={leaveHref} style={linkButton(false)}>
          ← Назад
        </a>
      )}
      {!isLeaving && (
        <>
          <h2 style={{ margin: 0, ...TYPE.title, whiteSpace: 'nowrap' }}>
            Новый замер
          </h2>
          <StepDots step={step} />
        </>
      )}
    </div>
  );

  if (step === 'payment') {
    const receipt = (
      <div style={column(SPACE.md)}>
        <SectionTitle
          title="Что заказано"
          aside={
            <Button
              variant="link"
              onClick={() => {
                setErrors([]);
                setSignature([]);
                setStep('measurement');
              }}
            >
              Изменить
            </Button>
          }
        />
        <Card>
          <div style={column(0)}>
            {draft.openings.flatMap((opening, index) => {
              const quote = computeOpeningQuote(opening, grilles);
              const visor = visorOf(opening);
              const visorTotal = computeOpeningVisorTotal(
                opening,
                visorOptions,
              );
              const lines: ReactNode[] = [];

              if (!isVisorOnlyOpening(opening)) {
                lines.push(
                  <ReceiptLine
                    key={opening.key}
                    title={`Проём ${index + 1} · ${describeGrille(opening)}`}
                    detail={`${describeSize(opening) ?? ''}${quantityOf(opening) > 1 ? `, ${opening.quantity} шт` : ''} · ${formatQuantity(openingArea(opening) ?? 0, 'м²')}`}
                    amount={quote === null ? '—' : formatMoney(quote.lineTotal)}
                  />,
                );
              }

              if (visor !== null) {
                lines.push(
                  <ReceiptLine
                    key={opening.visorKey}
                    title={`Козырёк ${visor.name}${isVisorOnlyOpening(opening) ? '' : ` · проём ${index + 1}`}`}
                    detail={
                      visor.price === null
                        ? 'цена не задана'
                        : `${opening.visorLengthCm} см × ${opening.quantity} шт · ${formatMoney(visor.price)} за п.м.`
                    }
                    amount={visorTotal === null ? '—' : formatMoney(visorTotal)}
                  />,
                );
              }

              return lines;
            })}
            <div style={{ paddingTop: SPACE.md }}>
              <SummaryLine
                label="Сумма"
                value={
                  preview.subtotal === null
                    ? '—'
                    : formatMoney(preview.subtotal)
                }
              />
            </div>
          </div>
        </Card>
      </div>
    );

    const paymentForm =
      preview.subtotal === null ||
      preview.total === null ||
      preview.balance === null ? (
        <Card>
          <span style={TYPE.rowTitle}>Цену назовёт менеджер</span>
          <span style={{ color: colors.muted }}>
            В заказе есть решётка или козырёк без цены, поэтому скидку и
            предоплату менеджер внесёт сам.
          </span>
        </Card>
      ) : (
        <div style={column(SPACE.md)}>
          <SectionTitle title="Оплата" />
          <Card>
            <Field label="Скидка" error={preview.errors.discountValue}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 140px',
                  gap: SPACE.sm,
                }}
              >
                <TextInput
                  label="Скидка"
                  inputMode="decimal"
                  isMoney={payment.discountKind === 'AMOUNT'}
                  value={payment.discountValue}
                  placeholder="0"
                  onChange={(discountValue) => updatePayment({ discountValue })}
                />
                <Segmented
                  label="Скидка в"
                  value={payment.discountKind}
                  options={DISCOUNT_KIND_OPTIONS.map(({ value, label }) => ({
                    value: value as DiscountKind,
                    label,
                  }))}
                  onChange={(discountKind) => updatePayment({ discountKind })}
                />
              </div>
            </Field>
            <div style={column(SPACE.xs)}>
              {preview.discount > 0 && (
                <SummaryLine
                  label="Скидка"
                  value={`−${formatMoney(preview.discount)}`}
                />
              )}
              <SummaryLine
                label="Итого"
                value={formatMoney(preview.total)}
                isTotal
              />
            </div>
            <Field label="Предоплата" error={preview.errors.prepayment}>
              <TextInput
                label="Предоплата"
                inputMode="numeric"
                isMoney
                suffix="сум"
                placeholder="0"
                value={payment.prepayment}
                onChange={(prepayment) => updatePayment({ prepayment })}
              />
            </Field>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
              {PREPAYMENT_SHARES.map(({ label, share }) => (
                <QuickButton
                  key={label}
                  label={label}
                  onClick={() =>
                    updatePayment({
                      prepayment: formatWhole(
                        Math.round((preview.total ?? 0) * share),
                      ),
                    })
                  }
                />
              ))}
              <QuickButton
                label="Без предоплаты"
                onClick={() => updatePayment({ prepayment: '' })}
              />
            </div>
            <div style={column(SPACE.xs)}>
              <FieldLabel>Способ</FieldLabel>
              <Segmented
                label="Способ"
                value={payment.method}
                options={PAYMENT_METHOD_OPTIONS.map(({ value, label }) => ({
                  value: value as PaymentMethod,
                  label,
                }))}
                onChange={(method) => updatePayment({ method })}
              />
            </div>
            <Field label="Комментарий к оплате">
              <TextInput
                label="Комментарий к оплате"
                value={payment.comment}
                onChange={(comment) => updatePayment({ comment })}
              />
            </Field>
            <BigNumber label="Остаток" value={formatMoney(preview.balance)} />
          </Card>
        </div>
      );

    const signatureBlock = (
      <div style={column(SPACE.md)}>
        <SectionTitle title="Подпись клиента" />
        <Card>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: SPACE.md,
            }}
          >
            <span style={TYPE.rowTitle}>
              {draft.clientName.trim() || 'Клиент'}
            </span>
            {signature.length > 0 && (
              <span style={{ color: colors.success, fontWeight: 600 }}>
                ✓ Подписано
              </span>
            )}
          </div>
          <span style={{ color: colors.muted }}>
            Клиент расписывается пальцем: согласен с размерами и суммой.
          </span>
          <SignaturePad strokes={signature} onChange={setSignature} />
          {signature.length > 0 && (
            <div>
              <Button onClick={() => setSignature([])}>Очистить подпись</Button>
            </div>
          )}
        </Card>
        <ErrorList errors={errors} />
        <button
          type="button"
          style={{ ...primaryWide, opacity: isSaving ? 0.6 : 1 }}
          aria-busy={isSaving}
          onClick={handleSave}
        >
          {isSaving ? 'Сохранение…' : 'Сохранить замер'}
        </button>
        <span
          style={{ ...TYPE.label, color: colors.muted, textAlign: 'center' }}
        >
          Подпись не обязательна. Если вернуться к замеру, её нужно будет
          поставить заново.
        </span>
      </div>
    );

    return frame(
      <>
        <div style={column()}>
          {header}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isSideSummary
                ? 'minmax(0, 1fr) minmax(0, 1fr)'
                : 'minmax(0, 1fr)',
              gap: SPACE.xl,
              alignItems: 'start',
            }}
          >
            <div style={column()}>
              {receipt}
              {paymentForm}
            </div>
            {signatureBlock}
          </div>
        </div>
      </>,
    );
  }

  const scheduledVisits = scheduledOrders.map((order) => ({
    id: order.id,
    when: describeMeasurementTime(order.measurementDate, today) ?? 'Без даты',
    title: order.clientName?.trim() || order.name,
    detail:
      [findLabel(DISTRICT_OPTIONS, order.district ?? ''), order.addressLine]
        .filter((part) => part !== null && part !== '')
        .join(', ') || order.name,
  }));
  const isScheduledClient =
    target !== '' && target !== NEW_CLIENT_TARGET && scheduledOrders.length > 0;
  const measurementTime = describeMeasurementTime(
    draft.measurementDate === ''
      ? null
      : new Date(draft.measurementDate).toISOString(),
    today,
  );

  const clientSection =
    isScheduledClient && !isEditingClient ? (
      <Card>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: SPACE.md,
          }}
        >
          <div style={{ display: 'grid', minWidth: 0 }}>
            <span style={TYPE.title}>{draft.clientName || 'Без имени'}</span>
            <span style={{ ...TABULAR_NUMBERS, color: colors.muted }}>
              {draft.clientPhone === ''
                ? 'Телефона нет'
                : `${UZBEK_PHONE_PREFIX} ${draft.clientPhone}`}
            </span>
          </div>
          <Button onClick={() => setIsEditingClient(true)}>Изменить</Button>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: `${SPACE.sm}px ${SPACE.xl}px`,
          }}
        >
          <Fact
            label="Адрес"
            value={
              [findLabel(DISTRICT_OPTIONS, draft.district), draft.addressLine]
                .filter((part) => part !== null && part !== '')
                .join(', ') || '—'
            }
          />
          <Fact label="Этаж" value={draft.floor || '—'} />
          <Fact
            label="Источник"
            value={findLabel(SOURCE_OPTIONS, draft.source) ?? '—'}
          />
          <Fact label="Дата замера" value={measurementTime ?? '—'} />
        </div>
        {draft.comment.trim() !== '' && (
          <NoteBox title="Комментарий менеджера" text={draft.comment} />
        )}
      </Card>
    ) : (
      <Card>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: SPACE.lg,
          }}
        >
          <Field label="Имя клиента">
            <TextInput
              label="Имя клиента"
              value={draft.clientName}
              onChange={(clientName) => updateDraft({ clientName })}
            />
          </Field>
          <Field label="Телефон">
            <TextInput
              label="Телефон"
              inputMode="numeric"
              prefix={UZBEK_PHONE_PREFIX}
              placeholder="90 123 45 67"
              value={draft.clientPhone}
              onChange={(clientPhone) => updateDraft({ clientPhone })}
              onCommit={() =>
                setDraft((current) => ({
                  ...current,
                  clientPhone: formatUzbekNationalPhone(current.clientPhone),
                }))
              }
            />
          </Field>
        </div>
        <ChoiceChips
          label="Район"
          value={draft.district}
          options={DISTRICT_OPTIONS}
          onChange={(district) =>
            updateDraft({ district: district as MeasurementDraft['district'] })
          }
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: SPACE.lg,
          }}
        >
          <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
            <Field label="Адрес">
              <TextInput
                label="Адрес"
                value={draft.addressLine}
                onChange={(addressLine) => updateDraft({ addressLine })}
              />
            </Field>
          </div>
          <Field label="Этаж">
            <TextInput
              label="Этаж"
              inputMode="numeric"
              value={draft.floor}
              onChange={(floor) => updateDraft({ floor })}
            />
          </Field>
        </div>
        <ChoiceChips
          label="Источник"
          value={draft.source}
          options={SOURCE_OPTIONS}
          onChange={(source) =>
            updateDraft({ source: source as MeasurementDraft['source'] })
          }
        />
        <Field label="Дата замера">
          <TextInput
            label="Дата замера"
            type="datetime-local"
            value={draft.measurementDate}
            onChange={(measurementDate) => updateDraft({ measurementDate })}
          />
        </Field>
        <TextArea
          label="Комментарий"
          value={draft.comment}
          onChange={(comment) => updateDraft({ comment })}
        />
        {isScheduledClient && (
          <div>
            <Button onClick={() => setIsEditingClient(false)}>Готово</Button>
          </div>
        )}
      </Card>
    );

  const grilleField = (opening: OpeningDraft) => {
    const grille = grilleOf(opening);
    const isOpen =
      picker?.openingKey === opening.key && picker.kind === 'grille';
    const quick = pickQuickOptions({
      options: grilles,
      uses: usage.grilles,
      usedHereIds: draft.openings
        .filter((other) => other.key !== opening.key)
        .map((other) => other.designId),
      chosenId: opening.designId,
      limit: QUICK_GRILLE_COUNT,
    });

    return (
      <div style={column(SPACE.sm)}>
        <FieldLabel>Решётка</FieldLabel>
        <PickButton
          hasPicture
          photoUrl={grille?.photoUrl}
          title={grille?.name ?? 'Другая'}
          subtitle={
            grille === null
              ? 'Цену назовёт менеджер'
              : [
                  grille.kindName,
                  grille.pricePerSquareMeter === null
                    ? 'без цены'
                    : `${formatMoney(grille.pricePerSquareMeter)} за м²`,
                ]
                  .filter((part) => part !== null)
                  .join(' · ')
          }
          actionText={
            grille === null ? `Выбрать из ${grilles.length}` : 'Сменить'
          }
          isEmpty={grille === null}
          onClick={() =>
            setPicker(
              isOpen
                ? null
                : {
                    openingKey: opening.key,
                    kind: 'grille',
                    query: '',
                    grilleKind: ALL_KINDS,
                  },
            )
          }
        />
        {isOpen && picker !== null ? (
          <GrillePicker
            grilles={grilles}
            uses={usage.grilles}
            chosenId={opening.designId}
            picker={picker}
            onPickerChange={setPicker}
            onPick={(designId) => {
              updateOpening(opening.key, { designId });
              setPicker(null);
            }}
          />
        ) : (
          <QuickPicks
            items={quick.map((option) => ({
              id: option.id,
              label: option.name,
              photoUrl: option.photoUrl,
            }))}
            onPick={(designId) => updateOpening(opening.key, { designId })}
          />
        )}
      </div>
    );
  };

  const visorField = (opening: OpeningDraft) => {
    const visor = visorOf(opening);
    const isOpen =
      picker?.openingKey === opening.key && picker.kind === 'visor';
    const openPicker = () =>
      setPicker({
        openingKey: opening.key,
        kind: 'visor',
        query: '',
        grilleKind: ALL_KINDS,
      });
    const quick = pickQuickOptions({
      options: visorOptions,
      uses: usage.visors,
      usedHereIds: draft.openings
        .filter((other) => other.key !== opening.key)
        .map((other) => other.visorServiceId),
      chosenId: opening.visorServiceId,
      limit: QUICK_VISOR_COUNT,
    });

    return (
      <div style={column(SPACE.sm)}>
        <FieldLabel>Козырёк</FieldLabel>
        <div style={{ maxWidth: 360 }}>
          <Segmented
            label="Козырёк"
            value={opening.isVisorWanted ? 'YES' : 'NO'}
            options={[
              { value: 'NO', label: 'Не нужен' },
              { value: 'YES', label: 'Нужен' },
            ]}
            onChange={(answer) => {
              const isVisorWanted = answer === 'YES';

              updateOpening(opening.key, {
                isVisorWanted,
                ...(isVisorWanted
                  ? {}
                  : { visorServiceId: '', visorLengthCm: '' }),
              });

              if (isVisorWanted && opening.visorServiceId === '') openPicker();
              else if (!isVisorWanted && isOpen) setPicker(null);
            }}
          />
        </div>
        {opening.isVisorWanted && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <PickButton
                  title={visor?.name ?? 'Выберите козырёк'}
                  subtitle={
                    visor === null
                      ? `${visorOptions.length} вариантов, есть поиск`
                      : visor.price === null
                        ? 'без цены'
                        : `${formatMoney(visor.price)} за п.м.`
                  }
                  actionText={visor === null ? 'Выбрать' : 'Сменить'}
                  isEmpty={visor === null}
                  onClick={() => (isOpen ? setPicker(null) : openPicker())}
                />
              </div>
              <div style={{ flex: '0 1 170px', minWidth: 140 }}>
                <TextInput
                  label="Длина козырька, см"
                  inputMode="decimal"
                  suffix="см"
                  placeholder="длина"
                  value={opening.visorLengthCm}
                  onChange={(visorLengthCm) =>
                    updateOpening(opening.key, { visorLengthCm })
                  }
                />
              </div>
            </div>
            {isOpen && picker !== null ? (
              <VisorPicker
                visors={visorOptions}
                uses={usage.visors}
                chosenId={opening.visorServiceId}
                picker={picker}
                onPickerChange={setPicker}
                onPick={(visorServiceId) => {
                  updateOpening(opening.key, { visorServiceId });
                  setPicker(null);
                }}
              />
            ) : (
              <QuickPicks
                items={quick.map((option) => ({
                  id: option.id,
                  label: option.name,
                }))}
                onPick={(visorServiceId) =>
                  updateOpening(opening.key, { visorServiceId })
                }
              />
            )}
          </>
        )}
        {isVisorOnlyOpening(opening) && (
          <span style={{ color: colors.muted }}>
            Без ширины и высоты сохранится только козырёк, без решётки.
          </span>
        )}
      </div>
    );
  };

  const openingCard = (opening: OpeningDraft, index: number) => {
    const openingNumber = index + 1;
    const isExpanded = expandedKey === opening.key;
    const ownErrors = errorsOf(errors, openingNumber);
    const total = openingTotal(opening);
    const area = openingArea(opening);
    const grille = grilleOf(opening);
    const quote = computeOpeningQuote(opening, grilles);
    const visorTotal = computeOpeningVisorTotal(opening, visorOptions);
    const size = describeSize(opening);
    const meta = [
      describeGrille(opening),
      size,
      quantityOf(opening) > 1 ? `${opening.quantity} шт` : null,
      opening.isVisorWanted ? 'козырёк' : null,
      opening.photos.length > 0 ? `фото ${opening.photos.length}` : null,
    ]
      .filter((part) => part !== null)
      .join(' · ');

    return (
      <section
        key={opening.key}
        aria-label={`Проём ${openingNumber}`}
        style={{
          background: colors.surface,
          border: `1px solid ${ownErrors.length > 0 ? colors.danger : colors.border}`,
          borderRadius: RADIUS.card,
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => toggleOpening(opening.key)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: SPACE.md,
            width: '100%',
            minHeight: 72,
            padding: `${SPACE.md}px ${SPACE.lg}px`,
            background: 'transparent',
            border: 'none',
            color: colors.text,
            font: 'inherit',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              flex: 'none',
              display: 'grid',
              placeItems: 'center',
              width: 36,
              height: 36,
              borderRadius: RADIUS.control,
              background:
                ownErrors.length > 0 ? colors.dangerTint : colors.accentTint,
              color: ownErrors.length > 0 ? colors.danger : colors.accent,
              fontWeight: 700,
            }}
          >
            {openingNumber}
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'grid' }}>
            <span style={TYPE.rowTitle}>Проём {openingNumber}</span>
            <span
              style={{
                ...TYPE.label,
                color: colors.muted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {meta}
            </span>
          </span>
          <span
            style={{
              display: 'grid',
              justifyItems: 'end',
              ...TABULAR_NUMBERS,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {total === null ? '—' : formatMoney(total)}
            </span>
            {area !== null && (
              <span style={{ ...TYPE.label, color: colors.muted }}>
                {formatQuantity(area, 'м²')}
              </span>
            )}
          </span>
          <span aria-hidden style={{ color: colors.muted }}>
            {isExpanded ? '⌃' : '⌄'}
          </span>
        </button>
        {isExpanded && (
          <div
            style={{
              ...column(SPACE.xl),
              padding: SPACE.lg,
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            {grilleField(opening)}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isSketchBeside
                  ? 'minmax(0, 1fr) 250px'
                  : 'minmax(0, 1fr)',
                gap: SPACE.xl,
                alignItems: 'start',
              }}
            >
              <div style={column(SPACE.lg)}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                    gap: SPACE.md,
                  }}
                >
                  <Field label="Ширина">
                    <TextInput
                      label="Ширина, см"
                      inputMode="decimal"
                      isLarge
                      suffix="см"
                      placeholder="0"
                      value={opening.widthCm}
                      onChange={(widthCm) =>
                        updateOpening(opening.key, { widthCm })
                      }
                    />
                  </Field>
                  <Field label="Высота">
                    <TextInput
                      label="Высота, см"
                      inputMode="decimal"
                      isLarge
                      suffix="см"
                      placeholder="0"
                      value={opening.heightCm}
                      onChange={(heightCm) =>
                        updateOpening(opening.key, { heightCm })
                      }
                    />
                  </Field>
                </div>
                <QuantityStepper
                  label="Количество одинаковых"
                  value={opening.quantity}
                  onChange={(quantity) =>
                    updateOpening(opening.key, { quantity })
                  }
                />
                <div style={column(SPACE.sm)}>
                  <FieldLabel>Вынос</FieldLabel>
                  <div
                    style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}
                  >
                    <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                      <Segmented
                        label="Вынос"
                        value={opening.projectionKind}
                        stackBelowPx={290}
                        options={PROJECTION_KIND_OPTIONS.map(
                          ({ value, label }) => ({
                            value: value as ProjectionKind,
                            label: label
                              .replace('Вынос ', '')
                              .replace(/^./, (letter) => letter.toUpperCase()),
                          }),
                        )}
                        onChange={(projectionKind) =>
                          updateOpening(opening.key, { projectionKind })
                        }
                      />
                    </div>
                    {opening.projectionKind !== 'NONE' && (
                      <div style={{ flex: '0 1 150px', minWidth: 120 }}>
                        <TextInput
                          label="Вынос, см"
                          inputMode="decimal"
                          suffix="см"
                          placeholder="0"
                          value={opening.projectionCm}
                          onChange={(projectionCm) =>
                            updateOpening(opening.key, { projectionCm })
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
                {visorField(opening)}
              </div>
              <div
                style={{
                  ...column(SPACE.sm),
                  padding: SPACE.md,
                  background: colors.panel,
                  borderRadius: RADIUS.card,
                }}
              >
                <div style={{ maxWidth: 300, width: '100%', margin: '0 auto' }}>
                  <OpeningSketch
                    widthCm={parseDecimalInput(opening.widthCm)}
                    heightCm={parseDecimalInput(opening.heightCm)}
                    projectionKind={opening.projectionKind}
                    projectionCm={parseDecimalInput(opening.projectionCm) ?? 0}
                  />
                </div>
                {area !== null && (
                  <SummaryLine
                    label="Площадь"
                    value={`${formatQuantity(computeOpeningAreaSquareMeters(opening) ?? 0, 'м²')}${quantityOf(opening) > 1 ? ` × ${opening.quantity}` : ''}`}
                  />
                )}
                {grille !== null && area !== null && (
                  <SummaryLine
                    label={grille.name}
                    value={quote === null ? '—' : formatMoney(quote.lineTotal)}
                  />
                )}
                {opening.visorServiceId !== '' && (
                  <SummaryLine
                    label="Козырёк"
                    value={
                      visorTotal === null
                        ? 'нужна длина'
                        : formatMoney(visorTotal)
                    }
                  />
                )}
                <div
                  style={{
                    paddingTop: SPACE.sm,
                    borderTop: `1px solid ${colors.border}`,
                  }}
                >
                  <SummaryLine
                    label="Проём"
                    value={
                      total === null
                        ? opening.designId === ''
                          ? 'Цену назовёт менеджер'
                          : '—'
                        : formatMoney(total)
                    }
                  />
                </div>
              </div>
            </div>
            <div style={column(SPACE.sm)}>
              <FieldLabel>
                Фото · {opening.photos.length} из {MAX_PHOTOS_PER_OPENING}
              </FieldLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
                {opening.photos.map((photo, photoIndex) => (
                  <PhotoThumbnail
                    key={photo.key}
                    photo={photo}
                    alt={`Фото ${photoIndex + 1}, проём ${openingNumber}`}
                    onRemove={() => removePhoto(opening.key, photo.key)}
                    removeLabel={`Удалить фото ${photoIndex + 1}, проём ${openingNumber}`}
                  />
                ))}
                {opening.photos.length < MAX_PHOTOS_PER_OPENING && (
                  <label
                    style={{
                      ...thumbnailBox,
                      display: 'grid',
                      placeContent: 'center',
                      justifyItems: 'center',
                      border: `2px dashed ${colors.border}`,
                      color: colors.accent,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: '26px', lineHeight: 1 }}>+</span>
                    Фото
                    {/* No capture attribute: tablets then offer both the
                        camera and the gallery. Re-keyed per pick so choosing
                        the same file again still fires onChange. */}
                    <input
                      key={photoPickCount}
                      type="file"
                      accept="image/*"
                      multiple
                      aria-label={`Добавить фото, проём ${openingNumber}`}
                      style={{
                        height: 1,
                        opacity: 0,
                        overflow: 'hidden',
                        position: 'absolute',
                        width: 1,
                      }}
                      onChange={(event) =>
                        addPhotos(opening, Array.from(event.target.files ?? []))
                      }
                    />
                  </label>
                )}
              </div>
              {photoLimitNotice?.openingKey === opening.key && (
                <span role="status" style={{ color: colors.danger }}>
                  Не больше {MAX_PHOTOS_PER_OPENING} фото на проём: лишние (
                  {photoLimitNotice.skippedCount}) не добавлены.
                </span>
              )}
            </div>
            <TextArea
              label="Заметки"
              value={opening.notes}
              placeholder="Например: решётка открывается, замок справа"
              onChange={(notes) => updateOpening(opening.key, { notes })}
            />
            <ErrorList errors={ownErrors} />
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: SPACE.md,
              }}
            >
              {draft.openings.length > 1 ? (
                <button
                  type="button"
                  style={{
                    ...linkButton(false),
                    color: colors.danger,
                    background: 'transparent',
                    font: 'inherit',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  onClick={() => removeOpening(opening.key)}
                >
                  Удалить проём
                </button>
              ) : (
                <span />
              )}
              <Button onClick={() => duplicateOpening(opening)}>
                Копировать проём
              </Button>
            </div>
          </div>
        )}
      </section>
    );
  };

  const otherErrors = errors.filter((error) => !/^Проём \d+:/.test(error));
  const totalText =
    draftTotal === null ? 'Цену назовёт менеджер' : formatMoney(draftTotal);

  const summary = isSideSummary ? (
    <aside
      style={{
        position: 'sticky',
        top: SPACE.lg,
        ...column(SPACE.lg),
        padding: SPACE.lg,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.card,
      }}
    >
      <div style={column(SPACE.xs)}>
        <SectionTitle title="Клиент" />
        <span style={TYPE.rowTitle}>
          {draft.clientName.trim() || 'Новый клиент'}
        </span>
        <span style={{ ...TYPE.label, color: colors.muted }}>
          {[findLabel(DISTRICT_OPTIONS, draft.district), draft.addressLine]
            .filter((part) => part !== null && part !== '')
            .join(', ') || 'адрес не указан'}
        </span>
      </div>
      <div style={column(SPACE.xs)}>
        <SectionTitle title="Проёмы" />
        {draft.openings.map((opening, index) => {
          const total = openingTotal(opening);
          const size = describeSize(opening);

          return (
            <button
              key={opening.key}
              type="button"
              onClick={() => {
                setExpandedKey(opening.key);
                setPicker(null);
              }}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px minmax(0, 1fr) auto',
                gap: SPACE.sm,
                alignItems: 'baseline',
                padding: `${SPACE.sm}px ${SPACE.xs}px`,
                background:
                  expandedKey === opening.key ? colors.panel : 'transparent',
                border: 'none',
                borderRadius: RADIUS.control,
                color: colors.text,
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span style={{ color: colors.muted, fontWeight: 600 }}>
                {index + 1}
              </span>
              <span style={{ display: 'grid', minWidth: 0 }}>
                {describeGrille(opening)}
                <span
                  style={{
                    ...TYPE.label,
                    ...TABULAR_NUMBERS,
                    color: colors.muted,
                  }}
                >
                  {size === null
                    ? 'нет размеров'
                    : `${size}${quantityOf(opening) > 1 ? ` × ${opening.quantity}` : ''}`}
                </span>
              </span>
              <span
                style={{
                  ...TABULAR_NUMBERS,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {total === null ? '—' : formatMoney(total)}
              </span>
            </button>
          );
        })}
      </div>
      <div
        style={{
          ...column(SPACE.xs),
          paddingTop: SPACE.md,
          borderTop: `1px solid ${colors.border}`,
        }}
      >
        <SummaryLine
          label="Площадь"
          value={formatQuantity(totalAreaSquareMeters, 'м²')}
        />
        <SummaryLine label="Сумма" value={totalText} isTotal />
      </div>
      <ErrorList errors={errors} />
      <button type="button" style={primaryWide} onClick={goToPayment}>
        Далее: оплата →
      </button>
    </aside>
  ) : null;

  const topBar = isSideSummary ? null : (
    <div
      style={{
        position: 'sticky',
        top: 0,
        // Above the inputs of the openings that scroll under it
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: SPACE.md,
        padding: `${SPACE.sm}px ${SPACE.md}px`,
        background: colors.panel,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.card,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'grid' }}>
        <span style={{ ...TYPE.rowTitle, ...TABULAR_NUMBERS }}>
          {totalText}
        </span>
        <span
          style={{ ...TYPE.label, ...TABULAR_NUMBERS, color: colors.muted }}
        >
          {countOpenings(draft.openings.length)} ·{' '}
          {formatQuantity(totalAreaSquareMeters, 'м²')}
        </span>
      </span>
      <Button variant="primary" onClick={goToPayment}>
        Далее →
      </Button>
    </div>
  );

  const form = (
    <div style={column()}>
      {loadError !== null && <ErrorList errors={[loadError]} />}
      {scheduledOrders.length > 0 && (
        <div style={column(SPACE.md)}>
          <SectionTitle title="Чей замер" />
          <VisitCards
            visits={scheduledVisits}
            chosenId={target}
            newClientId={NEW_CLIENT_TARGET}
            onPick={pickTarget}
          />
        </div>
      )}
      <div style={column(SPACE.md)}>
        <SectionTitle title="Клиент" />
        {clientSection}
      </div>
      <div style={column(SPACE.md)}>
        <SectionTitle
          title="Проёмы"
          aside={
            <span style={{ ...TABULAR_NUMBERS, color: colors.muted }}>
              Итого площадь: {formatQuantity(totalAreaSquareMeters, 'м²')}
            </span>
          }
        />
        {draft.openings.map(openingCard)}
        <button
          type="button"
          onClick={addOpening}
          style={{
            minHeight: CONTROL_HEIGHT + SPACE.lg,
            background: 'transparent',
            border: `2px dashed ${colors.border}`,
            borderRadius: RADIUS.card,
            color: colors.accent,
            font: 'inherit',
            ...TYPE.rowTitle,
            cursor: 'pointer',
          }}
        >
          + Добавить проём
        </button>
      </div>
      {!isSideSummary && (
        <>
          <ErrorList errors={otherErrors} />
          <button type="button" style={primaryWide} onClick={goToPayment}>
            Далее: оплата →
          </button>
        </>
      )}
    </div>
  );

  return frame(
    <>
      <div style={column(SPACE.lg)}>
        {header}
        {topBar}
        {isSideSummary ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `minmax(0, 1fr) ${SUMMARY_WIDTH}px`,
              gap: SPACE.xl,
              alignItems: 'start',
            }}
          >
            {form}
            {summary}
          </div>
        ) : (
          form
        )}
      </div>
    </>,
  );
};

const thumbnailBox: CSSProperties = {
  boxSizing: 'border-box',
  position: 'relative',
  width: 92,
  height: 92,
  borderRadius: RADIUS.control,
  overflow: 'hidden',
};

const PhotoThumbnail = ({
  photo,
  alt,
  removeLabel,
  onRemove,
}: {
  photo: OpeningPhoto;
  alt: string;
  removeLabel?: string;
  onRemove?: () => void;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        ...thumbnailBox,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.panel,
        border: `1px solid ${colors.border}`,
      }}
    >
      {photo.thumbnailUrl === null ? (
        <span style={{ fontSize: '12px', padding: SPACE.xs }}>
          {photo.file.name}
        </span>
      ) : (
        <img
          src={photo.thumbnailUrl}
          alt={alt}
          style={{ height: '100%', objectFit: 'cover', width: '100%' }}
        />
      )}
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          style={{
            position: 'absolute',
            top: SPACE.xs,
            right: SPACE.xs,
            width: 32,
            height: 32,
            padding: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            border: 'none',
            borderRadius: '50%',
            color: '#ffffff',
            fontSize: '18px',
            lineHeight: '32px',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
};

const PhotoRow = ({
  photos,
  openingNumber,
}: {
  photos: OpeningPhoto[];
  openingNumber: number;
}) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
    {photos.map(
      (photo, index) =>
        photo.thumbnailUrl !== null && (
          <PhotoThumbnail
            key={photo.key}
            photo={photo}
            alt={`Фото ${index + 1}, проём ${openingNumber}`}
          />
        ),
    )}
  </div>
);

const StepDots = ({ step }: { step: Step }) => {
  const colors = usePalette();
  const steps: { key: Step; label: string }[] = [
    { key: 'measurement', label: 'Замер' },
    { key: 'payment', label: 'Оплата' },
  ];

  return (
    <ol
      aria-label="Шаги"
      style={{
        display: 'flex',
        gap: SPACE.sm,
        margin: '0 0 0 auto',
        padding: 0,
        listStyle: 'none',
      }}
    >
      {steps.map((item, index) => {
        const isCurrent = item.key === step;
        const isDone = step === 'payment' && item.key === 'measurement';

        return (
          <li
            key={item.key}
            aria-current={isCurrent ? 'step' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: SPACE.sm,
              padding: `${SPACE.xs}px ${SPACE.md}px ${SPACE.xs}px ${SPACE.xs}px`,
              borderRadius: CONTROL_HEIGHT,
              background: isCurrent ? colors.accentTint : 'transparent',
              color: isCurrent ? colors.accent : colors.muted,
              fontWeight: isCurrent ? 600 : 400,
            }}
          >
            <span
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: isCurrent
                  ? colors.accent
                  : isDone
                    ? colors.successTint
                    : colors.panel,
                color: isCurrent
                  ? colors.onAccent
                  : isDone
                    ? colors.success
                    : colors.muted,
                ...TYPE.label,
                fontWeight: 600,
              }}
            >
              {isDone ? '✓' : index + 1}
            </span>
            {item.label}
          </li>
        );
      })}
    </ol>
  );
};

const ReceiptLine = ({
  title,
  detail,
  amount,
}: {
  title: string;
  detail: string;
  amount: string;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: SPACE.md,
        padding: `${SPACE.md}px 0`,
        borderBottom: `1px dashed ${colors.border}`,
      }}
    >
      <span style={{ display: 'grid', minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span
          style={{ ...TYPE.label, ...TABULAR_NUMBERS, color: colors.muted }}
        >
          {detail}
        </span>
      </span>
      <span
        style={{ ...TABULAR_NUMBERS, fontWeight: 600, whiteSpace: 'nowrap' }}
      >
        {amount}
      </span>
    </div>
  );
};

const QuickButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => {
  const colors = usePalette();

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: CONTROL_HEIGHT - SPACE.sm,
        padding: `0 ${SPACE.md}px`,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: CONTROL_HEIGHT,
        color: colors.text,
        font: 'inherit',
        ...TYPE.label,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
};

const GrillePicker = ({
  grilles,
  uses,
  chosenId,
  picker,
  onPickerChange,
  onPick,
}: {
  grilles: GrilleOption[];
  uses: Map<string, number>;
  chosenId: string;
  picker: Picker;
  onPickerChange: (picker: Picker | null) => void;
  onPick: (designId: string) => void;
}) => {
  const kinds = [
    ...new Set(
      grilles
        .map((grille) => grille.kindName)
        .filter((kind): kind is string => kind !== null),
    ),
  ].sort((left, right) => left.localeCompare(right, 'ru'));
  const found = sortByName(
    grilles.filter(
      (grille) =>
        (picker.grilleKind === ALL_KINDS ||
          grille.kindName === picker.grilleKind) &&
        matchesSearch(picker.query, [grille.name, grille.kindName]),
    ),
  );
  const isBrowsing =
    picker.query.trim() === '' && picker.grilleKind === ALL_KINDS;
  const popular = isBrowsing
    ? rankByUse(grilles, uses).slice(0, PICKER_POPULAR_COUNT)
    : [];
  const tile = (grille: GrilleOption) => (
    <PhotoTile
      key={grille.id}
      name={grille.name}
      photoUrl={grille.photoUrl}
      isSelected={grille.id === chosenId}
      onSelect={() => onPick(grille.id)}
      caption={[
        grille.kindName,
        grille.pricePerSquareMeter === null
          ? 'без цены'
          : `${formatMoney(grille.pricePerSquareMeter)} за м²`,
      ]
        .filter((part) => part !== null)
        .join(' · ')}
    />
  );
  const otherTile = (
    <PhotoTile
      name="Другая"
      photoUrl={null}
      isSelected={chosenId === ''}
      onSelect={() => onPick('')}
      caption="цену назовёт менеджер"
    />
  );

  return (
    <PickerPanel
      title="Решётка"
      query={picker.query}
      placeholder="Название или вид, например «ромб»"
      onQueryChange={(query) => onPickerChange({ ...picker, query })}
      onClose={() => onPickerChange(null)}
      filters={
        kinds.length > 0 ? (
          <FilterChips
            value={picker.grilleKind}
            options={[
              { value: ALL_KINDS, label: `Все ${grilles.length}` },
              ...kinds.map((kind) => ({
                value: kind,
                label: `${kind} ${grilles.filter((grille) => grille.kindName === kind).length}`,
              })),
            ]}
            onChange={(grilleKind) => onPickerChange({ ...picker, grilleKind })}
          />
        ) : undefined
      }
    >
      {popular.length > 0 && (
        <PickerGroup title="Часто берут">
          <TileGrid>{popular.map(tile)}</TileGrid>
        </PickerGroup>
      )}
      <PickerGroup
        title={`${isBrowsing ? 'Все решётки' : 'Найдено'} · ${found.length}`}
      >
        {found.length === 0 && (
          <span>
            Ничего не нашлось. Проверьте название или выберите «Другая», цену
            назовёт менеджер.
          </span>
        )}
        <TileGrid>
          {found.map(tile)}
          {otherTile}
        </TileGrid>
      </PickerGroup>
    </PickerPanel>
  );
};

const VisorPicker = ({
  visors,
  uses,
  chosenId,
  picker,
  onPickerChange,
  onPick,
}: {
  visors: VisorOption[];
  uses: Map<string, number>;
  chosenId: string;
  picker: Picker;
  onPickerChange: (picker: Picker | null) => void;
  onPick: (visorServiceId: string) => void;
}) => {
  const found = visors.filter((visor) =>
    matchesSearch(picker.query, [visor.name]),
  );
  const isBrowsing = picker.query.trim() === '';
  const popular = isBrowsing
    ? rankByUse(visors, uses).slice(0, QUICK_VISOR_COUNT)
    : [];
  const row = (visor: VisorOption) => (
    <ListRow
      key={visor.id}
      title={visor.name}
      value={
        visor.price === null
          ? 'без цены'
          : `${formatMoney(visor.price)} за п.м.`
      }
      isSelected={visor.id === chosenId}
      onSelect={() => onPick(visor.id)}
    />
  );

  return (
    <PickerPanel
      title="Козырёк"
      query={picker.query}
      placeholder="Название, например «поликарбонат»"
      onQueryChange={(query) => onPickerChange({ ...picker, query })}
      onClose={() => onPickerChange(null)}
    >
      {popular.length > 0 && (
        <PickerGroup title="Часто берут">{popular.map(row)}</PickerGroup>
      )}
      <PickerGroup
        title={`${isBrowsing ? 'Все козырьки' : 'Найдено'} · ${found.length}`}
      >
        {found.length === 0 && (
          <span>Ничего не нашлось. Проверьте название.</span>
        )}
        {found.map(row)}
      </PickerGroup>
    </PickerPanel>
  );
};
