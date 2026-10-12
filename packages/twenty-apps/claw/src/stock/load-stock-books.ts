import { type CoreApiClient } from 'twenty-client-sdk/core';

import {
  type OrderStatus,
  type StockMovementKind,
  type Wallet,
} from 'src/constants/select-options';
import { fromCurrency, toCurrency } from 'src/recalc/money';
import {
  type LedgerMovement,
  type ManualOutKind,
  type PurchaseRecord,
  type SupplierPayment,
  type SupplierRecord,
} from 'src/stock/stock-ledger';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';
import { isAccessError } from 'src/utils/is-access-error';

// Everything the Приход, Расход and Отчёт tabs are built from.
export type StockBooks = {
  movements: LedgerMovement[];
  orderNames: Record<string, string>;
  purchases: PurchaseRecord[];
  invoicePhotoCounts: Record<string, number>;
  suppliers: SupplierRecord[];
  // Null for a role that may not read money entries: it sees no debts
  payments: SupplierPayment[] | null;
  // Orders material can still go to, newest first
  orders: { id: string; name: string }[];
  // Deleted materials are no longer on the shelf
  removedMaterialIds: string[];
};

const PAGE_SIZE = 200;
const ORDER_CHOICES = 60;
const MONEY = { amountMicros: true } as const;
// Material goes to an order from the measurement on; a new or cancelled
// order has nothing to take.
const ORDERS_TAKING_MATERIAL: readonly OrderStatus[] = [
  'MEASURED',
  'PRODUCTION',
  'QUALITY_CHECK',
  'INSTALLED',
];

const toDate = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value).slice(0, 10);

const MOVEMENT_FIELDS = {
  id: true,
  kind: true,
  materialId: true,
  quantity: true,
  countedQuantity: true,
  date: true,
  createdAt: true,
  orderId: true,
  purchaseId: true,
  comment: true,
  order: { name: true },
} as const;

const loadMovements = async (client: CoreApiClient, canSeePrice: boolean) =>
  fetchAllPages(async (after) => {
    const { stockMovements } = await client.query({
      stockMovements: {
        __args: { first: PAGE_SIZE, after },
        edges: {
          // The price field may not even be named for a role that cannot read it.
          node: canSeePrice
            ? { ...MOVEMENT_FIELDS, unitPrice: MONEY }
            : MOVEMENT_FIELDS,
        },
        pageInfo: PAGE_INFO,
      },
    });

    return stockMovements;
  });

