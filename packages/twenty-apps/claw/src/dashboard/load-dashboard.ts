import { type CoreApiClient } from 'twenty-client-sdk/core';
import { type MetadataApiClient } from 'twenty-client-sdk/metadata';

import {
  type ClientCard,
  loadCallBackClients,
  personName,
} from 'src/clients/load-clients';
import { DISTRICT_OPTIONS } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { formatUzbekNationalPhone } from 'src/measurer-form/measurer-form';
import { todayInTashkent } from 'src/pricing/dates';
import { fromCurrency } from 'src/recalc/money';
import { loadStockBooks } from 'src/stock/load-stock-books';
import { loadStockData } from 'src/stock/load-stock-data';
import {
  summarizePurchases,
  summarizeSuppliers,
  valueStockMovements,
} from 'src/stock/stock-ledger';
import { buildBuyList, type BuyLine } from 'src/stock/stock-screen';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';

// Twenty caps a page at 200 records.
const PAGE_SIZE = 200;
const MONEY = { amountMicros: true } as const;
const TIME_ZONE = 'Asia/Tashkent';

export type DashboardOrder = {
  id: string;
  name: string;
  status: string | null;
  clientName: string;
  phone: string | null;
  place: string | null;
  // The calendar day and the hour of the planned measurement, in Tashkent
  measurementDay: string | null;
  measurementTime: string | null;
  createdOn: string;
  measuredOn: string | null;
  productionStart: string | null;
  deadline: string | null;
  readyAt: string | null;
  installedAt: string | null;
  productionStage: string | null;
  isUrgent: boolean;
  area: number | null;
  total: number | null;
  paid: number | null;
  balance: number | null;
  margin: number | null;
  source: string | null;
  cancelReason: string | null;
  measurerName: string | null;
  masterName: string | null;
  installerName: string | null;
};

export type DashboardPayment = { paidOn: string; amount: number };

export type DashboardItem = {
  orderId: string;
  kindName: string | null;
  area: number;
};

export type SupplierDebt = { id: string; name: string; debt: number };

export type DataChecks = {
  materials: { total: number; priced: number };
  designs: { total: number; withComposition: number };
  masters: { total: number; withRate: number };
};

export type PageIds = Partial<
  Record<
    | 'newMeasurement'
    | 'stock'
    | 'workshop'
    | 'payroll'
    | 'callBacks'
    | 'marketing',
    string
  >
>;

export type TodayData = {
  today: string;
  orders: DashboardOrder[];
  payments: DashboardPayment[];
  callBackClients: ClientCard[];
  buyLines: BuyLine[];
  supplierDebts: SupplierDebt[];
};

export type AnalyticsData = {
  today: string;
  orders: DashboardOrder[];
  payments: DashboardPayment[];
  items: DashboardItem[];
  checks: DataChecks;
};

type Name = { firstName?: string | null; lastName?: string | null } | null;

const textOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';

  return trimmed === '' ? null : trimmed;
};

const toDay = (value: unknown): string | null =>
  value === null || value === undefined || value === ''
    ? null
    : String(value).slice(0, 10);

// Created and measured are moments; the screens count calendar days in Tashkent.
const toTashkentDay = (value: unknown): string | null =>
  value === null || value === undefined || value === ''
    ? null
    : todayInTashkent(new Date(String(value)));

const toTashkentTime = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;

  const time = new Intl.DateTimeFormat('ru-RU', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(String(value)));

  // A visit booked for a day with no hour is stored at midnight.
  return time === '00:00' ? null : time;
};

const nameOrNull = (name: Name | undefined): string | null => {
  const full = personName(name);

  return full === 'Без имени' ? null : full;
};

const placeOf = (
  addressLine: string | null | undefined,
  district: string | null | undefined,
): string | null =>
  [
    DISTRICT_OPTIONS.find((option) => option.value === district)?.label,
    textOrNull(addressLine),
  ]
    .filter((part) => part !== undefined && part !== null)
    .join(', ') || null;

