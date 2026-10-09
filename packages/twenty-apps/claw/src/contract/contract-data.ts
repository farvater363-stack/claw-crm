import {
  DISTRICT_OPTIONS,
  type ProjectionKind,
  PROJECTION_KIND_OPTIONS,
} from 'src/constants/select-options';
import {
  type ContractData,
  type ContractOpening,
} from 'src/contract/contract-document';
import { type ContractTemplate } from 'src/contract/contract-template';
import {
  computeOpeningQuote,
  computeOpeningVisorTotal,
  type GrilleOption,
  isVisorOnlyOpening,
  type MeasurementDraft,
  parseDecimalInput,
  type VisorOption,
} from 'src/measurer-form/measurer-form';
import { computeItemAreaSquareMeters } from 'src/pricing/compute-item-area';
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
// one is set, and never less than a day.
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

  return Number.isFinite(days) ? Math.max(days, 1) : defaultTermDays;
};

// What the client signs on «Новый замер»: the form as it stands, the same
// numbers the measurer sees.
export const contractDataFromDraft = ({
  draft,
  grilles,
  visorOptions,
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
  openings: draft.openings.map((opening, index): ContractOpening => {
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

    const widthCm = parseDecimalInput(opening.widthCm);
    const heightCm = parseDecimalInput(opening.heightCm);
    const projectionKind = opening.projectionKind;
    const projectionCm =
      projectionKind === 'NONE'
        ? 0
        : (parseDecimalInput(opening.projectionCm) ?? 0);
    const grilleTotal = computeOpeningQuote(opening, grilles)?.lineTotal;

    return {
      title: `Проём ${index + 1}`,
      product:
        grilles.find((grille) => grille.id === opening.designId)?.name ??
        'Другая решётка',
      widthCm,
      heightCm,
      projectionKind,
      projectionCm,
      quantity,
      areaSquareMeters:
        widthCm === null || heightCm === null
          ? null
          : areaOf(widthCm, heightCm, projectionCm, projectionKind, quantity),
      visorText,
      lineTotal:
        grilleTotal === undefined || visorTotal === null
          ? null
          : grilleTotal + visorTotal,
      designId: opening.designId === '' ? null : opening.designId,
    };
  }),
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
    widthCm: number | null;
    heightCm: number | null;
    projectionCm: number | null;
    projectionKind: string | null;
    quantity: number | null;
    designId: string | null;
    designName: string | null;
    lineTotal: number | null;
  }[];
  extraServices: {
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

    return {
      title: `Проём ${index + 1}`,
      product: item.designName ?? 'Решётка не выбрана',
      widthCm: hasSizes ? item.widthCm : null,
      heightCm: hasSizes ? item.heightCm : null,
      projectionKind,
      projectionCm,
      quantity,
      areaSquareMeters:
        hasSizes && item.widthCm !== null && item.heightCm !== null
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
      quantity: 1,
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
    openings: [...openings, ...loose],
  };
};

// What has to be on the order before the client can sign.
export const missingClientDetails = (data: ContractData): string[] =>
  [
    data.clientName.trim() === '' ? 'имя клиента' : null,
    data.clientPhone.trim() === '' ? 'телефон' : null,
    data.address.trim() === '' ? 'адрес объекта' : null,
    data.total <= 0 ? 'сумма заказа' : null,
  ].filter((label): label is string => label !== null);
