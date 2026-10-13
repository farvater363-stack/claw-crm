import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
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
  type ExtraServiceUnit,
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethod,
  PROJECTION_KIND_OPTIONS,
  type Product,
  type ProjectionKind,
  toProduct,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import {
  contractDataFromDraft,
  contractNumberOf,
  missingClientDetails,
} from 'src/contract/contract-data';
import { buildContractDocument } from 'src/contract/contract-document';
import {
  loadContractTemplate,
  loadSignerName,
  signContract,
} from 'src/contract/contract-store';
import {
  type ContractTemplate,
  missingCompanyDetails,
} from 'src/contract/contract-template';
import { ContractSigning } from 'src/contract/contract-view';
import {
  type ClientMatch,
  draftFromClientMatch,
  findClientByPhone,
} from 'src/measurer-form/client-match';
import { ClientSheet, VisitChooser } from 'src/measurer-form/client-sheet';
import {
  ALL_KINDS,
  EditorCard,
  GrillePicker,
  ListItem,
  OptionTile,
  PhotoRow,
  PhotoThumbnail,
  type Picker,
  QUICK_VISOR_COUNT,
  QuickButton,
  ReceiptLine,
  type Step,
  StepTabs,
  thumbnailBox,
  VisorPicker,
  WRAP,
} from 'src/measurer-form/measurement-parts';
import {
  applyPaymentChanges,
  buildMeasurementPayload,
  buildOpeningPhotoLabel,
  computeDraftTotal,
  computeOpeningAreaSquareMeters,
  computeOpeningQuote,
  computeOpeningRunningMeters,
  computeOpeningsTotalAreaSquareMeters,
  computeOpeningVisorTotal,
  computePaymentPreview,
  computeServiceLineTotal,
  computeServiceQuantity,
  computeServicesTotal,
  copyOpening,
  createEmptyOpening,
  createOpeningLike,
  createShapePointKey,
  describeMeasurementTime,
  describePhotoUploadFailure,
  draftFromScheduledOrder,
  EMPTY_PAYMENT_DRAFT,
  formatUzbekNationalPhone,
  type GrilleOption,
  isCountedServiceUnit,
  isVisorOnlyOpening,
  MAX_PHOTOS_PER_OPENING,
  MEASUREMENT_ORDER_STORAGE_KEY,
  type MeasurementDraft,
  NEW_CLIENT_TARGET,
  openingHeightCm,
  openingOutline,
  type OpeningDraft,
  type OpeningPhoto,
  parseDecimalInput,
  type PaymentDraft,
  type PaymentPreview,
  resolveTargetOrderId,
  type ScheduledOrder,
  type ServiceDraft,
  type ServiceOption,
  serviceUnitText,
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
  ErrorList,
  Fact,
  FieldLabel,
  OpeningSketch,
  QuantityStepper,
  RailingSketch,
  SectionTitle,
  Segmented,
  type SignatureStroke,
  SummaryLine,
  TextArea,
  TileGrid,
  useElementHeight,
  useElementWidth,
} from 'src/measurer-form/measurer-form-ui';
import {
  NumberPad,
  PadField,
  type PadTarget,
} from 'src/measurer-form/number-pad';
import { applyPadKey, type PadKey } from 'src/measurer-form/pad-input';
import {
  countUses,
  pickQuickOptions,
  sortByName,
} from 'src/measurer-form/option-search';
import { ShapeFields, shapeSizes } from 'src/measurer-form/shape-fields';
import {
  shapeKindLabel,
  buildShapeOutline,
} from 'src/opening-shape/opening-shape';
import {
  formatSketchCm,
  SKETCH_HEIGHT,
  SKETCH_WIDTH,
} from 'src/opening-shape/sketch-layout';
import {
  formatItemSize,
  formatRailingSize,
  railingName,
} from 'src/pricing/compute-item-area';
import { todayInTashkent } from 'src/pricing/dates';
import { toStoredUzbekPhone } from 'src/pricing/normalize-uzbek-phone';
import { fromCurrency, toCurrency } from 'src/recalc/money';
import { formatMoney, formatQuantity, formatWhole } from 'src/ui/format';
import {
  Button,
  Field,
  PhotoTile,
  SelectInput,
  TextInput,
  usePalette,
} from 'src/ui/kit';
import {
  CONTROL_HEIGHT,
  RADIUS,
  SPACE,
  TABULAR_NUMBERS,
  TYPE,
} from 'src/ui/tokens';
import { joinFullName, trimFullName } from 'src/utils/full-name';
import { fetchFieldMetadataId } from 'src/utils/fetch-field-metadata-id';
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
  isServiceFailed: boolean;
  isPaymentFailed: boolean;
  // null when the client did not sign
  contract: 'signed' | 'failed' | null;
  // The form as it was saved: the result shows what went to the order
  draft: MeasurementDraft;
  preview: PaymentPreview;
  areaSquareMeters: number;
};

type Usage = { grilles: Map<string, number>; visors: Map<string, number> };

const ORDER_NAME_POLL_ATTEMPTS = 20;
const ORDER_NAME_POLL_INTERVAL_MS = 750;
const THUMBNAIL_MAX_SIDE_PX = 160;
const USAGE_SAMPLE_SIZE = 500;
const QUICK_GRILLE_COUNT = 5;
// List | editor | sketch and pad from this page width (a tablet on its side
// beside Twenty's menu); narrower, the list is a strip on top.
const THREE_COLUMNS_MIN_WIDTH = 900;
// Below this the side columns are narrower, to leave the editor its room
const ROOMY_MIN_WIDTH = 1100;
const SKETCH_MAX_WIDTH = 300;
const SKETCH_MIN_WIDTH = 150;
// The number pad, the summary lines under the sketch and the gaps between
const PAD_AND_SUMMARY_HEIGHT_PX = 520;
// Narrower than this (a tablet upright, a phone) the pad docks at the bottom
const TOOL_BESIDE_MIN_WIDTH = 680;
// The sketch fits beside the docked pad from this width
const DOCK_SKETCH_MIN_WIDTH = 560;
const LIST_WIDTH = { roomy: 250, tight: 210 };
const TOOL_WIDTH = { roomy: 300, tight: 270 };
const SERVICES_KEY = 'services';
const PREPAYMENT_SHARES = [
  { label: '30%', share: 0.3 },
  { label: '50%', share: 0.5 },
  { label: 'Вся сумма', share: 1 },
  { label: 'Без предоплаты', share: 0 },
];

// An opening's key is also the id of the order item it is saved as, so a save
// sent twice writes the same item again and does not add a second one.
const createOpening = () => createEmptyOpening(randomUuid(), randomUuid());
// crypto.randomUUID is missing in the sandbox (no secure context); keys only
// need to be unique within this page.
let photoKeySequence = 0;
const createPhotoKey = () => `photo-${photoKeySequence++}`;

const draftClientName = (draft: MeasurementDraft): string | null =>
  joinFullName({
    firstName: draft.clientFirstName,
    lastName: draft.clientLastName,
  });

