import {
  DISTRICT_OPTIONS,
  type ProjectionKind,
  PROJECTION_KIND_OPTIONS,
  toProjectionSide,
} from 'src/constants/select-options';
import {
  type ContractData,
  type ContractExtra,
  type ContractOpening,
} from 'src/contract/contract-document';
import { type ContractTemplate } from 'src/contract/contract-template';
import {
  computeOpeningQuote,
  computeOpeningsTotalAreaSquareMeters,
  computeOpeningVisorTotal,
  computeServiceLineTotal,
  computeServiceQuantity,
  type GrilleOption,
  isVisorOnlyOpening,
  type MeasurementDraft,
  openingHeightCm,
  openingOutline,
  parseDecimalInput,
  type ServiceOption,
  type VisorOption,
} from 'src/measurer-form/measurer-form';
import { parseItemShape, toStoredShape } from 'src/opening-shape/opening-shape';
import { numberOpenings } from 'src/order-sketch/order-sketch';
import {
  computeItemAreaSquareMeters,
  railingName,
} from 'src/pricing/compute-item-area';
import { roundTo } from 'src/pricing/round';
import { toStoredUzbekPhone } from 'src/pricing/normalize-uzbek-phone';
import { joinFullName, type StoredFullName } from 'src/utils/full-name';

const MILLISECONDS_PER_DAY = 86_400_000;
const CENTIMETERS_PER_METER = 100;

const districtLabel = (district: string | null | undefined): string | null =>
  DISTRICT_OPTIONS.find((option) => option.value === district)?.label ?? null;

