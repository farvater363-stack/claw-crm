import { type CoreApiClient } from 'twenty-client-sdk/core';
import { type MetadataApiClient } from 'twenty-client-sdk/metadata';

import {
  type CANCEL_REASON_OPTIONS,
  DISTRICT_OPTIONS,
  type OrderStatus,
  type PaymentMethod,
  type WorkerCategory,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { STEP_STATUS, type StepWrite } from 'src/order-header/order-steps';
import { numberOpenings } from 'src/order-sketch/order-sketch';
import { fromCurrency, toCurrency } from 'src/recalc/money';
import { joinFullName, type StoredFullName } from 'src/utils/full-name';
import { isAccessError } from 'src/utils/is-access-error';

export type Choice = { value: string; label: string };

export type CancelReason = (typeof CANCEL_REASON_OPTIONS)[number]['value'];

export type HeaderOrder = {
  id: string;
  name: string;
  status: OrderStatus | null;
  clientName: string | null;
  clientPhone: string | null;
  districtLabel: string | null;
  floor: number | null;
  materialState: string | null;
  materialNote: string | null;
  total: number | null;
  paid: number | null;
  balance: number | null;
  // False for a role that may not read the sums or the phone (the workshop)
  canSeeMoney: boolean;
  masterId: string | null;
  installerId: string | null;
  cancelReason: string | null;
  // The order's козырьки that no проём is chosen for
  visorsWithoutOpening: { id: string; name: string }[];
  openings: Choice[];
  // For a козырёк that is a проём of its own, with no решётка
  nextOpeningNumber: number;
};

export type OrderHeaderData = {
  order: HeaderOrder;
  masters: Choice[];
  installers: Choice[];
  measurers: Choice[];
  // Who may have taken a client's cash; empty for a role that cannot read
  // workers
  workers: Choice[];
};

// Twenty caps a page at 200 records; a shop has far fewer workers and logins.
const PAGE_SIZE = 200;
const MONEY = { amountMicros: true } as const;

type Worker = {
  id: string;
  fullName?: StoredFullName;
  categories?: readonly (WorkerCategory | undefined)[] | null;
};

// Apart from the order: a role that cannot read workers (the measurer) would
// lose the whole query, and with it the header.
const loadActiveWorkers = async (client: CoreApiClient): Promise<Worker[]> => {
  try {
    const { masters } = await client.query({
      masters: {
        __args: {
          filter: { isActive: { eq: true } },
          orderBy: [{ fullName: { firstName: 'AscNullsLast' } }],
          first: PAGE_SIZE,
        },
        edges: {
          node: {
            id: true,
            fullName: { firstName: true, lastName: true },
            categories: true,
          },
        },
      },
    });

    return (masters?.edges ?? []).map(({ node }) => node);
  } catch (error) {
    if (!isAccessError(error)) throw error;

    return [];
  }
};

const workersOf = (workers: Worker[], category: WorkerCategory): Choice[] =>
  workers
    .filter((worker) => (worker.categories ?? []).includes(category))
    .map((worker) => ({
      value: worker.id,
      label: joinFullName(worker.fullName) ?? '',
    }));

const ORDER_FIELDS = {
  id: true,
  name: true,
  status: true,
  clientFullName: { firstName: true, lastName: true },
  district: true,
  floor: true,
  materialState: true,
  materialNote: true,
  masterId: true,
  installerId: true,
  cancelReason: true,
} as const;

const MONEY_AND_PHONE_FIELDS = {
  clientPhone: true,
  total: MONEY,
  paid: MONEY,
  balance: MONEY,
} as const;

const NO_MONEY = {
  clientPhone: null,
  total: null,
  paid: null,
  balance: null,
} as const;

// A role that may not read the sums or the phone is refused the whole query,
// so it is asked again without them and the header shows the work alone.
const loadOrderNode = async (client: CoreApiClient, orderId: string) => {
  const byId = { filter: { id: { eq: orderId } }, first: 1 };

  try {
    const { orders } = await client.query({
      orders: {
        __args: byId,
        edges: { node: { ...ORDER_FIELDS, ...MONEY_AND_PHONE_FIELDS } },
      },
    });
    const node = orders?.edges[0]?.node;

    return node ? { ...node, canSeeMoney: true } : null;
  } catch (error) {
    if (!isAccessError(error)) throw error;

    const { orders } = await client.query({
      orders: { __args: byId, edges: { node: ORDER_FIELDS } },
    });
    const node = orders?.edges[0]?.node;

    return node ? { ...node, ...NO_MONEY, canSeeMoney: false } : null;
  }
};

// The order's козырьки that no проём is chosen for, and its проёмы to choose
// from. A role that may not read the services' catalogue (the workshop)
// gets neither rather than losing the header.
const loadVisorWork = async (
  client: CoreApiClient,
  orderId: string,
): Promise<
  Pick<HeaderOrder, 'visorsWithoutOpening' | 'openings' | 'nextOpeningNumber'>
> => {
  try {
    const byOrder = { orderId: { eq: orderId } };
    const { orderExtraServices, orderItems } = await client.query({
      orderExtraServices: {
        __args: { filter: byOrder, first: PAGE_SIZE },
        edges: {
          node: {
            id: true,
            name: true,
            orderItemId: true,
            openingNumber: true,
            extraService: { name: true, kind: true },
          },
        },
      },
      orderItems: {
        __args: {
          filter: byOrder,
          orderBy: [{ createdAt: 'AscNullsLast' }],
          first: PAGE_SIZE,
        },
        edges: { node: { id: true, name: true, openingNumber: true } },
      },
    });
    const lines = (orderExtraServices?.edges ?? []).map(({ node }) => node);
    const items = (orderItems?.edges ?? []).map(({ node }) => node);
    const numbers = numberOpenings(items);
    const itemIds = new Set(items.map((item) => item.id));
    // The first number no проём has: an old «только козырёк» line most
    // likely had the gap its проём left
    const usedNumbers = new Set([
      ...numbers,
      ...lines.flatMap((line) =>
        typeof line.openingNumber === 'number' ? [line.openingNumber] : [],
      ),
    ]);
    let nextOpeningNumber = 1;

    while (usedNumbers.has(nextOpeningNumber)) nextOpeningNumber++;

    return {
      visorsWithoutOpening: lines.flatMap((line) =>
        line.extraService?.kind === 'VISOR' &&
        // A проём deleted since keeps its id on the line
        !(line.orderItemId && itemIds.has(line.orderItemId)) &&
        typeof line.openingNumber !== 'number'
          ? [
              {
                id: line.id,
                name: line.extraService.name ?? line.name ?? 'Козырёк',
              },
            ]
          : [],
      ),
      openings: items
        .map((item, index) => ({
          value: item.id,
          label: [`Проём ${numbers[index]}`, item.name]
            .filter(Boolean)
            .join(' · '),
          number: numbers[index],
        }))
        .sort((left, right) => left.number - right.number)
        .map(({ value, label }) => ({ value, label })),
      nextOpeningNumber,
    };
  } catch (error) {
    if (!isAccessError(error)) throw error;

    return { visorsWithoutOpening: [], openings: [], nextOpeningNumber: 1 };
  }
};

export const loadOrderHeader = async (
  client: CoreApiClient,
  orderId: string,
): Promise<OrderHeaderData | null> => {
  const [node, { workspaceMembers }, workers, visorWork] = await Promise.all([
    loadOrderNode(client, orderId),
    client.query({
      workspaceMembers: {
        __args: { first: PAGE_SIZE },
        edges: {
          node: { id: true, name: { firstName: true, lastName: true } },
        },
      },
    }),
    loadActiveWorkers(client),
    loadVisorWork(client, orderId),
  ]);

  if (!node) return null;

  return {
    order: {
      id: node.id,
      name: node.name ?? '',
      status: node.status ?? null,
      clientName: joinFullName(node.clientFullName),
      clientPhone: node.clientPhone ?? null,
      districtLabel:
        DISTRICT_OPTIONS.find((option) => option.value === node.district)
          ?.label ?? null,
      floor: node.floor ?? null,
      materialState: node.materialState ?? null,
      materialNote: node.materialNote ?? null,
      total: fromCurrency(node.total),
      paid: fromCurrency(node.paid),
      balance: fromCurrency(node.balance),
      canSeeMoney: node.canSeeMoney,
      masterId: node.masterId ?? null,
      installerId: node.installerId ?? null,
      cancelReason: node.cancelReason ?? null,
      ...visorWork,
    },
    masters: workersOf(workers, 'MASTER'),
    installers: workersOf(workers, 'INSTALLER'),
    measurers: (workspaceMembers?.edges ?? []).map(({ node: member }) => ({
      value: member.id,
      label: joinFullName(member.name) ?? '',
    })),
    workers: workers.map((worker) => ({
      value: worker.id,
      label: joinFullName(worker.fullName) ?? '',
    })),
  };
};

export type OrderWriteOutcome = 'saved' | 'moved';

// The header is as old as its last load: the update is filtered on the order
// still being in the status the header showed, so one that somebody else has
// moved or cancelled meanwhile is left where it is.
const updateOrderInStatus = async (
  client: CoreApiClient,
  orderId: string,
  shownStatus: OrderStatus | null,
  data: StepWrite | { status: OrderStatus; cancelReason: CancelReason },
): Promise<OrderWriteOutcome> => {
  const { updateOrders } = await client.mutation({
    updateOrders: {
      __args: {
        filter: {
          id: { eq: orderId },
          status: shownStatus === null ? { is: 'NULL' } : { eq: shownStatus },
        },
        data,
      },
      id: true,
    },
  });

  return (updateOrders ?? []).length > 0 ? 'saved' : 'moved';
};

export const writeStep = (
  client: CoreApiClient,
  orderId: string,
  shownStatus: OrderStatus | null,
  data: StepWrite,
): Promise<OrderWriteOutcome> =>
  updateOrderInStatus(client, orderId, shownStatus, data);

export const cancelOrder = (
  client: CoreApiClient,
  orderId: string,
  shownStatus: OrderStatus | null,
  cancelReason: CancelReason,
): Promise<OrderWriteOutcome> =>
  updateOrderInStatus(client, orderId, shownStatus, {
    status: STEP_STATUS.cancelled,
    cancelReason,
  });

// No name is sent: the payment's trigger writes it. The id belongs to one
// attempt of the user: a request whose answer was lost may already be stored,
// and its retry must overwrite that record, not add one.
export const acceptPayment = async (
  client: CoreApiClient,
  id: string,
  payment: {
    orderId: string;
    amount: number;
    method: PaymentMethod;
    comment: string;
    paidOn: string;
    // The worker who took the cash, when it did not reach the business yet
    receivedById?: string | null;
  },
): Promise<void> => {
  const { receivedById, ...fields } = payment;

  await client.mutation({
    createOrderPayment: {
      __args: {
        data: {
          id,
          ...fields,
          amount: toCurrency(payment.amount),
          ...(receivedById ? { receivedById } : {}),
        },
        upsert: true,
      },
      id: true,
    },
  });
};

// Apart from the order as well: the workshop reads orders and no payments.
export const isPaymentStored = async (
  client: CoreApiClient,
  id: string,
): Promise<boolean> => {
  const { orderPayments } = await client.query({
    orderPayments: {
      __args: { filter: { id: { eq: id } }, first: 1 },
      edges: { node: { id: true } },
    },
  });

  return (orderPayments?.edges ?? []).length > 0;
};

// A standalone page is opened by the id its layout has in this workspace,
// which differs from the universalIdentifier the app declares.
export const findMeasurementFormPageId = async (
  client: MetadataApiClient,
): Promise<string | null> => {
  const { getPageLayouts } = await client.query({
    getPageLayouts: {
      __args: { pageLayoutType: 'STANDALONE_PAGE' },
      id: true,
      universalIdentifier: true,
    },
  });

  return (
    (getPageLayouts ?? []).find(
      (candidate) =>
        candidate.universalIdentifier === IDS.measurerForm.pageLayout,
    )?.id ?? null
  );
};

// The form reads the handed-over order once and forgets it. An order that was
// remembered for a page that never opened would be picked on the next visit
// from the menu, so it is forgotten here. False means the person has to pick
// the order in the form themselves.
export const openWithHandOff = async ({
  remember,
  forget,
  open,
}: {
  remember: () => void;
  forget: () => void;
  open: () => Promise<void>;
}): Promise<boolean> => {
  try {
    remember();
  } catch {
    return false;
  }

  try {
    // Awaited inside the try: opening can throw at once or reject later.
    await open();

    return true;
  } catch {
    try {
      forget();
    } catch {
      // Storage that cannot forget cannot be read by the form either.
    }

    return false;
  }
};

export const setVisorOpening = async (
  client: CoreApiClient,
  lineId: string,
  opening: { orderItemId: string } | { openingNumber: number },
): Promise<void> => {
  await client.mutation({
    updateOrderExtraService: {
      __args: { id: lineId, data: opening },
      id: true,
    },
  });
};
