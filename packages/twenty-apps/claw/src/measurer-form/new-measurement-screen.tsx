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
  PROJECTION_SIDE_OPTIONS,
  type Product,
  type ProjectionKind,
  type ProjectionSide,
  SOURCE_OPTIONS,
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
import { ClientFields } from 'src/measurer-form/client-fields';
import {
  ALL_KINDS,
  GrillePicker,
  PhotoRow,
  PhotoThumbnail,
  type Picker,
  QuickButton,
  ReceiptLine,
  type Step,
  STEPS,
  thumbnailBox,
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
  withCashHolder,
} from 'src/measurer-form/measurer-form';
import {
  DisclosureRow,
  ErrorList,
  Fact,
  FieldLabel,
  FilterChips,
  NoteBox,
  OpeningSketch,
  QuantityStepper,
  RailingSketch,
  RailItem,
  Segmented,
  SettingRow,
  type SignatureStroke,
  StepTrail,
  SummaryLine,
  TextArea,
  useElementHeight,
  useElementWidth,
} from 'src/measurer-form/measurer-form-ui';
import { countUses, sortByName } from 'src/measurer-form/option-search';
import { ShapeFields } from 'src/measurer-form/shape-fields';
import {
  shapeKindLabel,
  buildShapeOutline,
} from 'src/opening-shape/opening-shape';
import { formatSketchCm } from 'src/opening-shape/sketch-layout';
import {
  describeProjectionSide,
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
  SelectInput,
  TextInput,
  Thumbnail,
  usePalette,
} from 'src/ui/kit';
import {
  COLUMNS_MIN_WIDTH,
  CONTROL_HEIGHT,
  RADIUS,
  SPACE,
  TABULAR_NUMBERS,
  TYPE,
} from 'src/ui/tokens';
import { joinFullName, trimFullName } from 'src/utils/full-name';
import { fetchFieldMetadataId } from 'src/utils/fetch-field-metadata-id';
import { createThumbnailUrl } from 'src/utils/photo-thumbnail';
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

const ORDER_NAME_POLL_ATTEMPTS = 20;
const ORDER_NAME_POLL_INTERVAL_MS = 750;
const USAGE_SAMPLE_SIZE = 500;
// A list beside its pane from this page width (a tablet held upright)
const TWO_PANE_MIN_WIDTH = 720;
// The sketch beside the проём's sizes from this page width (a tablet on its
// side beside Twenty's menu)
const SKETCH_BESIDE_MIN_WIDTH = 920;
const SKETCH_MAX_WIDTH = 300;
const SKETCH_PANEL_WIDTH = 280;
const VISITS_WIDTH = 288;
const RAIL_WIDTH = 232;
const CLIENT_MAX_WIDTH = 760;
const RESULT_MAX_WIDTH = 760;
const STEP_SETTLE_POLL_MS = 30;
const STEP_SETTLE_MAX_MS = 600;
const CONTRACT_NEEDS = 'Для договора укажите';
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
    grilles: (designs?.edges ?? []).map(
      ({ node }): GrilleOption => ({
        id: node.id,
        product: toProduct(node.product),
        name: node.name ?? '',
        kindName: node.grilleKind?.name ?? null,
        photoUrl: node.photos?.[0]?.url ?? null,
        pricePerSquareMeter: fromCurrency(node.pricePerSquareMeter),
      }),
    ),
    visorOptions: sortByName<VisorOption>(
      services
        .filter((node) => node.kind === 'VISOR')
        .map(
          (node): VisorOption => ({
            id: node.id,
            name: node.name ?? '',
            price: fromCurrency(node.price),
          }),
        ),
    ),
    // Every service in Цены → Услуги, whatever is added there later.
    serviceOptions: sortByName<ServiceOption>(
      services
        .filter((node) => node.kind !== 'VISOR')
        .map(
          (node): ServiceOption => ({
            id: node.id,
            name: node.name ?? '',
            unit: (node.unit ?? null) as ExtraServiceUnit | null,
            price: fromCurrency(node.price),
          }),
        ),
    ),
  };
};

// How often each grille went into recent orders, for «Часто берут». Without
// it the catalogue still lists everything by name.
const loadGrilleUses = async (): Promise<Map<string, number>> => {
  const { orderItems } = await new CoreApiClient().query({
    orderItems: {
      __args: {
        first: USAGE_SAMPLE_SIZE,
        orderBy: [{ createdAt: 'DescNullsLast' }],
      },
      edges: { node: { designId: true } },
    },
  });

  return countUses(
    (orderItems?.edges ?? []).map(({ node }) => node.designId ?? null),
  );
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

// Asked of the app's own functions, which run as the application: a measurer
// may read only their own orders and no workers.
const askFunction = async (path: string): Promise<Record<string, unknown>> => {
  const request = () =>
    fetch(
      `${process.env.TWENTY_FUNCTIONS_URL ?? `${process.env.TWENTY_API_URL}/s`}/${path}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.TWENTY_APP_ACCESS_TOKEN}`,
        },
      },
    );
  let response = await request();

  // The token lasts half an hour and only an API call renews it; a measurer
  // may spend longer than that at one address. The route answers an expired
  // token with a 500, not a 401.
  if (!response.ok) {
    await new CoreApiClient().query({
      orders: { __args: { first: 1 }, edges: { node: { id: true } } },
    });
    response = await request();
  }

  if (!response.ok) throw new Error(`${path}: ${response.status}`);

  return (await response.json()) as Record<string, unknown>;
};

const loadNextOrderName = async (): Promise<string | null> => {
  const { name } = await askFunction('next-order-number');

  return typeof name === 'string' && name !== '' ? name : null;
};

const loadOwnWorkerId = async (): Promise<string | null> => {
  const { workerId } = await askFunction('my-worker');

  return typeof workerId === 'string' && workerId !== '' ? workerId : null;
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

  const projection = {
    projectionCm:
      opening.projectionKind === 'NONE'
        ? 0
        : (parseDecimalInput(opening.projectionCm) ?? 0),
    projectionKind: opening.projectionKind,
    projectionSide:
      opening.projectionSide === '' ? null : opening.projectionSide,
  };
  const size = formatItemSize({ widthCm, heightCm, ...projection });

  return [
    opening.shape.kind === 'RECTANGLE'
      ? size
      : `${shapeKindLabel(opening.shape.kind).toLowerCase()} ${size}`,
    describeProjectionSide(projection),
  ]
    .filter(Boolean)
    .join(', ');
};