const loadOrders = async (client: CoreApiClient): Promise<DashboardOrder[]> => {
  const nodes = await fetchAllPages(async (after) => {
    const { orders } = await client.query({
      orders: {
        __args: { first: PAGE_SIZE, after },
        edges: {
          node: {
            id: true,
            name: true,
            status: true,
            clientFullName: { firstName: true, lastName: true },
            clientPhone: true,
            addressLine: true,
            district: true,
            measurementDate: true,
            createdAt: true,
            measuredAt: true,
            productionStartDate: true,
            installationDeadline: true,
            readyAt: true,
            installedAt: true,
            productionStage: true,
            urgency: true,
            areaSquareMeters: true,
            total: MONEY,
            paid: MONEY,
            balance: MONEY,
            margin: MONEY,
            source: true,
            cancelReason: true,
            measurer: { name: { firstName: true, lastName: true } },
            master: { name: true },
            installer: { name: true },
          },
        },
        pageInfo: PAGE_INFO,
      },
    });

    return orders;
  });

  return nodes.map((node) => ({
    id: node.id,
    name: textOrNull(node.name) ?? 'Заказ',
    status: node.status ?? null,
    clientName: personName(node.clientFullName),
    phone:
      textOrNull(node.clientPhone) === null
        ? null
        : formatUzbekNationalPhone(String(node.clientPhone)),
    place: placeOf(node.addressLine, node.district),
    measurementDay: toTashkentDay(node.measurementDate),
    measurementTime: toTashkentTime(node.measurementDate),
    createdOn: toTashkentDay(node.createdAt) ?? '',
    measuredOn: toTashkentDay(node.measuredAt),
    productionStart: toDay(node.productionStartDate),
    deadline: toDay(node.installationDeadline),
    readyAt: toDay(node.readyAt),
    installedAt: toDay(node.installedAt),
    productionStage: node.productionStage ?? null,
    isUrgent: node.urgency === 'URGENT',
    area:
      node.areaSquareMeters === null || node.areaSquareMeters === undefined
        ? null
        : Number(node.areaSquareMeters),
    total: fromCurrency(node.total),
    paid: fromCurrency(node.paid),
    balance: fromCurrency(node.balance),
    margin: fromCurrency(node.margin),
    source: node.source ?? null,
    cancelReason: node.cancelReason ?? null,
    measurerName: nameOrNull(node.measurer?.name),
    masterName: textOrNull(node.master?.name),
    installerName: textOrNull(node.installer?.name),
  }));
};

const loadPayments = async (
  client: CoreApiClient,
): Promise<DashboardPayment[]> => {
  const nodes = await fetchAllPages(async (after) => {
    const { orderPayments } = await client.query({
      orderPayments: {
        __args: { first: PAGE_SIZE, after },
        edges: { node: { paidOn: true, amount: MONEY } },
        pageInfo: PAGE_INFO,
      },
    });

    return orderPayments;
  });

  return nodes.flatMap((node) => {
    const paidOn = toDay(node.paidOn);
    const amount = fromCurrency(node.amount);

    return paidOn === null || amount === null ? [] : [{ paidOn, amount }];
  });
};

const loadItems = async (client: CoreApiClient): Promise<DashboardItem[]> => {
  const nodes = await fetchAllPages(async (after) => {
    const { orderItems } = await client.query({
      orderItems: {
        __args: { first: PAGE_SIZE, after },
        edges: {
          node: {
            orderId: true,
            quantity: true,
            areaSquareMeters: true,
            design: { grilleKind: { name: true } },
          },
        },
        pageInfo: PAGE_INFO,
      },
    });

    return orderItems;
  });

  return nodes.flatMap((node) =>
    node.orderId
      ? [
          {
            orderId: node.orderId,
            kindName: textOrNull(node.design?.grilleKind?.name),
            area:
              Number(node.areaSquareMeters ?? 0) * Number(node.quantity ?? 1),
          },
        ]
      : [],
  );
};