const loadSupplierPayments = async (
  client: CoreApiClient,
): Promise<SupplierPayment[] | null> => {
  try {
    const nodes = await fetchAllPages(async (after) => {
      const { moneyEntries } = await client.query({
        moneyEntries: {
          __args: {
            first: PAGE_SIZE,
            after,
            filter: { kind: { eq: 'SUPPLIER_PAYMENT' } },
          },
          edges: {
            node: {
              id: true,
              amount: MONEY,
              date: true,
              supplierId: true,
              purchaseId: true,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return moneyEntries;
    });

    return nodes.map((node) => ({
      id: node.id,
      amount: fromCurrency(node.amount) ?? 0,
      date: toDate(node.date),
      supplierId: node.supplierId ?? null,
      purchaseId: node.purchaseId ?? null,
    }));
  } catch (error) {
    if (!isAccessError(error)) throw error;

    return null;
  }
};

export const loadStockBooks = async (
  client: CoreApiClient,
  canSeePrice: boolean,
): Promise<StockBooks> => {
  const [
    movementNodes,
    purchaseNodes,
    supplierNodes,
    payments,
    orderPage,
    removedMaterialNodes,
  ] = await Promise.all([
    loadMovements(client, canSeePrice),
    fetchAllPages(async (after) => {
      const { purchases } = await client.query({
        purchases: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              id: true,
              date: true,
              createdAt: true,
              supplierId: true,
              comment: true,
              invoicePhotos: { fileId: true },
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return purchases;
    }),
    fetchAllPages(async (after) => {
      const { suppliers } = await client.query({
        suppliers: {
          __args: { first: PAGE_SIZE, after },
          edges: { node: { id: true, name: true } },
          pageInfo: PAGE_INFO,
        },
      });

      return suppliers;
    }),
    canSeePrice ? loadSupplierPayments(client) : null,
    client.query({
      orders: {
        __args: {
          first: ORDER_CHOICES,
          filter: { status: { in: [...ORDERS_TAKING_MATERIAL] } },
          orderBy: [{ number: 'DescNullsLast' }],
        },
        edges: { node: { id: true, name: true } },
      },
    }),
    fetchAllPages(async (after) => {
      const { materials } = await client.query({
        materials: {
          __args: {
            first: PAGE_SIZE,
            after,
            filter: { deletedAt: { is: 'NOT_NULL' } },
          },
          edges: { node: { id: true } },
          pageInfo: PAGE_INFO,
        },
      });

      return materials;
    }),
  ]);

  const orderNames: Record<string, string> = {};
  const movements = movementNodes.map((node): LedgerMovement => {
    if (node.orderId && node.order?.name) {
      orderNames[node.orderId] = node.order.name;
    }

    return {
      id: node.id,
      kind: (node.kind ?? null) as StockMovementKind | null,
      materialId: node.materialId ?? null,
      quantity: node.quantity ?? null,
      countedQuantity: node.countedQuantity ?? null,
      unitPrice:
        'unitPrice' in node
          ? fromCurrency(node.unitPrice as { amountMicros?: number | null })
          : null,
      date: toDate(node.date),
      createdAt: String(node.createdAt),
      orderId: node.orderId ?? null,
      purchaseId: node.purchaseId ?? null,
      comment: node.comment || null,
    };
  });
  const orders = (orderPage.orders?.edges ?? []).map(({ node }) => ({
    id: node.id,
    name: node.name || 'Заказ',
  }));

  for (const order of orders) orderNames[order.id] = order.name;

  return {
    movements,
    orderNames,
    removedMaterialIds: removedMaterialNodes.map((node) => node.id),
    purchases: purchaseNodes.map((node) => ({
      id: node.id,
      date: toDate(node.date),
      createdAt: String(node.createdAt),
      supplierId: node.supplierId ?? null,
      comment: node.comment || null,
    })),
    invoicePhotoCounts: Object.fromEntries(
      purchaseNodes.map((node) => [node.id, node.invoicePhotos?.length ?? 0]),
    ),
    suppliers: supplierNodes.map((node) => ({
      id: node.id,
      name: node.name || 'Без названия',
    })),
    payments,
    orders,
  };
};

export const createSupplier = async (
  client: CoreApiClient,
  id: string,
  name: string,
): Promise<void> => {
  await client.mutation({
    createSupplier: { __args: { data: { id, name }, upsert: true }, id: true },
  });
};

export const createPurchase = async (
  client: CoreApiClient,
  id: string,
  data: {
    name: string;
    date: string;
    supplierId: string | null;
    comment: string | null;
  },
): Promise<void> => {
  await client.mutation({
    createPurchase: {
      __args: { data: { id, ...data }, upsert: true },
      id: true,
    },
  });
};

export type PurchaseLineEntry = {
  // The form line it came from: a retried save writes it under the same id
  key: string;
  // The stored line a changed purchase keeps
  movementId?: string;
  materialId: string;
  quantity: number;
  // Null when left empty, and always for a role that may not write prices
  unitPrice: number | null;
};

// No name is sent: the stock recalc writes the movement's name itself. A role
// that may not write prices sends no price; for one that may, a bare null
// would leave a price cleared on edit as it was, so the amount is nulled.
export const createPurchaseLine = async (
  client: CoreApiClient,
  id: string,
  purchase: { id: string; date: string },
  line: PurchaseLineEntry,
  canWritePrice: boolean,
): Promise<void> => {
  const data = {
    id,
    kind: 'RECEIPT' as const,
    materialId: line.materialId,
    quantity: line.quantity,
    date: purchase.date,
    purchaseId: purchase.id,
  };

  await client.mutation({
    createStockMovement: {
      __args: {
        data: canWritePrice
          ? {
              ...data,
              unitPrice: toCurrency(line.unitPrice) ?? {
                amountMicros: null,
                currencyCode: 'UZS',
              },
            }
          : data,
        upsert: true,
      },
      id: true,
    },
  });
};

export type StockOutEntry = {
  kind: ManualOutKind;
  materialId: string;
  // As typed: how much went, above zero
  quantity: number;
  date: string;
  orderId: string | null;
  comment: string | null;
};

export const createStockOut = async (
  client: CoreApiClient,
  id: string,
  entry: StockOutEntry,
): Promise<void> => {
  await client.mutation({
    createStockMovement: {
      __args: {
        data: {
          id,
          kind: entry.kind,
          materialId: entry.materialId,
          quantity: -entry.quantity,
          date: entry.date,
          ...(entry.orderId === null ? {} : { orderId: entry.orderId }),
          ...(entry.comment === null ? {} : { comment: entry.comment }),
        },
        upsert: true,
      },
      id: true,
    },
  });
};

export type SupplierPaymentEntry = {
  name: string;
  amount: number;
  wallet: Wallet;
  date: string;
  supplierId: string | null;
  purchaseId: string | null;
  comment: string | null;
};

export const supplierPaymentName = (supplierName: string | null) =>
  `Оплата поставщику${supplierName ? ` · ${supplierName}` : ''}`;

export const createSupplierPayment = async (
  client: CoreApiClient,
  id: string,
  entry: SupplierPaymentEntry,
): Promise<void> => {
  await client.mutation({
    createMoneyEntry: {
      __args: {
        data: {
          id,
          kind: 'SUPPLIER_PAYMENT',
          name: entry.name,
          amount: toCurrency(entry.amount),
          wallet: entry.wallet,
          date: entry.date,
          ...(entry.supplierId === null
            ? {}
            : { supplierId: entry.supplierId }),
          ...(entry.purchaseId === null
            ? {}
            : { purchaseId: entry.purchaseId }),
          ...(entry.comment === null ? {} : { comment: entry.comment }),
        },
        upsert: true,
      },
      id: true,
    },
  });
};

// The payments made with a purchase follow it to its new supplier, or the
// debt would stay on the old one.
export const moveSupplierPayments = async (
  client: CoreApiClient,
  ids: string[],
  supplier: { id: string | null; name: string | null },
): Promise<void> => {
  if (ids.length === 0) return;

  await client.mutation({
    updateMoneyEntries: {
      __args: {
        filter: { id: { in: ids } },
        data: {
          supplierId: supplier.id,
          name: supplierPaymentName(supplier.name),
        },
      },
      id: true,
    },
  });
};

export const deleteSupplierPayments = async (
  client: CoreApiClient,
  ids: string[],
): Promise<void> => {
  if (ids.length === 0) return;

  await client.mutation({
    deleteMoneyEntries: {
      __args: { filter: { id: { in: ids } } },
      id: true,
    },
  });
};

export const attachInvoicePhotos = async (
  client: CoreApiClient,
  purchaseId: string,
  photos: { fileId: string; label: string }[],
): Promise<void> => {
  await client.mutation({
    updatePurchase: {
      __args: { id: purchaseId, data: { invoicePhotos: photos } },
      id: true,
    },
  });
};

// The whole movement is written again, so a comment or an order taken out of
// the form is cleared, not kept.
export const updateStockOut = async (
  client: CoreApiClient,
  id: string,
  entry: StockOutEntry,
): Promise<void> => {
  await client.mutation({
    updateStockMovement: {
      __args: {
        id,
        data: {
          kind: entry.kind,
          materialId: entry.materialId,
          quantity: -entry.quantity,
          date: entry.date,
          orderId: entry.orderId,
          comment: entry.comment,
        },
      },
      id: true,
    },
  });
};

export const deleteStockMovements = async (
  client: CoreApiClient,
  ids: string[],
): Promise<void> => {
  if (ids.length === 0) return;

  await client.mutation({
    deleteStockMovements: {
      __args: { filter: { id: { in: ids } } },
      id: true,
    },
  });
};

export const restoreStockMovements = async (
  client: CoreApiClient,
  ids: string[],
): Promise<void> => {
  if (ids.length === 0) return;

  await client.mutation({
    restoreStockMovements: {
      __args: { filter: { id: { in: ids } } },
      id: true,
    },
  });
};

// A purchase leaves with its lines and the payments made for it, and comes
// back with the same ones.
export type PurchaseRemoval = {
  purchaseId: string | null;
  movementIds: string[];
  paymentIds: string[];
};

export const deletePurchase = async (
  client: CoreApiClient,
  removal: PurchaseRemoval,
): Promise<void> => {
  await deleteSupplierPayments(client, removal.paymentIds);
  await deleteStockMovements(client, removal.movementIds);

  if (removal.purchaseId !== null) {
    await client.mutation({
      deletePurchase: { __args: { id: removal.purchaseId }, id: true },
    });
  }
};

export const restorePurchase = async (
  client: CoreApiClient,
  removal: PurchaseRemoval,
): Promise<void> => {
  if (removal.purchaseId !== null) {
    await client.mutation({
      restorePurchase: { __args: { id: removal.purchaseId }, id: true },
    });
  }

  await restoreStockMovements(client, removal.movementIds);

  if (removal.paymentIds.length > 0) {
    await client.mutation({
      restoreMoneyEntries: {
        __args: { filter: { id: { in: removal.paymentIds } } },
        id: true,
      },
    });
  }
};

export const renameSupplier = async (
  client: CoreApiClient,
  id: string,
  name: string,
): Promise<void> => {
  await client.mutation({
    updateSupplier: { __args: { id, data: { name } }, id: true },
  });
};