// Only contradictions while typing: «укажите …» for a field not reached yet
// would mark the проём wrong before the measurer is done.
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

// Short enough for the line of the проём in the list
const shortProblem = (error: string): string => {
  const text = error.replace(/^Проём \d+: /, '');

  if (text.includes('длину козырька')) return 'нужна длина козырька';
  if (text.includes('выберите козырёк')) return 'выберите козырёк';
  if (text.startsWith('укажите вынос')) return 'нужен вынос';
  if (text.includes('снаружи или изнутри'))
    return 'установка снаружи или изнутри?';
  if (text.includes('количество')) return 'проверьте количество';
  if (/укажите|ширин|высот|размер/.test(text)) return 'нужны размеры';

  return text;
};

// A проём's or a service's own line may carry these words: «Подъём на этаж»
const isClientError = (error: string) =>
  !/^(Проём \d+:|Услуга )/.test(error) &&
  /телефон|Этаж|дату замера|чей это замер/i.test(error);

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
  const [grilleUses, setGrilleUses] = useState<Map<string, number>>(
    () => new Map(),
  );
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
  const [step, setStep] = useState<Step>('client');
  const [signature, setSignature] = useState<SignatureStroke[]>([]);
  // The number a new order will most likely get, shown on its contract
  // before saving; the signed PDF takes the number it really got.
  const [nextOrderName, setNextOrderName] = useState<string | null>(null);
  const [contractTemplate, setContractTemplate] =
    useState<ContractTemplate | null>(null);
  // The order whose card opened the form: «Назад» returns there
  const [openedFromOrderId, setOpenedFromOrderId] = useState<string | null>(
    null,
  );
  const [isLeaving, setIsLeaving] = useState(false);
  // A booked client is shown as a card until the measurer corrects them
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [clientMatch, setClientMatch] = useState<ClientMatch | null>(null);
  // The проём in the editor, or SERVICES_KEY for «Услуги»
  const [selectedKey, setSelectedKey] = useState<string>(
    () => draft.openings[0]?.key ?? SERVICES_KEY,
  );
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isExtrasOpen, setIsExtrasOpen] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState<{
    openingKey: string;
    fromNumber: number;
  } | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const view = picker === null ? step : 'design';
  const [shownView, setShownView] = useState<string>(view);

  // The page cannot be scrolled from code. A step drawn empty is no taller
  // than the screen, so the host drops the scroll of the step before; the
  // next one is drawn once the host has shown the empty one
  useEffect(() => {
    if (shownView === view) return;

    const startedAt = Date.now();
    const heightOf = (element: HTMLDivElement | null) =>
      element?.getBoundingClientRect().height ?? 0;
    const timer = setInterval(() => {
      if (
        heightOf(page.ref.current) <= heightOf(screen.ref.current) + 1 ||
        Date.now() - startedAt > STEP_SETTLE_MAX_MS
      ) {
        setShownView(view);
      }
    }, STEP_SETTLE_POLL_MS);

    return () => clearInterval(timer);
  }, [view, shownView, page.ref, screen.ref]);
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
        }
      })
      .catch((error: unknown) =>
        setLoadError(`Не удалось загрузить форму: ${describeError(error)}`),
      );

    loadGrilleUses()
      .then(setGrilleUses)
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

  // What was open inside the pane belongs to the проём that was in it.
  const selectOpening = (key: string) => {
    setSelectedKey(key);
    setPicker(null);
    setIsMenuOpen(false);
    setIsExtrasOpen(false);
  };

  // The next window is usually of the same build: what it is made of carries
  // over, the sizes start empty.
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
    selectOpening(opening.key);
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

    setDraft((current) => ({
      ...current,
      services: [
        ...current.services,
        { key: randomUuid(), serviceId, quantity: '' },
      ],
    }));
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

  const pickVisit = (orderId: string) => {
    const order = scheduledOrders.find((candidate) => candidate.id === orderId);

    // Tapping the visit already chosen must not undo what was corrected in it
    if (order === undefined || order.id === target) return;

    setTarget(order.id);
    setClientMatch(null);
    lookedUpPhone.current = null;
    setIsEditingClient(false);
    setErrors([]);
    // A visit without a date takes now, not the date of the one picked before
    updateDraft({
      measurementDate: toDateTimeLocalInputValue(new Date()),
      ...draftFromScheduledOrder(order),
    });
  };

  // A new client starts blank; tapping «Новый клиент» again keeps what is
  // typed.
  const startNewClient = () => {
    if (target !== NEW_CLIENT_TARGET) updateDraft(emptyClient);

    setTarget(NEW_CLIENT_TARGET);
    setClientMatch(null);
    setIsEditingClient(false);
    setErrors([]);
    lookedUpPhone.current = null;
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
    setIsEditingClient(false);
    setClientMatch(null);
    lookedUpPhone.current = null;
    setErrors([]);
    setResult(null);
    setPhotoLimitNotice(null);
    setStep('client');
    setSignature([]);
    setIsLeaving(false);
    // The form is no longer opened for the order it was started from
    setOpenedFromOrderId(null);
    selectOpening(fresh.openings[0].key);
    setCopiedNotice(null);
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
  const isTwoPane = page.width >= TWO_PANE_MIN_WIDTH;
  const isSketchBeside = page.width >= SKETCH_BESIDE_MIN_WIDTH;
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
            projectionSide: '',
            projectionCm: '',
            isVisorWanted: false,
            visorServiceId: '',
            visorLengthCm: '',
          }
        : {}),
    });
    setPicker(null);
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
  const chooseVisor = (opening: OpeningDraft, visorServiceId: string) =>
    updateOpening(opening.key, (current) => ({
      isVisorWanted: true,
      visorServiceId,
      visorLengthCm:
        current.visorLengthCm === '' ? current.widthCm : current.visorLengthCm,
    }));
  const dropVisor = (opening: OpeningDraft) =>
    updateOpening(opening.key, {
      isVisorWanted: false,
      visorServiceId: '',
      visorLengthCm: '',
    });

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
      number: contractNumberOf(
        scheduled === undefined ? nextOrderName : scheduled.name,
      ),
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
              : [`${formatItemSize(item)} см`, describeProjectionSide(item)]
                  .filter(Boolean)
                  .join(', ')
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
      // Without the worker the cash is counted as the business's, as before.
      const workerId =
        payload.firstPayment.method === 'CASH'
          ? await loadOwnWorkerId().catch(() => null)
          : null;
      const { amount, ...firstPayment } = withCashHolder(
        payload.firstPayment,
        workerId,
      );

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

  const isContractReady = contractTemplate !== null && preview.total !== null;
  // An error of the last «Далее» that is fixed by now is no longer shown
  const standingErrors = errors.filter((error) => liveErrors.includes(error));

  // What the client step has to say before the client is handed the contract;
  // the sum is the payment step's
  const contractNeeds = () =>
    contractTemplate === null
      ? []
      : missingClientDetails({ ...contractData(contractTemplate), total: 1 });

  // A step opens only when the ones before it are filled; going back is free.
  const openStep = (next: Step) => {
    if (isSaveInFlight.current) return;

    const from = STEPS.findIndex((item) => item.key === step);
    const to = STEPS.findIndex((item) => item.key === next);

    if (to === from) return;

    setPicker(null);
    setIsMenuOpen(false);
    setIsLeaving(false);

    if (to <= from) {
      setErrors([]);
      // The client signed for this sum and this prepayment.
      setSignature([]);
      setStep(next);

      return;
    }

    const clientErrors = liveErrors.filter(isClientError);

    if (clientErrors.length > 0) {
      // Until the visit is chosen there is no client to ask a phone of
      setErrors(target === '' ? clientErrors.slice(0, 1) : clientErrors);
      setStep('client');
      // The phone is typed in the client's fields, not on their card
      setIsEditingClient(target !== '');

      return;
    }

    if (next !== 'openings' && liveErrors.length > 0) {
      const firstWrongOpening = draft.openings.find(
        (_, index) => errorsOf(liveErrors, index + 1).length > 0,
      );

      setErrors(liveErrors);
      setStep('openings');
      selectOpening(firstWrongOpening?.key ?? SERVICES_KEY);

      return;
    }

    if (next === 'contract') {
      if (!isContractReady) {
        setErrors([]);
        setStep('payment');

        return;
      }

      if (Object.keys(preview.errors).length > 0) {
        setErrors(['Сначала исправьте скидку или предоплату.']);
        setStep('payment');

        return;
      }

      if (contractNeeds().length > 0) {
        setErrors([CONTRACT_NEEDS]);
        setStep('client');
        setIsEditingClient(true);

        return;
      }

      setSignature([]);

      if (!scheduledOrders.some((order) => order.id === target)) {
        loadNextOrderName()
          .then(setNextOrderName)
          .catch(() => setNextOrderName(null));
      }
    }

    setErrors([]);
    setStep(next);
  };

  const hairline = `1px solid ${colors.border}`;

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
    border: isPrimary ? 'none' : hairline,
    color: isPrimary ? colors.onAccent : colors.text,
    fontWeight: 600,
    textDecoration: 'none',
    textAlign: 'center',
  });

  const backStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: CONTROL_HEIGHT,
    padding: `0 ${SPACE.sm}px 0 0`,
    background: 'transparent',
    border: 'none',
    color: colors.muted,
    font: 'inherit',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  };

  const column = (gap: number = SPACE.xl): CSSProperties => ({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap,
    alignContent: 'start',
    minWidth: 0,
  });

  const pane: CSSProperties = {
    ...column(SPACE.lg),
    padding: isTwoPane ? SPACE.xl : SPACE.lg,
  };

  const headRow: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  };

  const paneTitle: CSSProperties = { margin: 0, ...TYPE.title };

  if (result !== null) {
    const savedClientName = draftClientName(result.draft);

    return (
      <div ref={page.ref} style={{ width: '100%' }}>
        <div
          style={{
            boxSizing: 'border-box',
            width: '100%',
            padding: isTwoPane ? SPACE.lg : SPACE.sm,
            color: colors.text,
            fontFamily: 'inherit',
            ...TYPE.body,
          }}
        >
          <div
            style={{
              ...column(),
              maxWidth: RESULT_MAX_WIDTH,
              margin: '0 auto',
              padding: SPACE.xl,
              background: colors.surface,
              border: hairline,
              borderRadius: RADIUS.card,
            }}
          >
            <div style={column(SPACE.xs)}>
              <span style={{ color: colors.success, fontWeight: 600 }}>
                {result.contract === 'signed'
                  ? '✓ Замер сохранён, договор подписан, PDF в заказе'
                  : '✓ Замер сохранён'}
              </span>
              <h2 style={{ margin: 0, fontSize: '32px', lineHeight: '38px' }}>
                Заказ {result.orderName ?? '(номер появится через минуту)'}
              </h2>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: `${SPACE.sm}px ${SPACE.xl}px`,
                ...TABULAR_NUMBERS,
              }}
            >
              {savedClientName !== null && (
                <Fact label="Клиент" value={savedClientName} />
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
            <div
              style={
                page.width < COLUMNS_MIN_WIDTH
                  ? column(SPACE.sm)
                  : { display: 'flex', flexWrap: 'wrap', gap: SPACE.md }
              }
            >
              {/* Plain links load the page afresh: the host's cached order
                  lists do not see records created through the API, and the
                  SDK's client-side navigate would show them stale. */}
              <a
                href={`/object/order/${result.orderId}`}
                style={linkButton(true)}
              >
                Открыть заказ
              </a>
              <Button onClick={resetForm}>Новый замер</Button>
              <a href="/objects/orders" style={linkButton(false)}>
                К списку заказов
              </a>
            </div>
            {result.items.length > 0 && (
              <div style={column(0)}>
                <FieldLabel>Фото проёмов</FieldLabel>
                {result.items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      ...column(SPACE.sm),
                      padding: `${SPACE.md}px 0`,
                      borderBottom: hairline,
                    }}
                  >
                    <div style={headRow}>
                      <span>
                        <strong>Проём {item.openingNumber}</strong>:{' '}
                        {item.label}
                        {item.photoCount > 0 && `, фото: ${item.photoCount}`}
                      </span>
                      <Button
                        variant="link"
                        label={`Добавить фото: проём ${item.openingNumber}`}
                        onClick={() => openItemForPhotos(item.id)}
                      >
                        Добавить фото
                      </Button>
                    </div>
                    {/* The photos picked in the form, as they were saved. */}
                    <PhotoRow
                      photos={
                        result.draft.openings[item.openingNumber - 1]?.photos ??
                        []
                      }
                      openingNumber={item.openingNumber}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const clientName = draftClientName(draft);
  const clientAddress = [
    findLabel(DISTRICT_OPTIONS, draft.district),
    draft.addressLine,
  ]
    .filter((part) => part !== null && part !== '')
    .join(', ');
  const previousStep = STEPS[STEPS.findIndex((item) => item.key === step) - 1];

  // The page's own header already says «Новый замер»; a phone's one line is
  // for the steps
  const backText = isTwoPane ? '← Назад' : '←';

  const topBar = (
    <div
      ref={header.ref}
      style={{
        // A phone keeps its short screen for the fields
        position: isTwoPane ? 'sticky' : 'relative',
        top: 0,
        // Above the fields that scroll under it
        zIndex: 2,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: `${SPACE.xs}px ${SPACE.md}px`,
        padding: `${SPACE.sm}px ${isTwoPane ? SPACE.lg : SPACE.md}px`,
        background: colors.surface,
        borderBottom: hairline,
      }}
    >
      {isLeaving ? (
        <>
          <span style={{ flex: '1 1 200px' }}>
            Выйти без сохранения? Введённое пропадёт.
          </span>
          <a href={leaveHref} style={linkButton(false)}>
            Выйти
          </a>
          <Button onClick={() => setIsLeaving(false)}>Остаться</Button>
        </>
      ) : (
        <>
          {previousStep !== undefined ? (
            <button
              type="button"
              aria-label="Назад"
              style={backStyle}
              onClick={() => openStep(previousStep.key)}
            >
              {backText}
            </button>
          ) : isDirty ? (
            <button
              type="button"
              aria-label="Назад"
              style={backStyle}
              onClick={() => setIsLeaving(true)}
            >
              {backText}
            </button>
          ) : (
            <a href={leaveHref} aria-label="Назад" style={backStyle}>
              {backText}
            </a>
          )}
          {isTwoPane && (
            <h2 style={{ margin: 0, ...TYPE.rowTitle, whiteSpace: 'nowrap' }}>
              Новый замер
            </h2>
          )}
          {isTwoPane && step !== 'client' && clientName !== null && (
            <span
              style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: colors.muted,
              }}
            >
              {clientName}
            </span>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <StepTrail
              steps={STEPS}
              current={step}
              isCompact={!isTwoPane}
              onOpen={openStep}
            />
          </div>
        </>
      )}
    </div>
  );

  // One white surface from the top bar to the bar of the step's actions, which
  // stays in reach under a long проём.
  const shell = (body: ReactNode, actions: ReactNode) => (
    <div
      ref={page.ref}
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minHeight: '100cqh',
        background: colors.surface,
        color: colors.text,
        fontFamily: 'inherit',
        ...TYPE.body,
      }}
    >
      {/* As tall as the screen: the sandbox gives a height in pixels only for
          an element it has measured */}
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
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          flex: 1,
          minWidth: 0,
        }}
      >
        {shownView === view ? body : null}
      </div>
      <div
        ref={footer.ref}
        style={{
          // A phone has Twenty's own navigation floating over the bottom
          // edge, and the bar would hang above it over the fields
          position: page.width >= COLUMNS_MIN_WIDTH ? 'sticky' : 'static',
          bottom: 0,
          zIndex: 2,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: SPACE.md,
          padding: `${SPACE.md}px ${SPACE.lg}px`,
          background: colors.surface,
          borderTop: hairline,
        }}
      >
        {actions}
      </div>
    </div>
  );

  // A list on the left and what is chosen in it on the right; the list goes
  // above on a screen too narrow for both.
  const split = (side: ReactNode, sideWidth: number, main: ReactNode) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isTwoPane
          ? `${sideWidth}px minmax(0, 1fr)`
          : 'minmax(0, 1fr)',
      }}
    >
      <div
        style={
          isTwoPane ? { borderRight: hairline } : { borderBottom: hairline }
        }
      >
        <div
          style={{
            ...column(SPACE.xs),
            padding: SPACE.md,
            ...(isTwoPane
              ? {
                  position: 'sticky',
                  top: header.height,
                  maxHeight: `calc(100cqh - ${header.height + footer.height}px)`,
                  overflowY: 'auto',
                }
              : {}),
          }}
        >
          {side}
        </div>
      </div>
      {main}
    </div>
  );

  // What the bar under a step says: its errors, or a quiet summary.
  const barNote = (list: string[], summary = '') => (
    <div
      role={list.length > 0 ? 'alert' : undefined}
      style={{
        flex: '1 1 220px',
        display: 'grid',
        color: list.length > 0 ? colors.danger : colors.muted,
        ...TABULAR_NUMBERS,
        ...WRAP,
      }}
    >
      {list.length > 0
        ? list.map((error) => <span key={error}>{error}</span>)
        : summary}
    </div>
  );

  const barTotal = (amount: string) => (
    <span style={{ ...TYPE.rowTitle, ...TABULAR_NUMBERS, ...WRAP }}>
      {amount}
    </span>
  );

  // Without a size there is no sum yet; without a price there never will be
  const totalText =
    draftTotal !== null
      ? formatMoney(draftTotal)
      : liveErrors.some((error) => /^Проём \d+:/.test(error))
        ? '—'
        : 'Цену назовёт менеджер';

  if (step === 'contract' && contractTemplate !== null) {
    const data = contractData(contractTemplate);

    return shell(
      <div style={pane}>
        <ContractSigning
          document={buildContractDocument(contractTemplate, data)}
          data={data}
          blockers={missingClientDetails(data)}
          warnings={missingCompanyDetails(contractTemplate)}
          signature={signature}
          onSignatureChange={changeSignature}
          // Between the two bars, so the contract's end and the signature are
          // not under the lower one; a phone's bar is not stuck there
          roomHeight={
            page.width >= COLUMNS_MIN_WIDTH && screen.height > 0
              ? screen.height -
                header.height -
                footer.height -
                2 * (isTwoPane ? SPACE.xl : SPACE.lg)
              : undefined
          }
        >
          <ErrorList errors={errors} />
        </ContractSigning>
      </div>,
      <>
        {barNote([], `предоплата ${formatMoney(preview.prepayment)}`)}
        {barTotal(formatMoney(preview.total ?? 0))}
        <button
          type="button"
          disabled={signature.length === 0}
          aria-busy={isSaving}
          onClick={handleSave}
          style={{
            minHeight: CONTROL_HEIGHT,
            width: page.width < COLUMNS_MIN_WIDTH ? '100%' : undefined,
            padding: `0 ${SPACE.lg}px`,
            background: signature.length === 0 ? colors.panel : colors.accent,
            border: 'none',
            borderRadius: RADIUS.control,
            color: signature.length === 0 ? colors.muted : colors.onAccent,
            font: 'inherit',
            fontWeight: 600,
            opacity: isSaving ? 0.6 : 1,
            cursor: 'pointer',
          }}
        >
          {isSaving ? 'Сохранение…' : 'Подписать и сохранить'}
        </button>
      </>,
    );
  }

  if (step === 'payment' || step === 'contract') {
    const prepaymentShareOf = (share: number) =>
      share === 0 ? '' : formatWhole(Math.round((preview.total ?? 0) * share));
    const receipt = (
      <div
        style={{
          ...pane,
          ...(isTwoPane
            ? { borderRight: hairline }
            : { borderBottom: hairline }),
        }}
      >
        <div style={headRow}>
          <h3 style={paneTitle}>Заказ</h3>
          {isSaving ? null : (
            <Button variant="link" onClick={() => openStep('openings')}>
              Изменить
            </Button>
          )}
        </div>
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
                  title={`${/^козырёк/i.test(visor.name) ? '' : 'Козырёк '}${visor.name}${isVisorOnlyOpening(opening) ? '' : ` · проём ${index + 1}`}`}
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
            />
          </div>
        </div>
      </div>
    );

    const paymentPane = (
      <div style={pane}>
        <h3 style={paneTitle}>Оплата</h3>
        {preview.subtotal === null ||
        preview.total === null ||
        preview.balance === null ? (
          <div style={column(SPACE.xs)}>
            <span style={{ fontWeight: 600 }}>Цену назовёт менеджер</span>
            <span style={{ color: colors.muted }}>
              В заказе есть решётка, козырёк или услуга без цены, поэтому скидку
              и предоплату менеджер внесёт сам.
            </span>
          </div>
        ) : (
          <>
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
            <div style={column(SPACE.sm)}>
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
                    isChosen={payment.prepayment === prepaymentShareOf(share)}
                    onClick={() =>
                      updatePayment({ prepayment: prepaymentShareOf(share) })
                    }
                  />
                ))}
              </div>
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
            <div
              style={{
                ...column(SPACE.xs),
                paddingTop: SPACE.md,
                borderTop: hairline,
              }}
            >
              {preview.discount > 0 && (
                <SummaryLine
                  label="Скидка"
                  value={`−${formatMoney(preview.discount)}`}
                />
              )}
              <SummaryLine label="Итого" value={formatMoney(preview.total)} />
              <SummaryLine
                label="Предоплата"
                value={formatMoney(preview.prepayment)}
              />
              <SummaryLine
                label="Остаток"
                value={formatMoney(preview.balance)}
                isTotal
              />
            </div>
          </>
        )}
        <span style={{ ...TYPE.label, color: colors.muted }}>
          {isContractReady
            ? 'Без договора заказ сохранится со статусом «Не подписан»; подписать можно позже из заказа.'
            : preview.total === null
              ? 'Договор подпишет менеджер, когда у заказа будет цена.'
              : 'Договор загружается…'}
        </span>
      </div>
    );

    return shell(
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isTwoPane
            ? 'minmax(0, 1fr) minmax(0, 1fr)'
            : 'minmax(0, 1fr)',
        }}
      >
        {receipt}
        {paymentPane}
      </div>,
      <>
        {barNote(errors)}
        <Button
          variant={isContractReady ? 'quiet' : 'primary'}
          isBusy={isSaving}
          busyText="Сохранение…"
          isWideOnPhone
          onClick={handleSave}
        >
          Сохранить без договора
        </Button>
        {isContractReady && (
          <Button
            variant="primary"
            isWideOnPhone
            onClick={() => openStep('contract')}
          >
            Далее: договор
          </Button>
        )}
      </>,
    );
  }

  if (step === 'client') {
    // Opened from an order's card, the form is for that order alone
    const hasVisits = scheduledOrders.length > 0 && openedFromOrderId === null;
    const isScheduledClient = target !== '' && target !== NEW_CLIENT_TARGET;
    // The typed value as it is: a date still being typed is not a date yet
    const measurementTime = describeMeasurementTime(
      draft.measurementDate === '' ? null : draft.measurementDate,
      today,
    );

    const visits = (
      <>
        <div style={{ padding: `${SPACE.sm}px ${SPACE.md}px 0` }}>
          <FieldLabel>Чей замер</FieldLabel>
        </div>
        {scheduledOrders.map((order) => (
          <RailItem
            key={order.id}
            title={joinFullName(order.clientFullName) ?? order.name}
            aside={
              describeMeasurementTime(order.measurementDate, today) ??
              'Без даты'
            }
            detail={
              [
                findLabel(DISTRICT_OPTIONS, order.district ?? ''),
                order.addressLine,
                order.floor === null ? null : `${order.floor} эт.`,
              ]
                .filter((part) => part !== null && part !== '')
                .join(', ') || order.name
            }
            isSelected={order.id === target}
            onSelect={() => pickVisit(order.id)}
          />
        ))}
        <RailItem
          title="+ Новый клиент"
          detail="Без записи менеджера"
          isSelected={target === NEW_CLIENT_TARGET}
          onSelect={startNewClient}
        />
      </>
    );

    const clientFields = (
      <ClientFields
        draft={draft}
        match={clientMatch}
        phoneError={
          standingErrors.find((error) => error.includes('телефон')) ?? null
        }
        onChange={changeClient}
        onTakeMatch={takeClientMatch}
      />
    );

    const clientNotes = [
      ...standingErrors.filter(isClientError),
      ...(errors.includes(CONTRACT_NEEDS) && contractNeeds().length > 0
        ? [`${CONTRACT_NEEDS}: ${contractNeeds().join(', ')}.`]
        : []),
    ];

    const details = (
      <div style={pane}>
        {/* A phone's bar is at the end of the step, out of sight */}
        {page.width < COLUMNS_MIN_WIDTH && <ErrorList errors={clientNotes} />}
        {measurerId === null && loadError === null ? (
          // Until the booked visits are known, a phone typed here would be
          // taken for a new client's
          <span style={{ color: colors.muted }}>Загружаем записи…</span>
        ) : target === '' && hasVisits ? (
          <span style={{ color: colors.muted }}>
            Выберите запись менеджера в списке или «Новый клиент».
          </span>
        ) : isScheduledClient && !isEditingClient ? (
          <>
            <div style={headRow}>
              <h3 style={paneTitle}>{clientName ?? 'Без имени'}</h3>
              <Button variant="link" onClick={() => setIsEditingClient(true)}>
                Изменить
              </Button>
            </div>
            <div style={column(0)}>
              <SettingRow label="Телефон">
                <span style={TABULAR_NUMBERS}>
                  {draft.clientPhone === ''
                    ? 'нет телефона'
                    : `${UZBEK_PHONE_PREFIX} ${draft.clientPhone}`}
                </span>
              </SettingRow>
              <SettingRow label="Адрес">{clientAddress || '—'}</SettingRow>
              <SettingRow label="Этаж">{draft.floor || '—'}</SettingRow>
              <SettingRow label="Откуда узнал">
                {findLabel(SOURCE_OPTIONS, draft.source) ?? '—'}
              </SettingRow>
              <SettingRow label="Дата замера">
                {measurementTime ?? '—'}
              </SettingRow>
            </div>
            {draft.comment.trim() !== '' && (
              <NoteBox title="Комментарий менеджера" text={draft.comment} />
            )}
          </>
        ) : (
          <>
            <div style={headRow}>
              <h3 style={paneTitle}>
                {isScheduledClient ? 'Клиент' : 'Новый клиент'}
              </h3>
              {isScheduledClient && (
                <Button
                  variant="link"
                  onClick={() => setIsEditingClient(false)}
                >
                  Готово
                </Button>
              )}
            </div>
            {clientFields}
          </>
        )}
      </div>
    );

    return shell(
      <>
        {loadError !== null && (
          <div style={{ padding: `${SPACE.lg}px ${SPACE.lg}px 0` }}>
            <ErrorList errors={[loadError]} />
          </div>
        )}
        {hasVisits ? (
          split(visits, VISITS_WIDTH, details)
        ) : (
          <div style={{ maxWidth: CLIENT_MAX_WIDTH }}>{details}</div>
        )}
      </>,
      <>
        {barNote(clientNotes)}
        <Button
          variant="primary"
          isWideOnPhone
          onClick={() => openStep('openings')}
        >
          Начать замер
        </Button>
      </>,
    );
  }

  const sketchOf = (opening: OpeningDraft) => {
    const isRailing = opening.product === 'RAILING';
    const outline = isRailing ? null : openingOutline(opening);
    const visor = visorOf(opening);
    const visorLength = parseDecimalInput(opening.visorLengthCm);

    return (
      <div
        style={{
          display: 'grid',
          maxWidth: SKETCH_MAX_WIDTH,
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

  const openingPane = (opening: OpeningDraft, index: number) => {
    const openingNumber = index + 1;
    const ownErrors = errorsOf(standingErrors, openingNumber);
    const total = openingTotal(opening);
    const area = openingArea(opening);
    const grille = grilleOf(opening);
    const visorTotal = computeOpeningVisorTotal(opening, visorOptions);
    const isRailing = opening.product === 'RAILING';
    const isShaped = !isRailing && opening.shape.kind !== 'RECTANGLE';
    const outline = isRailing ? null : openingOutline(opening);
    const runningMeters = computeOpeningRunningMeters(opening);
    const times = quantityOf(opening) > 1 ? ` × ${opening.quantity}` : '';
    const designCount = grilles.filter(
      (option) => option.product === opening.product,
    ).length;
    const isCustomDesign =
      opening.designId === '' && !isVisorOnlyOpening(opening);
    const extras = [
      opening.photos.length > 0 ? `фото ${opening.photos.length}` : null,
      opening.notes.trim() !== ''
        ? isCustomDesign
          ? 'описание'
          : 'заметка'
        : null,
    ]
      .filter((part) => part !== null)
      .join(', ');
    const menuItem: CSSProperties = {
      minHeight: CONTROL_HEIGHT,
      padding: `0 ${SPACE.md}px`,
      background: 'transparent',
      border: 'none',
      borderRadius: RADIUS.control,
      color: colors.text,
      font: 'inherit',
      textAlign: 'left',
      cursor: 'pointer',
    };

    return (
      <section
        key={opening.key}
        aria-label={`Проём ${openingNumber}`}
        style={pane}
      >
        <div style={{ ...headRow, position: 'relative' }}>
          <h3 style={paneTitle}>Проём {openingNumber}</h3>
          <Button
            label="Действия с проёмом"
            onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
          >
            ⋯
          </Button>
          {isMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: CONTROL_HEIGHT + SPACE.xs,
                right: 0,
                // Above the inputs under it
                zIndex: 1,
                display: 'grid',
                minWidth: 220,
                padding: SPACE.xs,
                background: colors.surface,
                border: hairline,
                borderRadius: RADIUS.card,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
              }}
            >
              <button
                type="button"
                style={menuItem}
                onClick={() => duplicateOpening(opening)}
              >
                Копировать проём
              </button>
              {draft.openings.length > 1 && (
                <button
                  type="button"
                  style={{ ...menuItem, color: colors.danger }}
                  onClick={() => removeOpening(opening.key)}
                >
                  Удалить проём
                </button>
              )}
            </div>
          )}
        </div>
        {copiedNotice?.openingKey === opening.key ? (
          <div
            role="status"
            style={{
              padding: `${SPACE.sm}px ${SPACE.md}px`,
              background: colors.panel,
              borderRadius: RADIUS.control,
              ...TYPE.label,
              ...WRAP,
            }}
          >
            Решётка, вынос и козырёк взяты из проёма {copiedNotice.fromNumber}.
            Размеры введите заново.
          </div>
        ) : null}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isSketchBeside
              ? `minmax(0, 1fr) ${SKETCH_PANEL_WIDTH}px`
              : 'minmax(0, 1fr)',
            gap: SPACE.xl,
            alignItems: 'start',
          }}
        >
          <div style={column(SPACE.lg)}>
            <div style={column(SPACE.sm)}>
              <FieldLabel>Изделие</FieldLabel>
              <div style={{ maxWidth: 360 }}>
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
            </div>
            {isRailing ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                  gap: SPACE.md,
                }}
              >
                <Field label="Длина">
                  <TextInput
                    label="Длина, см"
                    inputMode="decimal"
                    isLarge
                    suffix="см"
                    placeholder="0"
                    value={opening.widthCm}
                    onChange={(widthCm) => changeWidth(opening.key, widthCm)}
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
              />
            )}
            <ErrorList errors={ownErrors} />
          </div>
          <div
            style={{
              ...column(SPACE.sm),
              padding: SPACE.md,
              background: colors.panel,
              borderRadius: RADIUS.card,
            }}
          >
            {sketchOf(opening)}
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
            {opening.visorServiceId !== '' && (
              <SummaryLine
                label="Козырёк"
                value={
                  visorTotal === null ? 'нужна длина' : formatMoney(visorTotal)
                }
              />
            )}
            <div style={{ paddingTop: SPACE.sm, borderTop: hairline }}>
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
        <div style={column(0)}>
          <DisclosureRow
            label="Рисунок"
            value={
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: SPACE.md,
                  minWidth: 0,
                }}
              >
                <span style={{ display: 'grid', textAlign: 'right', ...WRAP }}>
                  <span style={{ fontWeight: 600 }}>
                    {grille?.name ?? 'Другая'}
                  </span>
                  <span
                    style={{
                      ...TYPE.label,
                      ...TABULAR_NUMBERS,
                      color: colors.muted,
                    }}
                  >
                    {grille === null
                      ? `цену назовёт менеджер · выбрать из ${designCount}`
                      : [
                          isTwoPane ? grille.kindName : null,
                          grille.pricePerSquareMeter === null
                            ? 'без цены'
                            : `${formatMoney(grille.pricePerSquareMeter)} за ${isRailing ? 'п.м.' : 'м²'}`,
                        ]
                          .filter((part) => part !== null)
                          .join(' · ')}
                  </span>
                </span>
                <Thumbnail photoUrl={grille?.photoUrl ?? null} />
              </span>
            }
            onToggle={() => {
              setIsMenuOpen(false);
              setPicker({ query: '', grilleKind: ALL_KINDS });
            }}
          />
          {!isRailing && (
            <SettingRow label="Вынос">
              {opening.projectionKind !== 'NONE' && (
                <div style={{ width: 130 }}>
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
              <Segmented
                label="Вынос"
                value={opening.projectionKind}
                options={PROJECTION_KIND_OPTIONS.map(({ value, label }) => ({
                  value: value as ProjectionKind,
                  label: label
                    .replace('Вынос ', '')
                    .replace(/^./, (letter) => letter.toUpperCase()),
                }))}
                onChange={(projectionKind) =>
                  updateOpening(opening.key, { projectionKind })
                }
              />
            </SettingRow>
          )}
          {!isRailing && opening.projectionKind !== 'NONE' && (
            <span
              style={{
                ...TYPE.label,
                color: colors.muted,
                paddingBottom: SPACE.sm,
              }}
            >
              Насколько решётка выходит за проём с каждой стороны. Площадь
              считается с выносом.
            </span>
          )}
          {!isRailing && (
            <SettingRow label="Установка">
              <Segmented
                label="Установка"
                value={opening.projectionSide}
                options={PROJECTION_SIDE_OPTIONS.map(({ value, label }) => ({
                  value: value as ProjectionSide,
                  label,
                }))}
                onChange={(projectionSide) =>
                  updateOpening(opening.key, { projectionSide })
                }
              />
            </SettingRow>
          )}
          <SettingRow label="Одинаковых">
            <QuantityStepper
              label="Количество одинаковых"
              isLabelShown={false}
              value={opening.quantity}
              onChange={(quantity) => updateOpening(opening.key, { quantity })}
            />
          </SettingRow>
          {!isRailing && (
            <SettingRow label="Козырёк">
              {opening.visorServiceId !== '' && (
                <div style={{ width: 150 }}>
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
              )}
              <div style={{ ...column(0), maxWidth: 300 }}>
                <SelectInput
                  label="Козырёк"
                  value={opening.visorServiceId}
                  options={[
                    { value: '', label: 'Не нужен' },
                    ...visorOptions.map((option) => ({
                      value: option.id,
                      label:
                        option.price === null
                          ? `${option.name} · без цены`
                          : `${option.name} · ${formatMoney(option.price)} за п.м.`,
                    })),
                  ]}
                  onChange={(visorServiceId) =>
                    visorServiceId === ''
                      ? dropVisor(opening)
                      : chooseVisor(opening, visorServiceId)
                  }
                />
              </div>
            </SettingRow>
          )}
          {!isRailing && opening.visorServiceId !== '' && (
            <span
              style={{
                ...TYPE.label,
                color: colors.muted,
                paddingBottom: SPACE.sm,
              }}
            >
              {isVisorOnlyOpening(opening)
                ? 'Без ширины и высоты сохранится только козырёк, без решётки.'
                : 'Длина козырька сначала равна ширине проёма, её можно изменить.'}
            </span>
          )}
          <DisclosureRow
            label={
              isCustomDesign
                ? 'Свой рисунок: фото и описание'
                : 'Фото и заметка'
            }
            value={
              extras === ''
                ? isCustomDesign
                  ? 'Добавить фото рисунка'
                  : 'Добавить'
                : extras
            }
            isOpen={isExtrasOpen}
            onToggle={() => setIsExtrasOpen((isOpen) => !isOpen)}
          >
            {isCustomDesign && (
              <span style={{ ...TYPE.label, color: colors.muted }}>
                Сфотографируйте образец или эскиз и опишите рисунок. Цену и
                материалы укажет менеджер.
              </span>
            )}
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
                      border: `1px dashed ${colors.border}`,
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
              label={isCustomDesign ? 'Какой рисунок' : 'Заметки'}
              value={opening.notes}
              placeholder={
                isCustomDesign
                  ? 'Например: как на фото, с цветком по центру'
                  : 'Например: решётка открывается, замок справа'
              }
              onChange={(notes) => updateOpening(opening.key, { notes })}
            />
          </DisclosureRow>
        </div>
      </section>
    );
  };

  const designPane = (opening: OpeningDraft, index: number, open: Picker) => (
    <section aria-label={`Рисунок, проём ${index + 1}`} style={pane}>
      <GrillePicker
        heading={
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
            <Button label="Назад к проёму" onClick={() => setPicker(null)}>
              ←
            </Button>
            <h3 style={paneTitle}>Рисунок · проём {index + 1}</h3>
          </div>
        }
        stickyTop={isTwoPane ? header.height : 0}
        grilles={grilles.filter((option) => option.product === opening.product)}
        uses={grilleUses}
        chosenId={opening.designId}
        picker={open}
        onPickerChange={setPicker}
        onPick={(designId) => {
          updateOpening(opening.key, { designId });
          setPicker(null);
        }}
      />
    </section>
  );

  const serviceErrors = standingErrors.filter((error) =>
    error.startsWith('Услуга '),
  );

  const serviceRow = (line: ServiceDraft) => {
    const option = serviceOptionOf(line);
    const unit = option?.unit ?? 'FIXED';
    const lineTotal = computeServiceLineTotal(
      line,
      serviceOptions,
      totalAreaSquareMeters,
    );
    const name = option?.name ?? 'Услуга';

    return (
      <div
        key={line.key}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: `${SPACE.sm}px ${SPACE.md}px`,
          padding: `${SPACE.md}px 0`,
          borderTop: hairline,
        }}
      >
        <span style={{ flex: '1 1 180px', display: 'grid', ...WRAP }}>
          <span style={{ fontWeight: 600 }}>{name}</span>
          <span
            style={{ ...TYPE.label, ...TABULAR_NUMBERS, color: colors.muted }}
          >
            {option?.price == null
              ? 'цена не задана · назовёт менеджер'
              : `${formatMoney(option.price)} ${serviceUnitText(unit)}`}
          </span>
        </span>
        {isCountedServiceUnit(unit) ? (
          <QuantityStepper
            label={`Количество: ${name}`}
            isLabelShown={false}
            value={line.quantity === '' ? '1' : line.quantity}
            onChange={(quantity) => updateService(line.key, quantity)}
          />
        ) : (
          <div style={{ width: 150 }}>
            <TextInput
              label={`${unit === 'PER_SQUARE_METER' ? 'Площадь' : 'Длина'}: ${name}`}
              inputMode="decimal"
              suffix={serviceUnitLabel(unit)}
              placeholder={
                unit === 'PER_SQUARE_METER'
                  ? formatQuantity(totalAreaSquareMeters, '').trim()
                  : '0'
              }
              value={line.quantity}
              onChange={(quantity) => updateService(line.key, quantity)}
            />
          </div>
        )}
        <span
          style={{
            minWidth: 120,
            textAlign: 'right',
            fontWeight: 600,
            ...TABULAR_NUMBERS,
          }}
        >
          {lineTotal === null ? '—' : formatMoney(lineTotal)}
        </span>
        <Button
          label={`Убрать услугу «${name}»`}
          onClick={() => removeService(line.key)}
        >
          ×
        </Button>
      </div>
    );
  };

  const servicesPane = (
    <section aria-label="Услуги" style={pane}>
      <div style={headRow}>
        <h3 style={paneTitle}>Услуги</h3>
        <span style={{ ...TYPE.label, color: colors.muted }}>
          из Цены → Услуги
        </span>
      </div>
      {draft.services.length > 0 && (
        <div style={column(0)}>{draft.services.map(serviceRow)}</div>
      )}
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
            Одну услугу можно добавить несколько раз, например покраску отдельно
            для решёток и для перил. У каждой строки свой счёт.
          </span>
        </div>
      )}
      <ErrorList errors={serviceErrors} />
    </section>
  );

  const rail = (
    <>
      <div style={{ padding: `${SPACE.sm}px ${SPACE.md}px 0` }}>
        <FieldLabel>Проёмы</FieldLabel>
      </div>
      {draft.openings.map((opening, index) => {
        const size = describeSize(opening);
        const firstError = errorsOf(standingErrors, index + 1)[0];

        return (
          <RailItem
            key={opening.key}
            title={`Проём ${index + 1}`}
            aside={
              firstError !== undefined ? (
                <span style={{ color: colors.danger, fontWeight: 600 }}>!</span>
              ) : problemOf(index + 1) === null ? (
                <span style={{ color: colors.success }}>✓</span>
              ) : null
            }
            detail={
              firstError !== undefined
                ? shortProblem(firstError)
                : size === null
                  ? isVisorOnlyOpening(opening)
                    ? 'только козырёк'
                    : 'нет размеров'
                  : `${size}${quantityOf(opening) > 1 ? ` × ${opening.quantity}` : ''}`
            }
            isSelected={opening.key === selectedKey}
            isWrong={firstError !== undefined}
            onSelect={() => selectOpening(opening.key)}
          />
        );
      })}
      <div style={{ padding: `0 ${SPACE.md}px` }}>
        <Button variant="link" onClick={addOpening}>
          + Добавить проём
        </Button>
      </div>
      <div style={{ borderTop: hairline, margin: `${SPACE.sm}px 0` }} />
      <RailItem
        title="Услуги"
        aside={draft.services.length > 0 ? draft.services.length : null}
        detail={
          serviceErrors.length > 0
            ? 'нужно количество'
            : draft.services.length === 0 || servicesTotal === null
              ? undefined
              : formatMoney(servicesTotal)
        }
        isSelected={isServicesSelected}
        isWrong={serviceErrors.length > 0}
        onSelect={() => selectOpening(SERVICES_KEY)}
      />
    </>
  );

  // A phone keeps its height for the проём: the list is a row of chips
  const railChips = (
    <div style={{ ...headRow, justifyContent: 'flex-start' }}>
      <FilterChips
        value={selectedKey}
        options={[
          ...draft.openings.map((opening, index) => ({
            value: opening.key,
            label: `Проём ${index + 1}${
              errorsOf(standingErrors, index + 1).length > 0
                ? ' !'
                : problemOf(index + 1) === null
                  ? ' ✓'
                  : ''
            }`,
          })),
          {
            value: SERVICES_KEY,
            label:
              draft.services.length > 0
                ? `Услуги · ${draft.services.length}`
                : 'Услуги',
          },
        ]}
        onChange={selectOpening}
      />
      <Button variant="link" onClick={addOpening}>
        + Проём
      </Button>
    </div>
  );

  return shell(
    split(
      isTwoPane ? rail : railChips,
      RAIL_WIDTH,
      selectedOpening === null
        ? servicesPane
        : picker === null
          ? openingPane(selectedOpening, selectedIndex)
          : designPane(selectedOpening, selectedIndex, picker),
    ),
    <>
      {barNote(
        // In the bar it is seen wherever the проём is scrolled to
        standingErrors
          .slice(0, 1)
          .map((error) =>
            /^Проём \d+:/.test(error)
              ? `${error.split(':')[0]}: ${shortProblem(error)}`
              : error,
          ),
        `${countOpenings(draft.openings.length)} · ${formatQuantity(totalAreaSquareMeters, 'м²')}`,
      )}
      {draftTotal === null ? (
        <span style={WRAP}>{totalText}</span>
      ) : (
        barTotal(totalText)
      )}
      <Button
        variant="primary"
        isWideOnPhone
        onClick={() => openStep('payment')}
      >
        Далее: оплата
      </Button>
    </>,
  );
};
