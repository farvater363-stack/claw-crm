import { CoreApiClient } from 'twenty-client-sdk/core';
import { it } from 'vitest';

import {
  diffSnapshots,
  filledFromGrille,
  grilleData,
  positionsFilledAtRecalc,
  priceRowsNotCarriedOver,
  priceWriteBacks,
  type SnapshotDifference,
  withoutAppliedWrites,
} from '../src/migration/inspect-catalog-migration';
import { planCatalogMigration } from '../src/migration/plan-catalog-migration';
import { fromCurrency, toCurrency } from '../src/recalc/money';
import { fetchAllPages, PAGE_INFO } from '../src/utils/fetch-all-pages';

const client = new CoreApiClient();

const PAGE_SIZE = 200;
// The API key allows 100 requests a minute, reads included.
const REQUEST_PAUSE_MILLISECONDS = 700;
const RECALC_WAIT_MILLISECONDS = 90_000;
const RUN_TIMEOUT_MILLISECONDS = 30 * 60_000;

const ITEM_FIELDS = [
  'pricePerSquareMeter',
  'costPerSquareMeter',
  'lineTotal',
] as const;
const ORDER_FIELDS = [
  'total',
  'costTotal',
  'margin',
  'masterPayTotal',
] as const;

const money = { amountMicros: true } as const;