export const describeAddress = ({
  district,
  addressLine,
  floor,
}: {
  district: string | null | undefined;
  addressLine: string | null | undefined;
  floor: number | null | undefined;
}): string =>
  [
    districtLabel(district),
    addressLine?.trim() || null,
    floor === null || floor === undefined ? null : `этаж ${floor}`,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(', ');

const toProjectionKind = (value: string | null | undefined): ProjectionKind =>
  PROJECTION_KIND_OPTIONS.find((option) => option.value === value)?.value ??
  'NONE';

const areaOf = (
  widthCm: number,
  heightCm: number,
  projectionCm: number,
  projectionKind: ProjectionKind,
  quantity: number,
) =>
  roundTo(
    computeItemAreaSquareMeters({
      widthCm,
      heightCm,
      projectionCm,
      projectionKind,
    }) * quantity,
    2,
  );

// Days from signing to the order's «Срок»; the contract's own default until
// one is set, and again once it has passed: re-signing a late order must not
// promise it in a day.
export const termDaysUntil = (
  signedOn: string,
  deadline: string | null | undefined,
  defaultTermDays: number,
): number => {
  if (deadline === null || deadline === undefined || deadline === '') {
    return defaultTermDays;
  }

  const days = Math.round(
    (Date.parse(deadline.slice(0, 10)) - Date.parse(signedOn)) /
      MILLISECONDS_PER_DAY,
  );

  return Number.isFinite(days) && days > 0 ? days : defaultTermDays;
};

// What the client signs on «Новый замер»: the form as it stands, the same
// numbers the measurer sees.
export const contractDataFromDraft = ({
  draft,
  grilles,
  visorOptions,
  serviceOptions,
  subtotal,
  discount,
  total,
  prepayment,
  number,
  signedOn,
  template,
}: {
  draft: MeasurementDraft;
  grilles: GrilleOption[];
  visorOptions: VisorOption[];
  serviceOptions: ServiceOption[];
  subtotal: number | null;
  discount: number;
  total: number;
  prepayment: number;
  number: string | null;
  signedOn: string;
  template: ContractTemplate;
}): ContractData => ({
  number,
  signedOn,
  clientName:
    joinFullName({
      firstName: draft.clientFirstName,
      lastName: draft.clientLastName,
    }) ?? '',
  clientPhone: toStoredUzbekPhone(draft.clientPhone) ?? draft.clientPhone,
  address: describeAddress({
    district: draft.district,
    addressLine: draft.addressLine,
    floor: parseDecimalInput(draft.floor),
  }),
  subtotal,
  discount,
  total,
  prepayment,
  termDays: template.defaultTermDays,
  paintColor: null,
  openings: [
    ...openingsOfDraft(draft, grilles, visorOptions),
    ...servicesOfDraft(draft, serviceOptions),
  ],
  extras: extrasOfDraft(draft, serviceOptions),
});

// The visor and service lines the form saves, with the quantities it saves
// them with, so a contract signed on «Новый замер» matches the saved order.
const extrasOfDraft = (
  draft: MeasurementDraft,
  serviceOptions: ServiceOption[],
): ContractExtra[] => {
  const area = computeOpeningsTotalAreaSquareMeters(draft.openings);
  const visors = draft.openings.flatMap((opening): ContractExtra[] => {
    const lengthCm = parseDecimalInput(opening.visorLengthCm);

    if (opening.visorServiceId === '' || lengthCm === null) return [];

    return [
      {
        serviceId: opening.visorServiceId,
        quantity: roundTo(
          (lengthCm / CENTIMETERS_PER_METER) *
            (parseDecimalInput(opening.quantity) ?? 1),
          2,
        ),
      },
    ];
  });
  const services = draft.services.flatMap((line): ContractExtra[] => {
    const quantity = computeServiceQuantity(
      line,
      serviceOptions.find((option) => option.id === line.serviceId),
      area,
    );

    return quantity === null ? [] : [{ serviceId: line.serviceId, quantity }];
  });

  return [...visors, ...services];
};

// Each service is a row of its own, as on a saved order.
const servicesOfDraft = (
  draft: MeasurementDraft,
  serviceOptions: ServiceOption[],
): ContractOpening[] => {
  const area = computeOpeningsTotalAreaSquareMeters(draft.openings);

  return draft.services.map((line): ContractOpening => {
    const option = serviceOptions.find(
      (candidate) => candidate.id === line.serviceId,
    );
    const name = option?.name ?? 'Услуга';

    return {
      title: name,
      product: name,
      widthCm: null,
      heightCm: null,
      projectionKind: 'NONE',
      projectionCm: 0,
      quantity: computeServiceQuantity(line, option, area) ?? 1,
      areaSquareMeters: null,
      visorText: null,
      lineTotal: computeServiceLineTotal(line, serviceOptions, area),
      designId: null,
    };
  });
};

const productName = (isRailing: boolean, designName: string | null) =>
  isRailing ? railingName(designName) : (designName ?? 'Другая решётка');

const openingsOfDraft = (
  draft: MeasurementDraft,
  grilles: GrilleOption[],
  visorOptions: VisorOption[],
): ContractOpening[] =>
  draft.openings.map((opening, index): ContractOpening => {
    const visor =
      visorOptions.find((option) => option.id === opening.visorServiceId) ??
      null;
    const visorLengthCm = parseDecimalInput(opening.visorLengthCm);
    const quantity = parseDecimalInput(opening.quantity) ?? 1;
    const visorTotal = computeOpeningVisorTotal(opening, visorOptions);
    const visorText =
      visor === null ? null : `${visor.name}, ${visorLengthCm ?? '—'} см`;

    if (isVisorOnlyOpening(opening)) {
      return {
        title: `Проём ${index + 1}`,
        product: visorText ?? 'Козырёк',
        widthCm: null,
        heightCm: null,
        projectionKind: 'NONE',
        projectionCm: 0,
        quantity,
        areaSquareMeters: null,
        visorText: null,
        lineTotal: visorTotal,
        designId: null,
      };
    }

    const isRailing = opening.product === 'RAILING';
    const widthCm = parseDecimalInput(opening.widthCm);
    const heightCm = isRailing
      ? parseDecimalInput(opening.heightCm)
      : openingHeightCm(opening);
    const outline = openingOutline(opening);
    const shape =
      isRailing || outline === null
        ? null
        : toStoredShape(opening.shape, outline);
    const projectionKind = opening.projectionKind;
    const projectionCm =
      projectionKind === 'NONE'
        ? 0
        : (parseDecimalInput(opening.projectionCm) ?? 0);
    const grilleTotal = computeOpeningQuote(opening, grilles)?.lineTotal;

    return {
      title: `Проём ${index + 1}`,
      product: productName(
        isRailing,
        grilles.find((grille) => grille.id === opening.designId)?.name ?? null,
      ),
      widthCm,
      heightCm,
      projectionKind,
      projectionCm,
      projectionSide:
        isRailing || opening.projectionSide === ''
          ? null
          : opening.projectionSide,
      quantity,
      areaSquareMeters:
        widthCm === null || heightCm === null || isRailing
          ? null
          : areaOf(widthCm, heightCm, projectionCm, projectionKind, quantity),
      visorText,
      lineTotal:
        grilleTotal === undefined || visorTotal === null
          ? null
          : grilleTotal + visorTotal,
      designId: opening.designId === '' ? null : opening.designId,
      isRailing,
      shape,
    };
  });

export type StoredOrderForContract = {
  name: string | null;
  clientFullName: StoredFullName;
  clientPhone: string | null;
  district: string | null;
  addressLine: string | null;
  floor: number | null;
  subtotal: number | null;
  discount: number | null;
  total: number | null;
  paid: number | null;
  installationDeadline: string | null;
  paintColor: string | null;
  items: {
    id: string;
    // «Проём N» of the form; absent on items saved before it was kept
    openingNumber?: unknown;
    product?: string | null;
    shape?: unknown;
    widthCm: number | null;
    heightCm: number | null;
    projectionCm: number | null;
    projectionKind: string | null;
    projectionSide?: string | null;
    quantity: number | null;
    designId: string | null;
    designName: string | null;
    lineTotal: number | null;
  }[];
  extraServices: {
    extraServiceId: string | null;
    name: string | null;
    serviceName: string | null;
    // Running metres for a visor, all pieces together
    quantity: number | null;
    orderItemId: string | null;
    lineTotal: number | null;
  }[];
};

// «№1012» → «1012», the number as the contract's title reads it.
export const contractNumberOf = (orderName: string | null): string | null => {
  const digits = orderName?.replace(/^№\s*/, '').trim() ?? '';

  return digits === '' ? null : digits.replace(/^0+(?=\d)/, '');
};

// What the client signs from the order page: the order as saved now.
export const contractDataFromOrder = (
  order: StoredOrderForContract,
  template: ContractTemplate,
  signedOn: string,
): ContractData => {
  const serviceName = (
    service: StoredOrderForContract['extraServices'][number],
  ) => service.serviceName ?? service.name ?? 'Услуга';
  const numbers = numberOpenings(order.items);
  const openings = order.items.map((item, index): ContractOpening => {
    const quantity = item.quantity ?? 1;
    const projectionKind = toProjectionKind(item.projectionKind);
    const projectionCm =
      projectionKind === 'NONE' ? 0 : (item.projectionCm ?? 0);
    const visors = order.extraServices.filter(
      (service) => service.orderItemId === item.id,
    );
    const hasSizes =
      item.widthCm !== null &&
      item.heightCm !== null &&
      item.widthCm > 0 &&
      item.heightCm > 0;
    const isRailing = item.product === 'RAILING';

    return {
      title: `Проём ${numbers[index]}`,
      product: isRailing
        ? productName(true, item.designName)
        : (item.designName ?? 'Решётка не выбрана'),
      isRailing,
      shape: isRailing
        ? null
        : parseItemShape(item.shape, item.widthCm, item.heightCm),
      widthCm: hasSizes ? item.widthCm : null,
      heightCm: hasSizes ? item.heightCm : null,
      projectionKind,
      projectionCm,
      projectionSide: isRailing ? null : toProjectionSide(item.projectionSide),
      quantity,
      areaSquareMeters:
        hasSizes &&
        !isRailing &&
        item.widthCm !== null &&
        item.heightCm !== null
          ? areaOf(
              item.widthCm,
              item.heightCm,
              projectionCm,
              projectionKind,
              quantity,
            )
          : null,
      visorText:
        visors.length === 0
          ? null
          : visors
              .map((visor) =>
                visor.quantity === null
                  ? serviceName(visor)
                  : `${serviceName(visor)}, ${Math.round(
                      (visor.quantity / quantity) * CENTIMETERS_PER_METER,
                    )} см`,
              )
              .join('; '),
      lineTotal:
        item.lineTotal === null
          ? null
          : item.lineTotal +
            visors.reduce((sum, visor) => sum + (visor.lineTotal ?? 0), 0),
      designId: item.designId,
    };
  });
  const loose = order.extraServices
    .filter(
      (service) =>
        service.orderItemId === null ||
        !order.items.some((item) => item.id === service.orderItemId),
    )
    .map((service): ContractOpening => ({
      title: serviceName(service),
      product: serviceName(service),
      widthCm: null,
      heightCm: null,
      projectionKind: 'NONE',
      projectionCm: 0,
      quantity: service.quantity ?? 1,
      areaSquareMeters: null,
      visorText: null,
      lineTotal: service.lineTotal,
      designId: null,
    }));
  const total = order.total ?? 0;

  return {
    number: contractNumberOf(order.name),
    signedOn,
    clientName: joinFullName(order.clientFullName) ?? '',
    clientPhone: order.clientPhone ?? '',
    address: describeAddress(order),
    subtotal: order.subtotal,
    discount: order.discount ?? 0,
    total,
    prepayment: Math.min(order.paid ?? 0, total),
    termDays: termDaysUntil(
      signedOn,
      order.installationDeadline,
      template.defaultTermDays,
    ),
    paintColor: order.paintColor,
    // In the form's order, as on «Схема» and the photos
    openings: [
      ...openings
        .map((opening, index) => ({ opening, number: numbers[index] }))
        .sort((left, right) => left.number - right.number)
        .map(({ opening }) => opening),
      ...loose,
    ],
    extras: order.extraServices.map((service) => ({
      serviceId: service.extraServiceId ?? '',
      quantity: service.quantity ?? 0,
    })),
  };
};

// A проём still waiting for its price («Другая» рисунок): the total would
// leave it out, so the client cannot sign until the manager prices it.
export const unpricedOpenings = (data: ContractData): string[] =>
  data.openings
    .filter((opening) => opening.widthCm !== null && opening.lineTotal === null)
    .map((opening) => `цену: ${opening.title}`);

// What has to be on the order before the client can sign.
export const missingClientDetails = (data: ContractData): string[] =>
  [
    data.clientName.trim() === '' ? 'имя клиента' : null,
    data.clientPhone.trim() === '' ? 'телефон' : null,
    data.address.trim() === '' ? 'адрес объекта' : null,
    data.total <= 0 ? 'сумма заказа' : null,
  ].filter((label): label is string => label !== null);