const createEmptyDraft = (): MeasurementDraft => ({
  clientFirstName: '',
  clientLastName: '',
  clientPhone: '',
  district: '',
  addressLine: '',
  floor: '',
  source: '',
  measurementDate: toDateTimeLocalInputValue(new Date()),
  comment: '',
  openings: [createOpening()],
  services: [],
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
            product: true,
            pricePerSquareMeter: { amountMicros: true, currencyCode: true },
            photos: { url: true },
            grilleKind: { name: true },
          },
        },
      },
      extraServices: {
        __args: { first: 200 },
        edges: {
          node: {
            id: true,
            name: true,
            kind: true,
            unit: true,
            price: { amountMicros: true, currencyCode: true },
          },
        },
      },
    });
  const services = (extraServices?.edges ?? []).map(({ node }) => node);

  return {
    measurerId: workspaceMembers?.edges[0]?.node?.id ?? null,
    grilles: (designs?.edges ?? []).map(({ node }): GrilleOption => ({
      id: node.id,
      product: toProduct(node.product),
      name: node.name ?? '',
      kindName: node.grilleKind?.name ?? null,
      photoUrl: node.photos?.[0]?.url ?? null,
      pricePerSquareMeter: fromCurrency(node.pricePerSquareMeter),
    })),
    visorOptions: sortByName<VisorOption>(
      services
        .filter((node) => node.kind === 'VISOR')
        .map((node): VisorOption => ({
          id: node.id,
          name: node.name ?? '',
          price: fromCurrency(node.price),
        })),
    ),
    // Every service in Цены → Услуги, whatever is added there later.
    serviceOptions: sortByName<ServiceOption>(
      services
        .filter((node) => node.kind !== 'VISOR')
        .map((node): ServiceOption => ({
          id: node.id,
          name: node.name ?? '',
          unit: (node.unit ?? null) as ExtraServiceUnit | null,
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
          clientFullName: { firstName: true, lastName: true },
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
      clientFullName: trimFullName(node.clientFullName),
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
  const heightCm =
    opening.product === 'RAILING'
      ? parseDecimalInput(opening.heightCm)
      : openingHeightCm(opening);

  if (widthCm === null || heightCm === null || widthCm <= 0 || heightCm <= 0) {
    return null;
  }

  if (opening.product === 'RAILING') {
    return formatRailingSize({ lengthCm: widthCm, heightCm });
  }

  const size = formatItemSize({
    widthCm,
    heightCm,
    projectionCm:
      opening.projectionKind === 'NONE'
        ? 0
        : (parseDecimalInput(opening.projectionCm) ?? 0),
    projectionKind: opening.projectionKind,
  });

  return opening.shape.kind === 'RECTANGLE'
    ? size
    : `${shapeKindLabel(opening.shape.kind).toLowerCase()} ${size}`;
};

// Only contradictions while typing: «укажите …» for a field not reached yet
// would turn the card red before the measurer is done.
const liveShapeErrors = (opening: OpeningDraft): string[] =>
  opening.product === 'RAILING' || opening.shape.kind === 'RECTANGLE'
    ? []
    : buildShapeOutline(
        opening.shape,
        opening.widthCm,
        opening.heightCm,
      ).errors.filter((error) => !error.includes('укажите'));

const quantityOf = (opening: OpeningDraft) =>
  parseDecimalInput(opening.quantity) ?? 1;

// Each opening's own errors start with its label, «Проём 2: …»
const errorsOf = (errors: string[], openingNumber: number) =>
  errors.filter((error) => error.startsWith(`Проём ${openingNumber}:`));

const initialsOf = (name: string | null): string =>
  (name ?? '')
    .split(' ')
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('') || '?';

// Short enough for a badge on the проём in the list
const shortProblem = (error: string): string => {
  const text = error.replace(/^Проём \d+: /, '');

  if (text.includes('длину козырька')) return 'нужна длина козырька';
  if (text.includes('выберите козырёк')) return 'выберите козырёк';
  if (text.startsWith('укажите вынос')) return 'нужен вынос';
  if (text.includes('количество')) return 'проверьте количество';
  if (/укажите|ширин|высот|размер/.test(text)) return 'нужны размеры';

  return text;
};

const isClientError = (error: string) =>
  /телефон|Этаж|дату замера|чей это замер/i.test(error);

type Layout = 'wide' | 'medium' | 'narrow';

export const NewMeasurement = () => {
  const colors = usePalette();
  const userId = useUserId();
  const page = useElementWidth();
  const header = useElementHeight();
  const footer = useElementHeight();
  const screen = useElementHeight();
  const [draft, setDraft] = useState<MeasurementDraft>(createEmptyDraft);
  const [grilles, setGrilles] = useState<GrilleOption[]>([]);
  const [visorOptions, setVisorOptions] = useState<VisorOption[]>([]);
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);
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
  const [contractTemplate, setContractTemplate] =
    useState<ContractTemplate | null>(null);
  // The order whose card opened the form: «Назад» returns there
  const [openedFromOrderId, setOpenedFromOrderId] = useState<string | null>(
    null,
  );
  const [isLeaving, setIsLeaving] = useState(false);
  const [isClientSheetOpen, setIsClientSheetOpen] = useState(false);
  const [clientMatch, setClientMatch] = useState<ClientMatch | null>(null);
  // The проём in the editor, or SERVICES_KEY for «Услуги»
  const [selectedKey, setSelectedKey] = useState<string>(
    () => draft.openings[0]?.key ?? SERVICES_KEY,
  );
  const [activePadId, setActivePadId] = useState<string | null>(null);
  const lastPadPress = useRef<{
    id: string;
    renderedValue: string;
    value: string;
  } | null>(null);
  const [copiedNotice, setCopiedNotice] = useState<{
    openingKey: string;
    fromNumber: number;
  } | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  // State is read from the render's closure, so two taps before the next
  // render would both pass a check on isSaving.
  const isSaveInFlight = useRef(false);
  // The phone last sent to the search: a slower answer for an older number
  // must not show up under a newer one.
  const lookedUpPhone = useRef<string | null>(null);

  useEffect(() => {
    if (userId === null) return;

    loadFormContext(userId)
      .then(async (context) => {
        setGrilles(context.grilles);
        setVisorOptions(context.visorOptions);
        setServiceOptions(context.serviceOptions);

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
        } else if (orders.length === 0) {
          // Nothing booked: the visit can only be a new client.
          setTarget(NEW_CLIENT_TARGET);
          setIsClientSheetOpen(true);
        }
      })
      .catch((error: unknown) =>
        setLoadError(`Не удалось загрузить форму: ${describeError(error)}`),
      );

    loadUsage()
      .then(setUsage)
      .catch(() => undefined);

    loadContractTemplate()
      .then(setContractTemplate)
      .catch(() => undefined);
  }, [userId]);

  const updateDraft = (changes: Partial<MeasurementDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const updateOpening = (
    key: string,
    changes:
      | Partial<OpeningDraft>
      | ((opening: OpeningDraft) => Partial<OpeningDraft>),
  ) =>
    setDraft((current) => ({
      ...current,
      openings: current.openings.map((opening) =>
        opening.key === key
          ? {
              ...opening,
              ...(typeof changes === 'function' ? changes(opening) : changes),
            }
          : opening,
      ),
    }));

  const selectOpening = (key: string) => {
    setSelectedKey(key);
    setActivePadId(null);
    setPicker(null);
  };

  // The next window is usually of the same build: what it is made of carries
  // over, the sizes start empty and the pad waits on the width.
  const addOpening = () => {
    const previous = draft.openings[draft.openings.length - 1];
    const opening =
      previous === undefined
        ? createOpening()
        : createOpeningLike(previous, randomUuid(), randomUuid());

    setDraft((current) => ({
      ...current,
      openings: [...current.openings, opening],
    }));
    setSelectedKey(opening.key);
    setActivePadId(`${opening.key}:width`);
    setPicker(null);
    setCopiedNotice(
      previous === undefined
        ? null
        : { openingKey: opening.key, fromNumber: draft.openings.length },
    );
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
    selectOpening(opening.key);
    setCopiedNotice(null);
  };

  const removeOpening = (key: string) => {
    const index = draft.openings.findIndex((opening) => opening.key === key);
    const remaining = draft.openings.filter((opening) => opening.key !== key);

    setDraft((current) => ({
      ...current,
      openings: current.openings.filter((opening) => opening.key !== key),
    }));
    selectOpening(
      remaining[Math.min(index, remaining.length - 1)]?.key ?? SERVICES_KEY,
    );
  };

  const addService = (serviceId: string) => {
    if (serviceId === '') return;

    const line: ServiceDraft = { key: randomUuid(), serviceId, quantity: '' };
    const option = serviceOptions.find(
      (candidate) => candidate.id === serviceId,
    );

    setDraft((current) => ({
      ...current,
      services: [...current.services, line],
    }));
    setActivePadId(
      option !== undefined && !isCountedServiceUnit(option.unit)
        ? `service:${line.key}`
        : null,
    );
  };

  const updateService = (key: string, quantity: string) =>
    setDraft((current) => ({
      ...current,
      services: current.services.map((line) =>
        line.key === key ? { ...line, quantity } : line,
      ),
    }));

  const removeService = (key: string) =>
    setDraft((current) => ({
      ...current,
      services: current.services.filter((line) => line.key !== key),
    }));

  // The save goes out with the form as it was when pressed; a change typed
  // meanwhile would be shown but never saved.
  const updatePayment = (changes: Partial<PaymentDraft>) => {
    if (isSaveInFlight.current) return;

    setPayment((current) => applyPaymentChanges(current, changes));
  };

  const changeSignature = (
    update: (strokes: SignatureStroke[]) => SignatureStroke[],
  ) => {
    if (isSaveInFlight.current) return;

    setSignature(update);
  };

  const emptyClient = {
    clientFirstName: '',
    clientLastName: '',
    clientPhone: '',
    district: '',
    addressLine: '',
    floor: '',
    source: '',
    comment: '',
    measurementDate: toDateTimeLocalInputValue(new Date()),
  } as const;

  // The first thing measured is the width, so the pad is ready for it.
  const startMeasuring = () => {
    const opening = draft.openings.find(
      (candidate) => candidate.key === selectedKey,
    );

    if (opening !== undefined && opening.widthCm === '') {
      setActivePadId(`${opening.key}:width`);
    }
  };

  const pickVisit = (orderId: string) => {
    const order = scheduledOrders.find((candidate) => candidate.id === orderId);

    if (order === undefined) return;

    setTarget(order.id);
    setClientMatch(null);
    updateDraft(draftFromScheduledOrder(order));
    startMeasuring();
  };

  // A new client starts blank, unless the measurer is coming back to one
  // they were already typing.
  const startNewClient = () => {
    if (target !== NEW_CLIENT_TARGET) updateDraft(emptyClient);

    setTarget(NEW_CLIENT_TARGET);
    setClientMatch(null);
    lookedUpPhone.current = null;
    setIsClientSheetOpen(true);
  };

  const chooseOtherClient = () => {
    setIsClientSheetOpen(false);
    setClientMatch(null);
    setTarget('');
  };

  const changeClient = (changes: Partial<MeasurementDraft>) => {
    updateDraft(changes);

    if (changes.clientPhone === undefined || target !== NEW_CLIENT_TARGET) {
      return;
    }

    const phone = toStoredUzbekPhone(changes.clientPhone);

    if (phone === null) {
      lookedUpPhone.current = null;
      setClientMatch(null);

      return;
    }

    if (phone === lookedUpPhone.current) return;

    lookedUpPhone.current = phone;
    findClientByPhone(phone)
      .then((match) => {
        if (lookedUpPhone.current === phone) setClientMatch(match);
      })
      .catch(() => undefined);
  };

  const takeClientMatch = () => {
    if (clientMatch === null) return;

    updateDraft(draftFromClientMatch(clientMatch, draft));
    setClientMatch(null);
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
    const remainingOrders = scheduledOrders.filter(
      (order) => order.id !== result?.orderId,
    );

    // The order just measured no longer waits for a measurement.
    setScheduledOrders(remainingOrders);
    setDraft(fresh);
    setPayment(EMPTY_PAYMENT_DRAFT);
    setSaveIds(createSaveIds());
    setTarget(remainingOrders.length === 0 ? NEW_CLIENT_TARGET : '');
    setIsClientSheetOpen(remainingOrders.length === 0);
    setClientMatch(null);
    lookedUpPhone.current = null;
    setErrors([]);
    setResult(null);
    setPhotoLimitNotice(null);
    setStep('measurement');
    setSignature([]);
    setIsLeaving(false);
    setSelectedKey(fresh.openings[0].key);
    setActivePadId(null);
    setCopiedNotice(null);
    setPicker(null);
  };

  const totalAreaSquareMeters = computeOpeningsTotalAreaSquareMeters(
    draft.openings,
  );
  const openingsTotal = computeDraftTotal(
    draft.openings,
    grilles,
    visorOptions,
  );
  const servicesTotal = computeServicesTotal(
    draft.services,
    serviceOptions,
    totalAreaSquareMeters,
  );
  const draftTotal =
    openingsTotal === null || servicesTotal === null
      ? null
      : openingsTotal + servicesTotal;
  const preview = computePaymentPreview(draftTotal, payment);
  const today = todayInTashkent();
  const isDirty =
    draft.clientFirstName !== '' ||
    draft.clientLastName !== '' ||
    draft.clientPhone !== '' ||
    draft.addressLine !== '' ||
    draft.comment !== '' ||
    draft.services.length > 0 ||
    draft.openings.some(
      (opening) =>
        opening.widthCm !== '' ||
        opening.notes !== '' ||
        opening.visorServiceId !== '' ||
        opening.photos.length > 0,
    );
  const layout: Layout =
    page.width >= THREE_COLUMNS_MIN_WIDTH
      ? 'wide'
      : page.width >= TOOL_BESIDE_MIN_WIDTH
        ? 'medium'
        : 'narrow';
  const room = page.width >= ROOMY_MIN_WIDTH ? 'roomy' : 'tight';
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
  const serviceOptionOf = (line: ServiceDraft) =>
    serviceOptions.find((option) => option.id === line.serviceId);
  const serviceUnitLabel = (unit: ExtraServiceUnit | null) =>
    unit === 'PER_SQUARE_METER'
      ? 'м²'
      : unit === 'PER_RUNNING_METER'
        ? 'п.м.'
        : 'шт';
  const describeServiceLine = (line: ServiceDraft): string => {
    const option = serviceOptionOf(line);
    const quantity = computeServiceQuantity(
      line,
      option,
      totalAreaSquareMeters,
    );
    const price =
      option?.price == null
        ? 'цена не задана'
        : `${formatMoney(option.price)} ${serviceUnitText(option.unit)}`;

    if (option?.unit == null || option.unit === 'FIXED') {
      return quantity !== null && quantity > 1
        ? `${quantity} × ${price}`
        : price;
    }

    return `${quantity === null ? '—' : formatQuantity(quantity, serviceUnitLabel(option.unit))} · ${price}`;
  };
  const describeGrille = (opening: OpeningDraft) => {
    const name = grilleOf(opening)?.name;

    if (opening.product === 'RAILING') {
      return railingName(name, 'Другие перилла');
    }

    return (
      name ??
      (isVisorOnlyOpening(opening) ? 'Только козырёк' : 'Другая решётка')
    );
  };
  // A railing has no visor or projection, and a design of the other kind
  // would price it per the wrong unit.
  const changeProduct = (opening: OpeningDraft, product: Product) => {
    const design = grilleOf(opening);

    updateOpening(opening.key, {
      product,
      designId:
        design !== null && design.product !== product ? '' : opening.designId,
      ...(product === 'RAILING'
        ? {
            projectionKind: 'NONE',
            projectionCm: '',
            isVisorWanted: false,
            visorServiceId: '',
            visorLengthCm: '',
          }
        : {}),
    });
    setActivePadId(null);

    if (picker?.openingKey === opening.key) setPicker(null);
  };
  // The visor's length follows the width until the measurer types their own.
  const changeWidth = (key: string, widthCm: string) =>
    updateOpening(key, (opening) => ({
      widthCm,
      ...(opening.visorServiceId !== '' &&
      (opening.visorLengthCm === '' ||
        opening.visorLengthCm === opening.widthCm)
        ? { visorLengthCm: widthCm }
        : {}),
    }));
  const chooseVisor = (opening: OpeningDraft, visorServiceId: string) => {
    updateOpening(opening.key, (current) => ({
      isVisorWanted: true,
      visorServiceId,
      visorLengthCm:
        current.visorLengthCm === '' ? current.widthCm : current.visorLengthCm,
    }));
    setPicker(null);
  };
  const dropVisor = (opening: OpeningDraft) => {
    updateOpening(opening.key, {
      isVisorWanted: false,
      visorServiceId: '',
      visorLengthCm: '',
    });
    setPicker(null);

    if (activePadId === `${opening.key}:visor`) setActivePadId(null);
  };

  const livePayload = buildMeasurementPayload(draft, measurerId ?? '', {
    orderId: null,
    payment: EMPTY_PAYMENT_DRAFT,
    subtotal: null,
    today,
    serviceOptions,
  });
  const liveErrors = [
    ...(resolveTargetOrderId(target, scheduledOrders).ok
      ? []
      : ['Выберите, чей это замер']),
    ...(livePayload.isValid ? [] : livePayload.errors),
  ];
  const problemOf = (openingNumber: number): string | null => {
    const first = errorsOf(liveErrors, openingNumber)[0];

    return first === undefined ? null : shortProblem(first);
  };

  const selectedIndex = draft.openings.findIndex(
    (opening) => opening.key === selectedKey,
  );
  const selectedOpening =
    selectedIndex === -1 ? null : draft.openings[selectedIndex];
  const isServicesSelected = selectedOpening === null;

  const openingPadTargets = (opening: OpeningDraft): PadTarget[] => {
    const cm = (
      id: string,
      label: string,
      value: string,
      onChange: (value: string) => void,
    ): PadTarget => ({
      id: `${opening.key}:${id}`,
      label,
      unit: 'см',
      kind: 'decimal',
      value,
      onChange,
    });
    const sizes =
      opening.product === 'RAILING'
        ? [
            cm('width', 'Длина', opening.widthCm, (value) =>
              changeWidth(opening.key, value),
            ),
            cm('height', 'Высота', opening.heightCm, (heightCm) =>
              updateOpening(opening.key, { heightCm }),
            ),
          ]
        : shapeSizes({
            shape: opening.shape,
            widthCm: opening.widthCm,
            heightCm: opening.heightCm,
            onShapeChange: (shape) => updateOpening(opening.key, { shape }),
            onWidthChange: (value) => changeWidth(opening.key, value),
            onHeightChange: (heightCm) =>
              updateOpening(opening.key, { heightCm }),
          }).map((size) => cm(size.id, size.label, size.value, size.onChange));

    return [
      ...sizes,
      ...(opening.product === 'GRILLE' && opening.projectionKind !== 'NONE'
        ? [
            cm('projection', 'Вынос', opening.projectionCm, (projectionCm) =>
              updateOpening(opening.key, { projectionCm }),
            ),
          ]
        : []),
      ...(opening.visorServiceId === ''
        ? []
        : [
            cm(
              'visor',
              'Длина козырька',
              opening.visorLengthCm,
              (visorLengthCm) => updateOpening(opening.key, { visorLengthCm }),
            ),
          ]),
    ];
  };
  const servicePadTargets: PadTarget[] = draft.services.flatMap((line) => {
    const option = serviceOptionOf(line);

    if (option === undefined || isCountedServiceUnit(option.unit)) return [];

    return [
      {
        id: `service:${line.key}`,
        label: `${option.name}: ${option.unit === 'PER_SQUARE_METER' ? 'площадь' : 'длина'}`,
        unit: serviceUnitLabel(option.unit),
        kind: 'decimal' as const,
        value: line.quantity,
        onChange: (quantity: string) => updateService(line.key, quantity),
      },
    ];
  });
  const paymentPadTargets: PadTarget[] = [
    {
      id: 'discount',
      label: 'Скидка',
      unit: payment.discountKind === 'PERCENT' ? '%' : 'сум',
      kind: payment.discountKind === 'PERCENT' ? 'decimal' : 'money',
      value: payment.discountValue,
      onChange: (discountValue) => updatePayment({ discountValue }),
    },
    {
      id: 'prepayment',
      label: 'Предоплата',
      unit: 'сум',
      kind: 'money',
      value: payment.prepayment,
      onChange: (prepayment) => updatePayment({ prepayment }),
    },
  ];
  const padTargets: PadTarget[] =
    step === 'payment'
      ? paymentPadTargets
      : step === 'contract'
        ? []
        : selectedOpening !== null
          ? openingPadTargets(selectedOpening)
          : servicePadTargets;
  const activeIndex = padTargets.findIndex(
    (candidate) => candidate.id === activePadId,
  );
  const activeTarget = activeIndex === -1 ? null : padTargets[activeIndex];
  const nextTarget =
    activeIndex === -1 ? null : (padTargets[activeIndex + 1] ?? null);
  const isSketchDocked =
    layout === 'narrow' &&
    activeTarget !== null &&
    page.width >= DOCK_SKETCH_MIN_WIDTH;
  // Taps can arrive faster than the screen re-renders, and each one would
  // then start from the same old value and drop the digit before it.
  const pressPadKey = (key: PadKey) => {
    if (activeTarget === null) return;

    const pending = lastPadPress.current;
    const base =
      pending !== null &&
      pending.id === activeTarget.id &&
      pending.renderedValue === activeTarget.value
        ? pending.value
        : activeTarget.value;
    const value = applyPadKey(base, key, activeTarget.kind);

    lastPadPress.current = {
      id: activeTarget.id,
      renderedValue: activeTarget.value,
      value,
    };
    activeTarget.onChange(value);
  };
  const goToNextField = () => setActivePadId(nextTarget?.id ?? null);
  const padField = (
    padTarget: PadTarget,
    options: {
      isWrong?: boolean;
      isLarge?: boolean;
      placeholder?: string;
    } = {},
  ) => (
    <PadField
      key={padTarget.id}
      target={{
        ...padTarget,
        onChange: (value) => {
          lastPadPress.current = null;
          padTarget.onChange(value);
        },
      }}
      isActive={activePadId === padTarget.id}
      isWrong={options.isWrong}
      isLarge={options.isLarge}
      placeholder={options.placeholder}
      onActivate={() => setActivePadId(padTarget.id)}
      onEnter={goToNextField}
    />
  );
  const numberPad = (
    <NumberPad
      target={activeTarget}
      nextLabel={nextTarget === null ? null : nextTarget.label.toLowerCase()}
      onKey={pressPadKey}
      onNext={goToNextField}
      onDone={() => setActivePadId(null)}
    />
  );

  const goToProblem = (problem: string) => {
    if (isClientError(problem)) {
      if (target === '' && scheduledOrders.length > 0) return;

      setIsClientSheetOpen(true);

      return;
    }

    if (problem.startsWith('Услуга ')) {
      selectOpening(SERVICES_KEY);

      return;
    }

    const openingNumber = Number(/^Проём (\d+):/.exec(problem)?.[1] ?? 0);
    const opening = draft.openings[openingNumber - 1];

    if (opening === undefined) return;

    const short = shortProblem(problem);
    const targets = openingPadTargets(opening);
    const field =
      short === 'нужен вынос'
        ? targets.find((candidate) => candidate.id.endsWith(':projection'))
        : short === 'нужна длина козырька'
          ? targets.find((candidate) => candidate.id.endsWith(':visor'))
          : (targets.find((candidate) => candidate.value.trim() === '') ??
            targets[0]);

    setSelectedKey(opening.key);
    setPicker(null);
    setActivePadId(field?.id ?? null);
  };

  // The payment has its own screen, so the sizes are checked before it opens.
  const goToPayment = () => {
    setErrors(liveErrors);
    setPicker(null);

    if (liveErrors.length === 0) {
      setActivePadId(null);
      setStep('payment');

      return;
    }

    goToProblem(liveErrors[0]);
  };

  const goBackTo = (backStep: Step) => {
    if (isSaveInFlight.current) return;

    setErrors([]);
    setActivePadId(null);
    // The client signed for this sum and this prepayment.
    setSignature([]);
    setStep(backStep);
  };

  // The scheduled order already has its number; a new one gets it on saving.
  const contractData = (template: ContractTemplate) => {
    const scheduled = scheduledOrders.find((order) => order.id === target);

    return contractDataFromDraft({
      draft,
      grilles,
      visorOptions,
      serviceOptions,
      subtotal: preview.subtotal,
      discount: preview.discount,
      total: preview.total ?? 0,
      prepayment: preview.prepayment,
      number: contractNumberOf(scheduled?.name ?? null),
      signedOn: today,
      template,
    });
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
      serviceOptions,
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
          label: `${
            item.product === 'RAILING'
              ? `перилла ${formatRailingSize({ lengthCm: item.widthCm, heightCm: item.heightCm })}`
              : `${formatItemSize(item)} см`
          }, ${item.quantity} шт`,
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

    let isServiceFailed = false;

    for (const service of payload.services) {
      try {
        const { createOrderExtraService } = await client.mutation({
          createOrderExtraService: {
            __args: { data: { ...service, orderId }, upsert: true },
            id: true,
          },
        });

        if (!createOrderExtraService?.id) throw new Error('empty response');
      } catch {
        isServiceFailed = true;
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

    const orderName = await waitForOrderName(orderId).catch(() => null);
    let contract: SaveResult['contract'] = null;

    // Signed only once the order and its items are saved: the PDF's
    // спецификация is the form as the client read it.
    if (signature.length > 0 && contractTemplate !== null) {
      contract = await signContract({
        orderId,
        orderName: orderName ?? '',
        template: contractTemplate,
        data: {
          ...contractData(contractTemplate),
          number: contractNumberOf(orderName),
        },
        signature,
        signedBy:
          userId === null ? '—' : await loadSignerName(userId).catch(() => '—'),
      }).then(
        (): SaveResult['contract'] => 'signed',
        (): SaveResult['contract'] => 'failed',
      );
    }

    setResult({
      orderId,
      orderName,
      items,
      failedOpeningNumbers,
      photoFailureOpeningNumbers,
      isVisorFailed,
      isServiceFailed,
      isPaymentFailed,
      contract,
      draft,
      preview,
      areaSquareMeters: totalAreaSquareMeters,
    });
  };

  const handleSave = async () => {
    if (isSaveInFlight.current) return;

    isSaveInFlight.current = true;

    try {
      await save();
    } catch (error) {
      setErrors([
        `Сохранение не завершено. Данные формы на месте, попробуйте ещё раз. (${describeError(error)})`,
      ]);
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
    textAlign: 'center',
  });

  const primaryButton = (isFaded = false): CSSProperties => ({
    minHeight: CONTROL_HEIGHT + SPACE.sm,
    padding: `${SPACE.xs}px ${SPACE.xl}px`,
    background: isFaded ? colors.panel : colors.accent,
    border: 'none',
    borderRadius: RADIUS.control + SPACE.xs,
    color: isFaded ? colors.muted : colors.onAccent,
    font: 'inherit',
    ...TYPE.rowTitle,
    cursor: 'pointer',
    ...WRAP,
  });

  const column = (gap: number = SPACE.xl): CSSProperties => ({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap,
    alignContent: 'start',
    minWidth: 0,
  });

  const shell: CSSProperties = {
    position: 'relative',
    boxSizing: 'border-box',
    width: '100%',
    color: colors.text,
    fontFamily: 'inherit',
    ...TYPE.body,
  };

  const frame = (children: ReactNode) => (
    <div ref={page.ref} style={{ width: '100%' }}>
      <div
        style={{ ...shell, maxWidth: 860, margin: '0 auto', padding: SPACE.lg }}
      >
        {children}
      </div>
    </div>
  );

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
              {result.contract === 'signed'
                ? '✓ Замер сохранён, договор подписан, PDF в заказе'
                : '✓ Замер сохранён'}
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
              {draftClientName(result.draft) !== null && (
                <Fact
                  label="Клиент"
                  value={draftClientName(result.draft) ?? ''}
                />
              )}
              <Fact
                label="Площадь"
                value={formatQuantity(result.areaSquareMeters, 'м²')}
              />
              {result.preview.total !== null &&
                result.preview.balance !== null && (
                  <>
                    <Fact
                      label="Итого"
                      value={formatMoney(result.preview.total)}
                    />
                    <Fact
                      label="Предоплата"
                      value={formatMoney(result.preview.prepayment)}
                    />
                    <Fact
                      label="Остаток"
                      value={formatMoney(result.preview.balance)}
                    />
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
                ...(result.isServiceFailed
                  ? [
                      'Заказ создан, но не все услуги сохранены. Откройте заказ и добавьте их в «Козырьки и услуги» вручную.',
                    ]
                  : []),
                ...(result.isPaymentFailed
                  ? [
                      'Заказ сохранён, но предоплата не записана. Откройте заказ и запишите её вручную.',
                    ]
                  : []),
                ...(result.contract === 'failed'
                  ? [
                      'Заказ сохранён, но договор не записался. Откройте заказ и нажмите «Подписать договор».',
                    ]
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
                        result.draft.openings[item.openingNumber - 1]?.photos ??
                        []
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

  const clientName = draftClientName(draft);
  const clientAddress = [
    findLabel(DISTRICT_OPTIONS, draft.district),
    draft.addressLine,
  ]
    .filter((part) => part !== null && part !== '')
    .join(', ');
  const isChoosingVisit =
    step === 'measurement' && target === '' && scheduledOrders.length > 0;
  const hasClient = target !== '' || scheduledOrders.length === 0;

  const clientChip = hasClient ? (
    <button
      type="button"
      onClick={() => {
        setActivePadId(null);
        setIsClientSheetOpen(true);
      }}
      style={{
        flex: '1 1 240px',
        display: 'flex',
        alignItems: 'center',
        gap: SPACE.md,
        maxWidth: 460,
        minHeight: CONTROL_HEIGHT + SPACE.xs,
        padding: `${SPACE.xs}px ${SPACE.md}px ${SPACE.xs}px ${SPACE.xs}px`,
        background: colors.surface,
        border: `1px solid ${liveErrors.some(isClientError) && errors.some(isClientError) ? colors.danger : colors.border}`,
        borderRadius: CONTROL_HEIGHT,
        color: colors.text,
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          flex: 'none',
          display: 'grid',
          placeItems: 'center',
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: colors.accentTint,
          color: colors.accent,
          fontWeight: 700,
        }}
      >
        {initialsOf(clientName)}
      </span>
      <span style={{ display: 'grid', ...WRAP }}>
        <span style={{ fontWeight: 600 }}>{clientName ?? 'Клиент'}</span>
        <span
          style={{ ...TYPE.label, ...TABULAR_NUMBERS, color: colors.muted }}
        >
          {[
            draft.clientPhone === ''
              ? 'нет телефона'
              : `${UZBEK_PHONE_PREFIX} ${draft.clientPhone}`,
            clientAddress,
          ]
            .filter((part) => part !== '')
            .join(' · ')}
        </span>
      </span>
    </button>
  ) : null;

  const backControl = isLeaving ? (
    <span
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: SPACE.sm,
      }}
    >
      <span>Выйти без сохранения? Введённое пропадёт.</span>
      <a href={leaveHref} style={linkButton(false)}>
        Выйти
      </a>
      <Button onClick={() => setIsLeaving(false)}>Остаться</Button>
    </span>
  ) : isDirty ? (
    <Button label="Назад" onClick={() => setIsLeaving(true)}>
      ←
    </Button>
  ) : (
    <a href={leaveHref} aria-label="Назад" style={linkButton(false)}>
      ←
    </a>
  );

  const listItems = (isCard: boolean) => {
    const servicesSummary = draft.services
      .map((line) => serviceOptionOf(line)?.name ?? 'Услуга')
      .join(', ');
    const addButton = (
      <button
        key="add"
        type="button"
        onClick={addOpening}
        style={{
          flex: isCard ? '0 0 140px' : undefined,
          minHeight: isCard ? undefined : CONTROL_HEIGHT + SPACE.lg,
          margin: isCard ? 0 : SPACE.md,
          background: 'transparent',
          border: `2px dashed ${colors.border}`,
          borderRadius: RADIUS.card,
          color: colors.accent,
          font: 'inherit',
          ...TYPE.rowTitle,
          cursor: 'pointer',
        }}
      >
        + Проём
      </button>
    );

    return [
      ...draft.openings.map((opening, index) => {
        const total = openingTotal(opening);
        const size = describeSize(opening);

        return (
          <ListItem
            key={opening.key}
            badge={String(index + 1)}
            title={describeGrille(opening)}
            detail={[
              size ?? 'нет размеров',
              quantityOf(opening) > 1 ? `${opening.quantity} шт` : null,
              opening.visorServiceId === '' ? null : 'козырёк',
            ]
              .filter((part) => part !== null)
              .join(' · ')}
            amount={total === null ? '—' : formatMoney(total)}
            problem={problemOf(index + 1)}
            isSelected={opening.key === selectedKey}
            isCard={isCard}
            onClick={() => selectOpening(opening.key)}
          />
        );
      }),
      addButton,
      <ListItem
        key={SERVICES_KEY}
        badge="+"
        title={
          draft.services.length === 0
            ? 'Услуги'
            : `Услуги · ${draft.services.length}`
        }
        detail={
          servicesSummary === '' ? 'демонтаж, покраска…' : servicesSummary
        }
        amount={
          draft.services.length === 0
            ? ''
            : servicesTotal === null
              ? '—'
              : formatMoney(servicesTotal)
        }
        problem={
          liveErrors.some((error) => error.startsWith('Услуга '))
            ? 'нужно количество'
            : null
        }
        isSelected={isServicesSelected}
        isCard={isCard}
        onClick={() => selectOpening(SERVICES_KEY)}
      />,
    ];
  };

  // The strip of проёмы under the top bar when the list has no column of its own
  const openingStrip = () => (
    <div
      style={{
        display: 'flex',
        gap: SPACE.sm,
        overflowX: 'auto',
        paddingBottom: SPACE.xs,
      }}
    >
      {listItems(true)}
    </div>
  );

  const topBar = (
    <div
      ref={header.ref}
      style={{
        // A phone keeps its short screen for the fields and the pad
        position: layout === 'narrow' ? 'relative' : 'sticky',
        top: 0,
        // Above the fields that scroll under it
        zIndex: 2,
        display: 'grid',
        gap: SPACE.sm,
        padding: `${SPACE.sm}px ${SPACE.lg}px`,
        background: colors.surface,
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: SPACE.md,
        }}
      >
        {step === 'measurement' ? backControl : null}
        {isLeaving ? null : (
          <>
            <h2 style={{ margin: 0, ...TYPE.title }}>Новый замер</h2>
            {clientChip}
            <div style={{ marginLeft: 'auto' }}>
              <StepTabs step={step} onBack={goBackTo} />
            </div>
          </>
        )}
      </div>
      {layout !== 'wide' && step === 'measurement' && !isChoosingVisit
        ? openingStrip()
        : null}
    </div>
  );

  const stickyColumn = (extra: CSSProperties = {}): CSSProperties => ({
    position: 'sticky',
    top: header.height + SPACE.lg,
    maxHeight: `calc(100cqh - ${header.height + footer.height + 2 * SPACE.lg}px)`,
    overflowY: 'auto',
    ...column(SPACE.md),
    ...extra,
  });

  const openingList = (
    <nav
      aria-label="Проёмы"
      style={stickyColumn({
        gap: 0,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.card,
      })}
    >
      <div
        style={{
          padding: `${SPACE.md}px ${SPACE.md}px ${SPACE.sm}px`,
          ...TYPE.label,
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: colors.muted,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        Проёмы · {draft.openings.length}
      </div>
      {listItems(false)}
    </nav>
  );

  const sketchOf = (opening: OpeningDraft, maxWidth = SKETCH_MAX_WIDTH) => {
    const isRailing = opening.product === 'RAILING';
    const outline = isRailing ? null : openingOutline(opening);
    const visor = visorOf(opening);
    const visorLength = parseDecimalInput(opening.visorLengthCm);

    return (
      <div
        style={{
          display: 'grid',
          gap: 0,
          maxWidth,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {visor !== null ? (
          <svg
            viewBox="0 0 240 22"
            width="100%"
            role="img"
            aria-label="Козырёк над проёмом"
          >
            <path
              d="M40 18 L52 4 H188 L200 18 Z"
              fill={colors.warningTint}
              stroke={colors.warning}
              strokeWidth="1.5"
            />
            <text
              x="120"
              y="15"
              textAnchor="middle"
              fontSize="11"
              fill={colors.text}
            >
              {`козырёк ${visorLength === null ? '' : `${formatSketchCm(visorLength)} см`}`}
            </text>
          </svg>
        ) : null}
        {isRailing ? (
          <RailingSketch
            lengthCm={parseDecimalInput(opening.widthCm)}
            heightCm={parseDecimalInput(opening.heightCm)}
          />
        ) : (
          <OpeningSketch
            widthCm={parseDecimalInput(opening.widthCm)}
            heightCm={openingHeightCm(opening)}
            projectionKind={opening.projectionKind}
            projectionCm={parseDecimalInput(opening.projectionCm) ?? 0}
            shape={
              outline === null || opening.shape.kind === 'RECTANGLE'
                ? null
                : { kind: opening.shape.kind, outline }
            }
          />
        )}
      </div>
    );
  };

  const sketchPanel = (opening: OpeningDraft, sketchMaxWidth?: number) => {
    const total = openingTotal(opening);
    const runningMeters = computeOpeningRunningMeters(opening);
    const area = openingArea(opening);
    const isShaped =
      opening.product === 'GRILLE' && opening.shape.kind !== 'RECTANGLE';
    const outline =
      opening.product === 'RAILING' ? null : openingOutline(opening);
    const times = quantityOf(opening) > 1 ? ` × ${opening.quantity}` : '';

    return (
      <div
        style={{
          ...column(SPACE.sm),
          padding: SPACE.md,
          background: colors.panel,
          borderRadius: RADIUS.card,
        }}
      >
        {sketchOf(opening, sketchMaxWidth)}
        {runningMeters !== null && (
          <SummaryLine
            label="Длина"
            value={`${formatQuantity(runningMeters, 'п.м.')}${times}`}
          />
        )}
        {area !== null && (
          <SummaryLine
            label={isShaped ? 'Площадь по габариту' : 'Площадь'}
            value={`${formatQuantity(computeOpeningAreaSquareMeters(opening) ?? 0, 'м²')}${times}`}
          />
        )}
        {isShaped && outline === null && (
          <span style={{ ...TYPE.label, color: colors.muted }}>
            Эскиз и цена появятся, когда размеры сойдутся.
          </span>
        )}
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
    );
  };

  const summaryPanel = (lines: { label: string; value: string }[]) => (
    <div
      style={{
        ...column(SPACE.xs),
        padding: SPACE.md,
        background: colors.panel,
        borderRadius: RADIUS.card,
      }}
    >
      {lines.map((line) => (
        <SummaryLine key={line.label} label={line.label} value={line.value} />
      ))}
    </div>
  );

  const pairStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))',
    gap: SPACE.md,
  };

  const grilleCard = (opening: OpeningDraft) => {
    const isRailing = opening.product === 'RAILING';
    const choices = grilles.filter(
      (option) => option.product === opening.product,
    );
    const isOpen =
      picker?.openingKey === opening.key && picker.kind === 'grille';
    const quick = pickQuickOptions({
      options: choices,
      uses: usage.grilles,
      usedHereIds: draft.openings
        .filter((other) => other.key !== opening.key)
        .map((other) => other.designId),
      chosenId: opening.designId,
      limit: QUICK_GRILLE_COUNT,
    });
    const quote = computeOpeningQuote(opening, grilles);

    return (
      <EditorCard
        title={isRailing ? 'Перилла' : 'Решётка'}
        aside={quote === null ? undefined : formatMoney(quote.lineTotal)}
      >
        {isOpen && picker !== null ? (
          <GrillePicker
            grilles={choices}
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
          <>
            <TileGrid>
              {quick.map((option) => (
                <PhotoTile
                  key={option.id}
                  name={option.name}
                  photoUrl={option.photoUrl}
                  isSelected={option.id === opening.designId}
                  onSelect={() =>
                    updateOpening(opening.key, { designId: option.id })
                  }
                  caption={
                    option.pricePerSquareMeter === null
                      ? 'без цены'
                      : `${formatMoney(option.pricePerSquareMeter)} / ${isRailing ? 'п.м.' : 'м²'}`
                  }
                />
              ))}
              <OptionTile
                title={
                  isRailing ? 'Все перилла и поиск →' : 'Все решётки и поиск →'
                }
                isLink
                onClick={() =>
                  setPicker({
                    openingKey: opening.key,
                    kind: 'grille',
                    query: '',
                    grilleKind: ALL_KINDS,
                  })
                }
              />
            </TileGrid>
            {opening.designId === '' ? (
              <span style={{ ...TYPE.label, color: colors.muted }}>
                Не выбрана: цену назовёт менеджер.
              </span>
            ) : null}
          </>
        )}
      </EditorCard>
    );
  };

  const visorCard = (opening: OpeningDraft) => {
    const visor = visorOf(opening);
    const isOpen =
      picker?.openingKey === opening.key && picker.kind === 'visor';
    const quick = pickQuickOptions({
      options: visorOptions,
      uses: usage.visors,
      usedHereIds: draft.openings
        .filter((other) => other.key !== opening.key)
        .map((other) => other.visorServiceId),
      chosenId: opening.visorServiceId,
      limit: QUICK_VISOR_COUNT,
    });
    const visorTotal = computeOpeningVisorTotal(opening, visorOptions);
    const lengthTarget = openingPadTargets(opening).find((candidate) =>
      candidate.id.endsWith(':visor'),
    );

    return (
      <EditorCard
        title="Козырёк"
        aside={
          visor === null || visorTotal === null
            ? undefined
            : formatMoney(visorTotal)
        }
      >
        {isOpen && picker !== null ? (
          <VisorPicker
            visors={visorOptions}
            uses={usage.visors}
            chosenId={opening.visorServiceId}
            picker={picker}
            onPickerChange={setPicker}
            onPick={(visorServiceId) => chooseVisor(opening, visorServiceId)}
          />
        ) : (
          <TileGrid>
            <OptionTile
              title="Не нужен"
              isSelected={!opening.isVisorWanted}
              onClick={() => dropVisor(opening)}
            />
            {quick.map((option) => (
              <OptionTile
                key={option.id}
                title={option.name}
                subtitle={
                  option.price === null
                    ? 'без цены'
                    : `${formatMoney(option.price)} / п.м.`
                }
                isSelected={option.id === opening.visorServiceId}
                onClick={() => chooseVisor(opening, option.id)}
              />
            ))}
            <OptionTile
              title="Все козырьки →"
              isLink
              onClick={() =>
                setPicker({
                  openingKey: opening.key,
                  kind: 'visor',
                  query: '',
                  grilleKind: ALL_KINDS,
                })
              }
            />
          </TileGrid>
        )}
        {lengthTarget !== undefined ? (
          <div style={pairStyle}>
            {padField(lengthTarget, {
              isWrong: errorsOf(errors, selectedIndex + 1).some((error) =>
                error.includes('длину козырька'),
              ),
            })}
            <span
              style={{
                ...TYPE.label,
                color: colors.muted,
                alignSelf: 'center',
              }}
            >
              Сначала равна ширине проёма, можно изменить.
            </span>
          </div>
        ) : null}
        {isVisorOnlyOpening(opening) ? (
          <span style={{ ...TYPE.label, color: colors.muted }}>
            Без ширины и высоты сохранится только козырёк, без решётки.
          </span>
        ) : null}
      </EditorCard>
    );
  };

  const photosCard = (opening: OpeningDraft, openingNumber: number) => (
    <EditorCard title="Фото и заметки">
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
    </EditorCard>
  );

  const openingEditor = (opening: OpeningDraft, index: number) => {
    const openingNumber = index + 1;
    const ownErrors = errorsOf(errors, openingNumber);
    const isRailing = opening.product === 'RAILING';
    const targets = openingPadTargets(opening);
    const targetOf = (suffix: string) =>
      targets.find((candidate) => candidate.id === `${opening.key}:${suffix}`);
    const isSizeWrong = ownErrors.some(
      (error) => !error.includes('козыр') && !error.includes('вынос'),
    );
    const sizeField = (suffix: string) => {
      const sizeTarget = targetOf(suffix);

      return sizeTarget === undefined
        ? null
        : padField(sizeTarget, {
            isWrong: isSizeWrong && sizeTarget.value.trim() === '',
            placeholder: suffix === 'center' ? 'нет' : '—',
          });
    };
    const projectionTarget = targetOf('projection');
    const previous = draft.openings[index - 1];
    const next = draft.openings[index + 1];
    const navButton: CSSProperties = {
      minWidth: CONTROL_HEIGHT,
      minHeight: CONTROL_HEIGHT,
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: RADIUS.control,
      color: colors.text,
      font: 'inherit',
      fontSize: '20px',
      cursor: 'pointer',
    };

    return (
      <div style={column(SPACE.lg)}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: SPACE.sm,
          }}
        >
          <button
            type="button"
            aria-label="Предыдущий проём"
            disabled={previous === undefined}
            style={{ ...navButton, opacity: previous === undefined ? 0.4 : 1 }}
            onClick={() => previous && selectOpening(previous.key)}
          >
            ‹
          </button>
          <h3 style={{ margin: 0, flex: '1 1 auto', ...TYPE.title }}>
            Проём {openingNumber}
          </h3>
          <Button onClick={() => duplicateOpening(opening)}>Копировать</Button>
          {draft.openings.length > 1 ? (
            <button
              type="button"
              style={{
                ...linkButton(false),
                border: 'none',
                color: colors.danger,
              }}
              onClick={() => removeOpening(opening.key)}
            >
              Удалить
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Следующий проём"
            disabled={next === undefined}
            style={{ ...navButton, opacity: next === undefined ? 0.4 : 1 }}
            onClick={() => next && selectOpening(next.key)}
          >
            ›
          </button>
        </div>
        {copiedNotice?.openingKey === opening.key ? (
          <div
            role="status"
            style={{
              padding: `${SPACE.sm}px ${SPACE.md}px`,
              background: colors.accentTint,
              borderRadius: RADIUS.control,
              ...TYPE.label,
              ...WRAP,
            }}
          >
            Решётка, вынос и козырёк взяты из проёма {copiedNotice.fromNumber}.
            Размеры введите заново.
          </div>
        ) : null}
        {layout === 'narrow' && !isSketchDocked ? sketchPanel(opening) : null}
        <EditorCard title="Размеры">
          <div style={{ maxWidth: 400 }}>
            <Segmented
              label="Изделие"
              value={opening.product}
              options={[
                { value: 'GRILLE', label: 'Решётка' },
                { value: 'RAILING', label: 'Перилла' },
              ]}
              onChange={(product) => changeProduct(opening, product)}
            />
          </div>
          {isRailing ? (
            <div style={pairStyle}>
              {sizeField('width')}
              {sizeField('height')}
            </div>
          ) : (
            <ShapeFields
              shape={opening.shape}
              widthCm={opening.widthCm}
              heightCm={opening.heightCm}
              nextKey={createShapePointKey}
              liveErrors={liveShapeErrors(opening)}
              onShapeChange={(shape) => updateOpening(opening.key, { shape })}
              onWidthChange={(widthCm) => changeWidth(opening.key, widthCm)}
              onHeightChange={(heightCm) =>
                updateOpening(opening.key, { heightCm })
              }
              renderSize={(size) => sizeField(size.id)}
            />
          )}
          {isRailing ? null : (
            <div style={column(SPACE.sm)}>
              <FieldLabel>Вынос</FieldLabel>
              <Segmented
                label="Вынос"
                value={opening.projectionKind}
                stackBelowPx={300}
                options={PROJECTION_KIND_OPTIONS.map(({ value, label }) => ({
                  value: value as ProjectionKind,
                  label: label
                    .replace('Вынос ', '')
                    .replace(/^./, (letter) => letter.toUpperCase()),
                }))}
                onChange={(projectionKind) => {
                  updateOpening(opening.key, { projectionKind });
                  setActivePadId(
                    projectionKind === 'NONE'
                      ? null
                      : `${opening.key}:projection`,
                  );
                }}
              />
              {projectionTarget !== undefined ? (
                <div style={pairStyle}>
                  {padField(projectionTarget, {
                    isWrong: ownErrors.some((error) => error.includes('вынос')),
                  })}
                  <span
                    style={{
                      ...TYPE.label,
                      color: colors.muted,
                      alignSelf: 'center',
                    }}
                  >
                    Насколько решётка выходит за проём с каждой стороны. Площадь
                    считается с выносом.
                  </span>
                </div>
              ) : null}
            </div>
          )}
          <QuantityStepper
            label="Одинаковых"
            value={opening.quantity}
            onChange={(quantity) => updateOpening(opening.key, { quantity })}
          />
        </EditorCard>
        {grilleCard(opening)}
        {isRailing ? null : visorCard(opening)}
        {photosCard(opening, openingNumber)}
        <ErrorList errors={ownErrors} />
      </div>
    );
  };

  const serviceErrors = errors.filter((error) => error.startsWith('Услуга '));
  const servicesEditor = (
    <div style={column(SPACE.lg)}>
      <h3 style={{ margin: 0, ...TYPE.title }}>Услуги</h3>
      <EditorCard
        title="Из Цены → Услуги"
        aside={
          draft.services.length === 0 || servicesTotal === null
            ? undefined
            : formatMoney(servicesTotal)
        }
      >
        {serviceOptions.length === 0 ? (
          <span style={{ color: colors.muted }}>
            В «Ценах» пока нет услуг. Их добавляет владелец: Цены → Услуги.
          </span>
        ) : (
          <div style={column(SPACE.xs)}>
            <Field label="Добавить услугу">
              <SelectInput
                label="Добавить услугу"
                value=""
                options={[
                  { value: '', label: 'Выберите услугу' },
                  ...serviceOptions.map((option) => ({
                    value: option.id,
                    label:
                      option.price === null
                        ? `${option.name} · цена не задана`
                        : `${option.name} · ${formatMoney(option.price)} ${serviceUnitText(option.unit)}`,
                  })),
                ]}
                onChange={addService}
              />
            </Field>
            <span style={{ ...TYPE.label, color: colors.muted }}>
              Одну услугу можно добавить несколько раз, например покраску
              отдельно для решёток и для перил. У каждой строки свой счёт.
            </span>
          </div>
        )}
        {draft.services.map((line) => {
          const option = serviceOptionOf(line);
          const unit = option?.unit ?? 'FIXED';
          const lineTotal = computeServiceLineTotal(
            line,
            serviceOptions,
            totalAreaSquareMeters,
          );
          const name = option?.name ?? 'Услуга';
          const lineTarget = servicePadTargets.find(
            (candidate) => candidate.id === `service:${line.key}`,
          );

          return (
            <div
              key={line.key}
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
                alignItems: 'center',
                gap: SPACE.md,
                paddingTop: SPACE.md,
                borderTop: `1px solid ${colors.border}`,
              }}
            >
              <span style={{ display: 'grid', ...WRAP }}>
                <span style={{ fontWeight: 600 }}>{name}</span>
                <span style={{ ...TYPE.label, color: colors.muted }}>
                  {option?.price == null
                    ? 'цена не задана · назовёт менеджер'
                    : `${formatMoney(option.price)} ${serviceUnitText(unit)}`}
                </span>
              </span>
              {lineTarget === undefined ? (
                <QuantityStepper
                  label="Количество"
                  value={line.quantity === '' ? '1' : line.quantity}
                  onChange={(quantity) => updateService(line.key, quantity)}
                />
              ) : (
                padField(
                  {
                    ...lineTarget,
                    label:
                      unit === 'PER_SQUARE_METER' && line.quantity === ''
                        ? 'Площадь, как у проёмов'
                        : unit === 'PER_SQUARE_METER'
                          ? 'Площадь'
                          : 'Длина',
                  },
                  {
                    isLarge: false,
                    isWrong: serviceErrors.some((error) =>
                      error.includes(`«${name}»`),
                    ),
                    placeholder:
                      unit === 'PER_SQUARE_METER'
                        ? formatQuantity(totalAreaSquareMeters, '').trim()
                        : '—',
                  },
                )
              )}
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: SPACE.sm,
                  ...TABULAR_NUMBERS,
                }}
              >
                <strong>
                  {lineTotal === null ? '—' : formatMoney(lineTotal)}
                </strong>
                <Button
                  label={`Убрать услугу «${name}»`}
                  onClick={() => removeService(line.key)}
                >
                  ×
                </Button>
              </span>
            </div>
          );
        })}
        <ErrorList errors={serviceErrors} />
      </EditorCard>
    </div>
  );

  const totalText =
    draftTotal === null ? 'Цену назовёт менеджер' : formatMoney(draftTotal);
  const firstProblem = liveErrors[0];

  const bottomBar = (content: ReactNode, dock: ReactNode = null) => (
    <div
      ref={footer.ref}
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 2,
        background: colors.surface,
        borderTop: `1px solid ${colors.border}`,
      }}
    >
      {dock}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: SPACE.md,
          padding: `${SPACE.md}px ${SPACE.lg}px`,
        }}
      >
        {content}
      </div>
    </div>
  );

  const totalBlock = (amount: string, detail: string) => (
    <span style={{ flex: '1 1 200px', display: 'grid', ...WRAP }}>
      <span style={{ ...TYPE.title, ...TABULAR_NUMBERS }}>{amount}</span>
      <span style={{ ...TYPE.label, ...TABULAR_NUMBERS, color: colors.muted }}>
        {detail}
      </span>
    </span>
  );

  // On a phone the pad is docked over the bottom bar while a number is typed.
  const padDock = (sketch: ReactNode) =>
    layout === 'narrow' && activeTarget !== null ? (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            sketch !== null && page.width >= DOCK_SKETCH_MIN_WIDTH
              ? 'minmax(0, 1fr) minmax(0, 1fr)'
              : 'minmax(0, 1fr)',
          alignItems: 'start',
          gap: SPACE.md,
          padding: `${SPACE.md}px ${SPACE.lg}px 0`,
        }}
      >
        {page.width >= DOCK_SKETCH_MIN_WIDTH ? sketch : null}
        {numberPad}
      </div>
    ) : null;

  const page3 = (columns: {
    list?: ReactNode;
    // The receipt reads lines of text, so it shares the width with the form
    isListWide?: boolean;
    main: ReactNode;
    tool: ReactNode;
  }) => {
    const listTrack =
      columns.list === undefined
        ? ''
        : columns.isListWide === true
          ? 'minmax(0, 1fr) '
          : `${LIST_WIDTH[room]}px `;
    const gridTemplateColumns =
      layout === 'wide'
        ? `${listTrack}minmax(0, 1fr) ${TOOL_WIDTH[room]}px`
        : layout === 'medium'
          ? `minmax(0, 1fr) ${TOOL_WIDTH.tight}px`
          : 'minmax(0, 1fr)';

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns,
          gap: SPACE.lg,
          alignItems: 'start',
          padding: SPACE.lg,
        }}
      >
        {layout === 'wide' && columns.list !== undefined ? columns.list : null}
        {columns.main}
        {layout === 'narrow' ? null : (
          <aside style={stickyColumn()}>{columns.tool}</aside>
        )}
      </div>
    );
  };

  const clientSheet = isClientSheetOpen ? (
    <ClientSheet
      draft={draft}
      isNew={target === NEW_CLIENT_TARGET}
      match={clientMatch}
      phoneError={errors.find((error) => error.includes('телефон')) ?? null}
      canChooseOther={scheduledOrders.length > 0 && openedFromOrderId === null}
      onChange={changeClient}
      onTakeMatch={takeClientMatch}
      onClose={() => setIsClientSheetOpen(false)}
      onDone={() => {
        setIsClientSheetOpen(false);
        startMeasuring();

        setErrors((current) =>
          current.filter((error) => !isClientError(error)),
        );
      }}
      onOtherClient={chooseOtherClient}
    />
  ) : null;

  if (step === 'contract' && contractTemplate !== null) {
    const data = contractData(contractTemplate);

    return (
      <div ref={page.ref} style={shell}>
        {topBar}
        <div style={{ padding: SPACE.lg }}>
          <ContractSigning
            document={buildContractDocument(contractTemplate, data)}
            data={data}
            blockers={missingClientDetails(data)}
            warnings={missingCompanyDetails(contractTemplate)}
            signature={signature}
            onSignatureChange={changeSignature}
          >
            <ErrorList errors={errors} />
            <span style={{ ...TYPE.label, color: colors.muted, ...WRAP }}>
              Передайте планшет клиенту. Заказ, оплата и подписанный PDF
              сохранятся одним нажатием внизу.
            </span>
          </ContractSigning>
        </div>
        {bottomBar(
          <>
            {isSaving ? null : (
              <Button onClick={() => goBackTo('payment')}>← К оплате</Button>
            )}
            {totalBlock(
              formatMoney(preview.total ?? 0),
              `предоплата ${formatMoney(preview.prepayment)}`,
            )}
            <button
              type="button"
              disabled={signature.length === 0}
              style={{
                ...primaryButton(signature.length === 0),
                opacity: isSaving ? 0.6 : 1,
              }}
              aria-busy={isSaving}
              onClick={handleSave}
            >
              {isSaving ? 'Сохранение…' : 'Подписать и сохранить'}
            </button>
          </>,
        )}
      </div>
    );
  }

  if (step === 'payment') {
    const isPriced =
      preview.subtotal !== null &&
      preview.total !== null &&
      preview.balance !== null;
    const isContractReady = contractTemplate !== null && preview.total !== null;
    const receipt = (
      <EditorCard
        title="Что заказано"
        aside={
          isSaving ? undefined : (
            <Button variant="link" onClick={() => goBackTo('measurement')}>
              Изменить
            </Button>
          )
        }
      >
        <div style={column(0)}>
          {draft.openings.flatMap((opening, index) => {
            const quote = computeOpeningQuote(opening, grilles);
            const visor = visorOf(opening);
            const visorTotal = computeOpeningVisorTotal(opening, visorOptions);
            const lines: ReactNode[] = [];

            if (!isVisorOnlyOpening(opening)) {
              lines.push(
                <ReceiptLine
                  key={opening.key}
                  title={`Проём ${index + 1} · ${describeGrille(opening)}`}
                  detail={`${describeSize(opening) ?? ''}${quantityOf(opening) > 1 ? `, ${opening.quantity} шт` : ''}${opening.product === 'RAILING' ? '' : ` · ${formatQuantity(openingArea(opening) ?? 0, 'м²')}`}`}
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
          {draft.services.map((line) => {
            const lineTotal = computeServiceLineTotal(
              line,
              serviceOptions,
              totalAreaSquareMeters,
            );

            return (
              <ReceiptLine
                key={line.key}
                title={serviceOptionOf(line)?.name ?? 'Услуга'}
                detail={describeServiceLine(line)}
                amount={lineTotal === null ? '—' : formatMoney(lineTotal)}
              />
            );
          })}
          <div style={{ paddingTop: SPACE.md }}>
            <SummaryLine
              label="Сумма"
              value={
                preview.subtotal === null ? '—' : formatMoney(preview.subtotal)
              }
              isTotal
            />
          </div>
        </div>
      </EditorCard>
    );
    const discountTarget = paymentPadTargets[0];
    const prepaymentTarget = paymentPadTargets[1];
    const prepaymentShareOf = (share: number) =>
      share === 0 ? '' : formatWhole(Math.round((preview.total ?? 0) * share));
    const paymentForm = !isPriced ? (
      <EditorCard title="Оплата">
        <span style={TYPE.rowTitle}>Цену назовёт менеджер</span>
        <span style={{ color: colors.muted }}>
          В заказе есть решётка, козырёк или услуга без цены, поэтому скидку и
          предоплату менеджер внесёт сам.
        </span>
      </EditorCard>
    ) : (
      <EditorCard title="Оплата">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
            gap: SPACE.sm,
            alignItems: 'stretch',
          }}
        >
          {padField(discountTarget, {
            isWrong: preview.errors.discountValue !== undefined,
            placeholder: '0',
          })}
          <Segmented
            label="Скидка в"
            value={payment.discountKind}
            options={DISCOUNT_KIND_OPTIONS.map(({ value, label }) => ({
              value: value as DiscountKind,
              label,
            }))}
            onChange={(discountKind) =>
              // A value typed in one unit means nothing in the other
              updatePayment({ discountKind, discountValue: '' })
            }
          />
        </div>
        {preview.errors.discountValue ? (
          <span style={{ color: colors.danger }}>
            {preview.errors.discountValue}
          </span>
        ) : null}
        <div style={column(SPACE.xs)}>
          <SummaryLine
            label="Итого"
            value={formatMoney(preview.total ?? 0)}
            isTotal
          />
          {preview.discount > 0 ? (
            <span
              style={{ ...TYPE.label, ...TABULAR_NUMBERS, color: colors.muted }}
            >
              скидка −{formatMoney(preview.discount)}
            </span>
          ) : null}
        </div>
        {padField(prepaymentTarget, {
          isWrong: preview.errors.prepayment !== undefined,
          placeholder: '0',
        })}
        {preview.errors.prepayment ? (
          <span style={{ color: colors.danger }}>
            {preview.errors.prepayment}
          </span>
        ) : null}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 96px), 1fr))',
            gap: SPACE.sm,
          }}
        >
          {PREPAYMENT_SHARES.map(({ label, share }) => (
            <QuickButton
              key={label}
              label={label}
              isChosen={payment.prepayment === prepaymentShareOf(share)}
              onClick={() =>
                updatePayment({ prepayment: prepaymentShareOf(share) })
              }
            />
          ))}
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
        <BigNumber
          label="Остаток после предоплаты"
          value={formatMoney(preview.balance ?? 0)}
        />
        <span style={{ ...TYPE.label, color: colors.muted }}>
          Без договора заказ сохранится со статусом «Не подписан»; подписать
          можно позже из заказа.
        </span>
      </EditorCard>
    );
    const paymentSummary = summaryPanel([
      {
        label: 'Сумма',
        value: preview.subtotal === null ? '—' : formatMoney(preview.subtotal),
      },
      ...(preview.discount > 0
        ? [{ label: 'Скидка', value: `−${formatMoney(preview.discount)}` }]
        : []),
      { label: 'Итого', value: formatMoney(preview.total ?? 0) },
      { label: 'Остаток', value: formatMoney(preview.balance ?? 0) },
    ]);
    const goToContract = () => {
      if (Object.keys(preview.errors).length > 0) {
        setErrors(['Сначала исправьте скидку или предоплату.']);

        return;
      }

      setErrors([]);
      setActivePadId(null);
      setSignature([]);
      setStep('contract');
    };

    return (
      <div ref={page.ref} style={shell}>
        {topBar}
        {page3({
          list: <div style={column(SPACE.lg)}>{receipt}</div>,
          isListWide: true,
          main:
            layout === 'wide' ? (
              paymentForm
            ) : (
              <div style={column(SPACE.lg)}>
                {paymentForm}
                {receipt}
              </div>
            ),
          tool: isPriced ? (
            <>
              {paymentSummary}
              {numberPad}
            </>
          ) : (
            paymentSummary
          ),
        })}
        {bottomBar(
          <>
            {isSaving ? null : (
              <Button onClick={() => goBackTo('measurement')}>
                ← К замеру
              </Button>
            )}
            {totalBlock(
              preview.total === null ? totalText : formatMoney(preview.total),
              preview.balance === null
                ? ''
                : `остаток ${formatMoney(preview.balance)}`,
            )}
            <ErrorList errors={errors} />
            <Button
              isBusy={isSaving}
              busyText="Сохранение…"
              onClick={handleSave}
            >
              Сохранить без договора
            </Button>
            {isContractReady ? (
              <button
                type="button"
                style={primaryButton()}
                onClick={goToContract}
              >
                Далее: договор →
              </button>
            ) : (
              <span style={{ ...TYPE.label, color: colors.muted, ...WRAP }}>
                {preview.total === null
                  ? 'Договор подпишет менеджер, когда у заказа будет цена.'
                  : 'Договор загружается…'}
              </span>
            )}
          </>,
          padDock(paymentSummary),
        )}
      </div>
    );
  }

  if (isChoosingVisit) {
    return (
      <div ref={page.ref} style={shell}>
        {topBar}
        <div style={{ padding: SPACE.lg, maxWidth: 1180, margin: '0 auto' }}>
          {loadError !== null ? <ErrorList errors={[loadError]} /> : null}
          <VisitChooser
            visits={scheduledOrders.map((order) => ({
              id: order.id,
              when:
                describeMeasurementTime(order.measurementDate, today) ??
                'Без даты',
              title: joinFullName(order.clientFullName) ?? order.name,
              address: [
                findLabel(DISTRICT_OPTIONS, order.district ?? ''),
                order.addressLine,
                order.floor === null ? null : `${order.floor} эт.`,
              ]
                .filter((part) => part !== null && part !== '')
                .join(', '),
              phone:
                order.clientPhone === null
                  ? ''
                  : `${UZBEK_PHONE_PREFIX} ${formatUzbekNationalPhone(order.clientPhone)}`,
            }))}
            isLoading={measurerId === null && loadError === null}
            onPick={pickVisit}
            onNewClient={startNewClient}
          />
        </div>
        {clientSheet}
      </div>
    );
  }

  const otherErrors = errors.filter(
    (error) => !/^Проём \d+:/.test(error) && !error.startsWith('Услуга '),
  );
  // The pad must stay whole beside the sketch on a short landscape tablet, so
  // the sketch gives up height first.
  const toolSketchWidth =
    screen.height === 0
      ? SKETCH_MAX_WIDTH
      : Math.max(
          SKETCH_MIN_WIDTH,
          Math.min(
            SKETCH_MAX_WIDTH,
            ((screen.height -
              header.height -
              footer.height -
              2 * SPACE.lg -
              PAD_AND_SUMMARY_HEIGHT_PX) *
              SKETCH_WIDTH) /
              SKETCH_HEIGHT,
          ),
        );

  const measurementTool =
    selectedOpening !== null
      ? sketchPanel(selectedOpening, toolSketchWidth)
      : summaryPanel([
          {
            label: 'Площадь всех проёмов',
            value: formatQuantity(totalAreaSquareMeters, 'м²'),
          },
          {
            label: 'Услуги',
            value: servicesTotal === null ? '—' : formatMoney(servicesTotal),
          },
        ]);

  return (
    <div ref={page.ref} style={shell}>
      <div
        ref={screen.ref}
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 0,
          height: '100cqh',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      />
      {topBar}
      {loadError !== null ? (
        <div style={{ padding: `${SPACE.lg}px ${SPACE.lg}px 0` }}>
          <ErrorList errors={[loadError]} />
        </div>
      ) : null}
      {page3({
        list: openingList,
        main: (
          <div style={column(SPACE.lg)}>
            {selectedOpening !== null
              ? openingEditor(selectedOpening, selectedIndex)
              : servicesEditor}
            <ErrorList errors={otherErrors} />
          </div>
        ),
        tool: (
          <>
            {measurementTool}
            {numberPad}
          </>
        ),
      })}
      {bottomBar(
        <>
          {totalBlock(
            totalText,
            [
              countOpenings(draft.openings.length),
              formatQuantity(totalAreaSquareMeters, 'м²'),
              draft.services.length === 0 || servicesTotal === null
                ? null
                : `услуги ${formatMoney(servicesTotal)}`,
            ]
              .filter((part) => part !== null)
              .join(' · '),
          )}
          {firstProblem === undefined ? null : (
            <button
              type="button"
              onClick={() => goToProblem(firstProblem)}
              style={{
                flex: '0 1 auto',
                minHeight: CONTROL_HEIGHT + SPACE.sm,
                padding: `${SPACE.xs}px ${SPACE.lg}px`,
                background: colors.dangerTint,
                border: 'none',
                borderRadius: RADIUS.control + SPACE.xs,
                color: colors.danger,
                font: 'inherit',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer',
                ...WRAP,
              }}
            >
              {/^Проём \d+:/.test(firstProblem)
                ? `${firstProblem.split(':')[0]}: ${shortProblem(firstProblem)} →`
                : `${firstProblem} →`}
            </button>
          )}
          <button
            type="button"
            style={primaryButton(firstProblem !== undefined)}
            onClick={goToPayment}
          >
            Далее: оплата →
          </button>
        </>,
        padDock(selectedOpening === null ? null : sketchOf(selectedOpening)),
      )}
      {clientSheet}
    </div>
  );
};