const pause = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const request = async <TResult>(
  label: string,
  send: () => Promise<TResult>,
): Promise<TResult> => {
  await pause(REQUEST_PAUSE_MILLISECONDS);

  try {
    return await send();
  } catch (error) {
    throw new Error(
      `${label} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

// The planner breaks ties by input order, so a dry run and the apply after it
// must see every list in the same order.
const sortedById = <TRecord extends { id: string }>(records: TRecord[]) =>
  [...records].sort((left, right) => (left.id < right.id ? -1 : 1));

const loadDesigns = async () =>
  sortedById(
    (
      await fetchAllPages(async (after) => {
        const { designs } = await request('load grilles', () =>
          client.query({
            designs: {
              __args: { first: PAGE_SIZE, after },
              edges: { node: { id: true, name: true, metal: true } },
              pageInfo: PAGE_INFO,
            },
          }),
        );

        return designs;
      })
    ).map((node) => ({
      id: node.id,
      name: node.name ?? null,
      metal: node.metal ?? null,
    })),
  );

const loadPriceRows = async () =>
  sortedById(
    (
      await fetchAllPages(async (after) => {
        const { priceListItems } = await request('load price rows', () =>
          client.query({
            priceListItems: {
              __args: { first: PAGE_SIZE, after },
              edges: {
                node: {
                  id: true,
                  name: true,
                  designId: true,
                  metal: true,
                  metalSize: true,
                  pricePerSquareMeter: money,
                  materialCostPerSquareMeter: money,
                  manufacturingCostPerSquareMeter: money,
                  installationCostPerSquareMeter: money,
                },
              },
              pageInfo: PAGE_INFO,
            },
          }),
        );

        return priceListItems;
      })
    ).map((node) => ({
      id: node.id,
      name: node.name ?? null,
      designId: node.designId ?? null,
      metal: node.metal ?? null,
      metalSize: node.metalSize ?? null,
      pricePerSquareMeter: fromCurrency(node.pricePerSquareMeter),
      materialCost: fromCurrency(node.materialCostPerSquareMeter),
      manufacturingCost: fromCurrency(node.manufacturingCostPerSquareMeter),
      installationCost: fromCurrency(node.installationCostPerSquareMeter),
    })),
  );

const loadItems = async () =>
  sortedById(
    (
      await fetchAllPages(async (after) => {
        const { orderItems } = await request('load positions', () =>
          client.query({
            orderItems: {
              __args: { first: PAGE_SIZE, after },
              edges: {
                node: {
                  id: true,
                  name: true,
                  orderId: true,
                  designId: true,
                  metal: true,
                  metalSize: true,
                  pricePerSquareMeter: money,
                  costPerSquareMeter: money,
                  lineTotal: money,
                },
              },
              pageInfo: PAGE_INFO,
            },
          }),
        );

        return orderItems;
      })
    ).map((node) => ({
      id: node.id,
      name: node.name ?? null,
      orderId: node.orderId ?? null,
      designId: node.designId ?? null,
      metal: node.metal ?? null,
      metalSize: node.metalSize ?? null,
      pricePerSquareMeter: fromCurrency(node.pricePerSquareMeter),
      costPerSquareMeter: fromCurrency(node.costPerSquareMeter),
      lineTotal: fromCurrency(node.lineTotal),
    })),
  );

const loadNorms = async () =>
  sortedById(
    (
      await fetchAllPages(async (after) => {
        const { materialNorms } = await request('load norms', () =>
          client.query({
            materialNorms: {
              __args: { first: PAGE_SIZE, after },
              edges: {
                node: { id: true, priceListItemId: true, designId: true },
              },
              pageInfo: PAGE_INFO,
            },
          }),
        );

        return materialNorms;
      })
    ).map((node) => ({
      id: node.id,
      priceListItemId: node.priceListItemId ?? null,
      designId: node.designId ?? null,
    })),
  );

const loadServices = async () =>
  sortedById(
    (
      await fetchAllPages(async (after) => {
        const { extraServices } = await request('load services', () =>
          client.query({
            extraServices: {
              __args: { first: PAGE_SIZE, after },
              edges: { node: { id: true, name: true, kind: true } },
              pageInfo: PAGE_INFO,
            },
          }),
        );

        return extraServices;
      })
    ).map((node) => ({
      id: node.id,
      name: node.name ?? null,
      kind: node.kind ?? null,
    })),
  );

const loadOrders = async () =>
  sortedById(
    (
      await fetchAllPages(async (after) => {
        const { orders } = await request('load orders', () =>
          client.query({
            orders: {
              __args: { first: PAGE_SIZE, after },
              edges: {
                node: {
                  id: true,
                  name: true,
                  status: true,
                  total: money,
                  costTotal: money,
                  margin: money,
                  masterPayTotal: money,
                },
              },
              pageInfo: PAGE_INFO,
            },
          }),
        );

        return orders;
      })
    ).map((node) => ({
      id: node.id,
      name: node.name ?? null,
      status: node.status ?? null,
      total: fromCurrency(node.total),
      costTotal: fromCurrency(node.costTotal),
      margin: fromCurrency(node.margin),
      masterPayTotal: fromCurrency(node.masterPayTotal),
    })),
  );

const loadManualMovements = () =>
  fetchAllPages(async (after) => {
    const { stockMovements } = await request('load stock movements', () =>
      client.query({
        stockMovements: {
          __args: {
            filter: { kind: { in: ['CORRECTION', 'FACT_ADJUSTMENT'] } },
            first: PAGE_SIZE,
            after,
          },
          edges: { node: { id: true, name: true, kind: true } },
          pageInfo: PAGE_INFO,
        },
      }),
    );

    return stockMovements;
  });

const loadOrderMaterialsWithFact = () =>
  fetchAllPages(async (after) => {
    const { orderMaterials } = await request('load order materials', () =>
      client.query({
        orderMaterials: {
          __args: {
            filter: { actualQuantity: { is: 'NOT_NULL' } },
            first: PAGE_SIZE,
            after,
          },
          edges: { node: { id: true, name: true, actualQuantity: true } },
          pageInfo: PAGE_INFO,
        },
      }),
    );

    return orderMaterials;
  });

const printList = (heading: string, lines: string[]) => {
  console.log(`\n${heading}: ${lines.length === 0 ? 'none' : lines.length}`);

  for (const line of lines) console.log(`  ${line}`);
};

const formatDifference = ({ id, field, before, after }: SnapshotDifference) =>
  `${id}, ${field}, ${before}, ${after}`;

const writeEach = async <TEntry>(
  group: string,
  entries: TEntry[],
  describeEntry: (entry: TEntry) => string,
  send: (entry: TEntry) => Promise<unknown>,
) => {
  for (const [index, entry] of entries.entries()) {
    const label = `${group} ${index + 1} of ${entries.length}: ${describeEntry(entry)}`;

    console.log(label);
    await request(label, () => send(entry));
  }
};

const waitForRecalc = async () => {
  console.log(
    `Waiting ${RECALC_WAIT_MILLISECONDS / 1000} seconds for the recalculations`,
  );
  await pause(RECALC_WAIT_MILLISECONDS);
};

it(
  'moves prices from the price list onto the grilles',
  async () => {
    const shouldApply = process.env.MIGRATE === 'apply';
    const acceptsFilledPrices = process.env.MIGRATE_EMPTY_PRICES === 'fill';

    console.log(
      `Mode: ${shouldApply ? 'APPLY' : 'dry run'}; positions with an empty price: ${
        acceptsFilledPrices ? 'may be filled from the grille' : 'strict'
      }`,
    );

    const designs = await loadDesigns();
    const priceRows = await loadPriceRows();
    const items = await loadItems();
    const norms = await loadNorms();
    const services = await loadServices();
    const orders = await loadOrders();

    console.log('\nSnapshot');
    console.log(`  grilles: ${designs.length}`);
    console.log(`  price rows: ${priceRows.length}`);
    console.log(`  positions: ${items.length}`);
    console.log(`  norms: ${norms.length}`);
    console.log(`  services: ${services.length}`);
    console.log(
      `  orders: ${orders.length}, sum of total: ${orders.reduce(
        (sum, order) => sum + (order.total ?? 0),
        0,
      )} sum`,
    );

    const plan = planCatalogMigration({
      designs,
      priceRows,
      items,
      norms,
      services,
    });
    const pending = withoutAppliedWrites(plan, {
      designs,
      items,
      norms,
      services,
    });

    console.log('\nPlan');
    console.log(`  grilles updated: ${plan.designUpdates.length}`);
    console.log(
      `  grilles created: ${plan.designCreates.length} (${
        plan.designCreates.length - pending.designCreates.length
      } skipped as already present)`,
    );
    for (const { name } of plan.designCreates) console.log(`    ${name}`);
    console.log(
      `  positions repointed: ${plan.itemRepoints.length} (${
        plan.itemRepoints.length - pending.itemRepoints.length
      } skipped as already on that grille)`,
    );
    console.log(
      `  norms repointed: ${plan.normRepoints.length} (${
        plan.normRepoints.length - pending.normRepoints.length
      } skipped as already on a grille)`,
    );
    console.log(
      `  visor services: ${plan.visorServiceIds.length} (${
        plan.visorServiceIds.length - pending.visorServiceIds.length
      } skipped as already visors)`,
    );

    const grilleNameById = new Map(
      [...designs, ...plan.designCreates].map(({ id, name }) => [id, name]),
    );
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const repointedItemIds = new Set(
      pending.itemRepoints.map(({ itemId }) => itemId),
    );
    const touchedOrderIds = new Set(
      items.flatMap(({ id, orderId }) =>
        repointedItemIds.has(id) && orderId !== null ? [orderId] : [],
      ),
    );

    const describeOrder = (orderId: string | null) => {
      if (orderId === null) return 'no order';

      const order = orderById.get(orderId);

      return order === undefined
        ? `order not returned by the API (${orderId})`
        : `order ${order.name} [${order.status}]`;
    };

    const positionLinesByOrder = (
      positions: ((typeof items)[number] & { grilleId: string })[],
    ) =>
      [...new Set(positions.map(({ orderId }) => orderId))].flatMap(
        (orderId) => [
          describeOrder(orderId),
          ...positions
            .filter((position) => position.orderId === orderId)
            .map(
              ({ id, name, grilleId }) =>
                `  ${id}, ${name}, grille ${grilleNameById.get(grilleId)}, migration touches the order: ${
                  orderId !== null && touchedOrderIds.has(orderId)
                    ? 'yes'
                    : 'no'
                }`,
            ),
        ],
      );

    printList(
      'Grilles left alone because they already have a metal',
      designs
        .filter(({ metal }) => metal !== null)
        .map(({ name, metal }) => `${name} (${metal})`),
    );

    printList(
      'Price rows the new catalog does not carry over exactly',
      priceRowsNotCarriedOver(priceRows).map(
        ({ row, reasons }) =>
          `${row.name}, grille ${
            row.designId === null ? null : grilleNameById.get(row.designId)
          }, metal ${row.metal}, size ${row.metalSize}, price ${
            row.pricePerSquareMeter
          } (${reasons.join('; ')})`,
      ),
    );

    const { withEmptyPrice, withEmptyCostOnly } = positionsFilledAtRecalc(
      items,
      plan.itemRepoints,
    );

    console.log(
      `\nPositions with an empty price that have a grille after the plan: ${withEmptyPrice.length}`,
    );
    for (const line of positionLinesByOrder(withEmptyPrice)) {
      console.log(`  ${line}`);
    }

    // Not covered by MIGRATE_EMPTY_PRICES: an empty cost cannot be written back
    // either, so each of these fails the comparison once its order recalculates.
    console.log(
      `\nPositions with a price but an empty cost that have a grille after the plan: ${withEmptyCostOnly.length}`,
    );
    for (const line of positionLinesByOrder(withEmptyCostOnly)) {
      console.log(`  ${line}`);
    }

    const manualMovements = await loadManualMovements();
    const orderMaterialsWithFact = await loadOrderMaterialsWithFact();

    printList(
      'Stock movements of kind CORRECTION or FACT_ADJUSTMENT',
      manualMovements.map(({ id, name, kind }) => `${id}, ${name}, ${kind}`),
    );
    printList(
      'Order-material lines with an actual quantity',
      orderMaterialsWithFact.map(
        ({ id, name, actualQuantity }) => `${id}, ${name}, ${actualQuantity}`,
      ),
    );

    if (manualMovements.length + orderMaterialsWithFact.length > 0) {
      throw new Error(
        'The warehouse holds manual corrections or actual quantities: the owner decides before the migration goes on',
      );
    }

    if (!shouldApply) {
      console.log('\nDry run: nothing was written');

      return;
    }

    console.log('\nApply');

    await writeEach(
      'create grille',
      pending.designCreates,
      ({ id, name }) => `${name} (${id})`,
      ({ id, name, numbers }) =>
        client.mutation({
          createDesign: {
            __args: {
              data: { id, name, ...grilleData(numbers) },
              upsert: true,
            },
            id: true,
          },
        }),
    );
    await writeEach(
      'update grille',
      pending.designUpdates,
      ({ id }) => `${grilleNameById.get(id)} (${id})`,
      ({ id, numbers }) =>
        client.mutation({
          updateDesign: {
            __args: { id, data: grilleData(numbers) },
            id: true,
          },
        }),
    );
    await writeEach(
      'repoint position',
      pending.itemRepoints,
      ({ itemId, designId }) =>
        `${itemId} to ${grilleNameById.get(designId)} (${designId})`,
      ({ itemId, designId }) =>
        client.mutation({
          updateOrderItem: {
            __args: { id: itemId, data: { designId } },
            id: true,
          },
        }),
    );
    await writeEach(
      'repoint norm',
      pending.normRepoints,
      ({ normId, designId }) =>
        `${normId} to ${grilleNameById.get(designId)} (${designId})`,
      ({ normId, designId }) =>
        client.mutation({
          updateMaterialNorm: {
            __args: { id: normId, data: { designId } },
            id: true,
          },
        }),
    );
    await writeEach(
      'mark visor service',
      pending.visorServiceIds,
      (id) => id,
      (id) =>
        client.mutation({
          updateExtraService: {
            __args: { id, data: { kind: 'VISOR' } },
            id: true,
          },
        }),
    );

    const writeCount =
      pending.designCreates.length +
      pending.designUpdates.length +
      pending.itemRepoints.length +
      pending.normRepoints.length +
      pending.visorServiceIds.length;

    if (writeCount > 0) await waitForRecalc();

    let itemsAfter = await loadItems();
    const writeBacks = priceWriteBacks(
      items,
      diffSnapshots(items, itemsAfter, ITEM_FIELDS),
    );

    await writeEach(
      'write the snapshot price back',
      writeBacks,
      ({ id }) => id,
      ({ id, values }) =>
        client.mutation({
          updateOrderItem: {
            __args: {
              id,
              data: Object.fromEntries(
                Object.entries(values).map(([field, value]) => [
                  field,
                  toCurrency(value),
                ]),
              ),
            },
            id: true,
          },
        }),
    );

    if (writeBacks.length > 0) {
      await waitForRecalc();
      itemsAfter = await loadItems();
    }

    const ordersAfter = await loadOrders();
    const itemDifferences = diffSnapshots(items, itemsAfter, ITEM_FIELDS);
    const orderDifferences = diffSnapshots(orders, ordersAfter, ORDER_FIELDS);
    const filled = filledFromGrille(
      acceptsFilledPrices ? items : [],
      itemDifferences,
    );

    if (acceptsFilledPrices) {
      const ordersAfterById = new Map(
        ordersAfter.map((order) => [order.id, order]),
      );

      console.log('\nFilled from the grille (accepted, not differences)');
      for (const difference of itemDifferences) {
        if (filled.itemIds.has(difference.id)) {
          console.log(`  position ${formatDifference(difference)}`);
        }
      }
      for (const order of orders) {
        if (!filled.orderIds.has(order.id)) continue;

        const orderAfter = ordersAfterById.get(order.id);

        console.log(
          `  order ${order.id} ${order.name}: ${ORDER_FIELDS.map(
            (field) =>
              `${field} ${order[field]} -> ${orderAfter?.[field] ?? null}`,
          ).join(', ')}`,
        );
      }
    }

    const differences = [
      ...itemDifferences.filter(({ id }) => !filled.itemIds.has(id)),
      ...orderDifferences.filter(({ id }) => !filled.orderIds.has(id)),
    ];

    console.log('');
    for (const difference of differences) {
      console.log(formatDifference(difference));
    }
    console.log(`${differences.length} differences`);

    if (differences.length > 0) {
      throw new Error(
        `${differences.length} differences between the snapshot and the migrated data`,
      );
    }
  },
  RUN_TIMEOUT_MILLISECONDS,
);
