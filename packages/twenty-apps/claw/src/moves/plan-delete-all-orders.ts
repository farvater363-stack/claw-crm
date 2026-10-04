// Orders first: recalcOrder stops when its order is not found, so the triggers
// fired by every deleted child read once and write nothing back. Children
// first would let those recalcs rewrite accrual and material lines of an order
// that still exists. Stock movements last: their trigger recalculates the
// warehouse after the material lines are gone.
export const DELETE_STEPS = [
  {
    plural: 'orders',
    mutation: 'deleteOrders',
    label: 'orders',
    onlyWithOrder: false,
  },
  {
    plural: 'orderPayments',
    mutation: 'deleteOrderPayments',
    label: 'payments',
    onlyWithOrder: false,
  },
  {
    plural: 'payAccruals',
    mutation: 'deletePayAccruals',
    label: 'accruals of orders',
    onlyWithOrder: true,
  },
  {
    plural: 'orderItems',
    mutation: 'deleteOrderItems',
    label: 'positions',
    onlyWithOrder: false,
  },
  {
    plural: 'orderExtraServices',
    mutation: 'deleteOrderExtraServices',
    label: 'service lines',
    onlyWithOrder: false,
  },
  {
    plural: 'orderMaterials',
    mutation: 'deleteOrderMaterials',
    label: 'material lines',
    onlyWithOrder: false,
  },
  {
    plural: 'stockMovements',
    mutation: 'deleteStockMovements',
    label: 'stock movements of orders',
    onlyWithOrder: true,
  },
] as const;

// A payout names a worker, never an order, so it is kept unless the run asks
// for all of them to go.
export const PAYOUT_STEP = {
  plural: 'masterPayments',
  mutation: 'deleteMasterPayments',
  label: 'payouts to workers',
  onlyWithOrder: false,
} as const;

export const READ_STEPS = [...DELETE_STEPS, PAYOUT_STEP] as const;

export type DeleteObject = (typeof READ_STEPS)[number]['plural'];

// Each deleted position, service line or payment starts one function run of
// up to two requests, and the app's functions share 500 requests a minute.
export const DELETE_BATCH_SIZE = 20;

export type DeleteConfirmationInput = {
  apiUrl: string;
  confirmation: string | undefined;
  apply: boolean;
};

export type DeleteAllOrdersInput = DeleteConfirmationInput & {
  deletePayouts: boolean;
  idsByObject: Record<DeleteObject, string[]>;
};

export type DeleteBatch = { mutation: string; label: string; ids: string[] };

export type DeleteAllOrdersPlan = {
  hostName: string;
  counts: { label: string; count: number }[];
  payoutsKept: number | null;
  batches: DeleteBatch[];
  refusal: string | null;
};

const inBatches = (ids: string[]): string[][] =>
  Array.from({ length: Math.ceil(ids.length / DELETE_BATCH_SIZE) }, (_, index) =>
    ids.slice(index * DELETE_BATCH_SIZE, (index + 1) * DELETE_BATCH_SIZE),
  );

export const checkDeleteConfirmation = ({
  apiUrl,
  confirmation,
  apply,
}: DeleteConfirmationInput): { hostName: string; refusal: string | null } => {
  const hostName = new URL(apiUrl).hostname;

  return {
    hostName,
    // The value names the server, so a command copied from the local run
    // cannot delete anywhere else.
    refusal:
      apply && confirmation !== hostName
        ? `Refusing to delete on ${hostName}: CONFIRM_DELETE_ALL_ORDERS must equal "${hostName}".`
        : null,
  };
};

export const planDeleteAllOrders = ({
  deletePayouts,
  idsByObject,
  ...confirmationInput
}: DeleteAllOrdersInput): DeleteAllOrdersPlan => {
  const steps = deletePayouts ? READ_STEPS : DELETE_STEPS;

  return {
    ...checkDeleteConfirmation(confirmationInput),
    counts: steps.map(({ plural, label }) => ({
      label,
      count: idsByObject[plural].length,
    })),
    payoutsKept: deletePayouts ? null : idsByObject.masterPayments.length,
    batches: steps.flatMap(({ plural, mutation, label }) =>
      inBatches(idsByObject[plural]).map((ids) => ({ mutation, label, ids })),
    ),
  };
};