const loadChecks = async (
  client: CoreApiClient,
  pricedMaterials: number,
  materialCount: number,
): Promise<DataChecks> => {
  const [designNodes, normNodes, masterNodes, ruleNodes, rateNodes] =
    await Promise.all([
      fetchAllPages(async (after) => {
        const { designs } = await client.query({
          designs: {
            __args: { first: PAGE_SIZE, after },
            edges: { node: { id: true } },
            pageInfo: PAGE_INFO,
          },
        });

        return designs;
      }),
      fetchAllPages(async (after) => {
        const { materialNorms } = await client.query({
          materialNorms: {
            __args: { first: PAGE_SIZE, after },
            edges: { node: { designId: true } },
            pageInfo: PAGE_INFO,
          },
        });

        return materialNorms;
      }),
      fetchAllPages(async (after) => {
        const { masters } = await client.query({
          masters: {
            __args: { first: PAGE_SIZE, after },
            edges: { node: { id: true, isActive: true, categories: true } },
            pageInfo: PAGE_INFO,
          },
        });

        return masters;
      }),
      fetchAllPages(async (after) => {
        const { payRules } = await client.query({
          payRules: {
            __args: { first: PAGE_SIZE, after },
            edges: { node: { workerId: true, work: true } },
            pageInfo: PAGE_INFO,
          },
        });

        return payRules;
      }),
      fetchAllPages(async (after) => {
        const { workshopRates } = await client.query({
          workshopRates: {
            __args: { first: PAGE_SIZE, after },
            edges: { node: { workerId: true } },
            pageInfo: PAGE_INFO,
          },
        });

        return workshopRates;
      }),
    ]);

  const composed = new Set(normNodes.map((node) => node.designId));
  const workshopMasters = masterNodes.filter(
    (node) =>
      node.isActive !== false &&
      (node.categories ?? []).some((category) => category === 'MASTER'),
  );
  // A rate with no worker is the usual one for its kind: every master has it.
  const hasCommonRate = rateNodes.some((node) => !node.workerId);
  const ratedWorkers = new Set([
    ...rateNodes.map((node) => node.workerId),
    ...ruleNodes
      .filter((node) => node.work === 'MASTER')
      .map((node) => node.workerId),
  ]);

  return {
    materials: { total: materialCount, priced: pricedMaterials },
    designs: {
      total: designNodes.length,
      withComposition: designNodes.filter((node) => composed.has(node.id))
        .length,
    },
    masters: {
      total: workshopMasters.length,
      withRate: hasCommonRate
        ? workshopMasters.length
        : workshopMasters.filter((node) => ratedWorkers.has(node.id)).length,
    },
  };
};

export const loadToday = async (client: CoreApiClient): Promise<TodayData> => {
  const [orders, payments, callBackClients, stock] = await Promise.all([
    loadOrders(client),
    loadPayments(client),
    loadCallBackClients(client),
    loadStockData(client),
  ]);
  const books = await loadStockBooks(client, stock.canSeePrice);
  const supplierPayments = books.payments ?? [];
  const purchases = summarizePurchases({
    purchases: books.purchases,
    suppliers: books.suppliers,
    valued: valueStockMovements(books.movements),
    payments: supplierPayments,
  });

  return {
    today: todayInTashkent(),
    orders,
    payments,
    callBackClients,
    buyLines: buildBuyList(stock.materials, stock.prices).lines,
    supplierDebts: summarizeSuppliers({
      suppliers: books.suppliers,
      purchases,
      payments: supplierPayments,
    })
      .filter((supplier) => supplier.debt > 0)
      .map(({ id, name, debt }) => ({ id, name, debt })),
  };
};

export const loadAnalytics = async (
  client: CoreApiClient,
): Promise<AnalyticsData> => {
  const [orders, payments, items, stock] = await Promise.all([
    loadOrders(client),
    loadPayments(client),
    loadItems(client),
    loadStockData(client),
  ]);
  const pricedMaterials = stock.materials.filter((material) => {
    const price = stock.prices[material.id];

    return (price?.average ?? 0) > 0 || (price?.last ?? 0) > 0;
  }).length;

  return {
    today: todayInTashkent(),
    orders,
    payments,
    items,
    checks: await loadChecks(client, pricedMaterials, stock.materials.length),
  };
};

const PAGE_IDENTIFIERS: Record<keyof PageIds, string> = {
  newMeasurement: IDS.measurerForm.pageLayout,
  stock: IDS.stock.pageLayout,
  workshop: IDS.workshop.pageLayout,
  payroll: IDS.payroll.pageLayout,
  callBacks: IDS.callBacks.pageLayout,
  marketing: IDS.marketing.pageLayout,
};

// A standalone page is opened by the id its layout has in this workspace,
// which differs from the universalIdentifier the app declares.
export const findPageIds = async (
  client: MetadataApiClient,
): Promise<PageIds> => {
  const { getPageLayouts } = await client.query({
    getPageLayouts: {
      __args: { pageLayoutType: 'STANDALONE_PAGE' },
      id: true,
      universalIdentifier: true,
    },
  });
  const layouts = getPageLayouts ?? [];

  return Object.fromEntries(
    Object.entries(PAGE_IDENTIFIERS).flatMap(([key, universalIdentifier]) => {
      const id = layouts.find(
        (layout) => layout.universalIdentifier === universalIdentifier,
      )?.id;

      return id === undefined ? [] : [[key, id]];
    }),
  );
};
