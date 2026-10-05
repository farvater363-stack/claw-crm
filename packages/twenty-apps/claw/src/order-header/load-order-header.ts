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
import { fromCurrency, toCurrency } from 'src/recalc/money';
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
  masterId: string | null;
  installerId: string | null;
  cancelReason: string | null;
};

export type OrderHeaderData = {
  order: HeaderOrder;
  masters: Choice[];
  installers: Choice[];
  measurers: Choice[];
};

// Twenty caps a page at 200 records; a shop has far fewer workers and logins.
const PAGE_SIZE = 200;
const MONEY = { amountMicros: true } as const;

type Worker = {
  id: string;
  name?: string | null;
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
          orderBy: [{ name: 'AscNullsLast' }],
          first: PAGE_SIZE,
        },
        edges: { node: { id: true, name: true, categories: true } },
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
    .map((worker) => ({ value: worker.id, label: worker.name ?? '' }));

export const loadOrderHeader = async (
  client: CoreApiClient,
  orderId: string,
): Promise<OrderHeaderData | null> => {
  const [{ orders, workspaceMembers }, workers] = await Promise.all([
    client.query({
      orders: {
        __args: { filter: { id: { eq: orderId } }, first: 1 },
        edges: {
          node: {
            id: true,
            name: true,
            status: true,
            clientName: true,
            clientPhone: true,
            district: true,
            floor: true,
            materialState: true,
            materialNote: true,
            total: MONEY,
            paid: MONEY,
            balance: MONEY,
            masterId: true,
            installerId: true,
            cancelReason: true,
          },
        },
      },
      workspaceMembers: {
        __args: { first: PAGE_SIZE },
        edges: {
          node: { id: true, name: { firstName: true, lastName: true } },
        },
      },
    }),
    loadActiveWorkers(client),
  ]);

  const node = orders?.edges[0]?.node;

  if (!node) return null;

  return {
    order: {
      id: node.id,
      name: node.name ?? '',
      status: node.status ?? null,
      clientName: node.clientName ?? null,
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
      masterId: node.masterId ?? null,
      installerId: node.installerId ?? null,
      cancelReason: node.cancelReason ?? null,
    },
    masters: workersOf(workers, 'MASTER'),
    installers: workersOf(workers, 'INSTALLER'),
    measurers: (workspaceMembers?.edges ?? []).map(({ node: member }) => ({
      value: member.id,
      label: [member.name?.firstName, member.name?.lastName]
        .filter(Boolean)
        .join(' '),
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
  },
): Promise<void> => {
  await client.mutation({
    createOrderPayment: {
      __args: {
        data: { id, ...payment, amount: toCurrency(payment.amount) },
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
