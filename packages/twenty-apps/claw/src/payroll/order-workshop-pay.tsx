import { useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { useSelectedRecordIds } from 'twenty-sdk/front-component';

import { isInstalled } from 'src/constants/order-status-sets';
import { ACCRUAL_SELECTION, PAY_RULE_SELECTION, toAccrualLine, toPayRules } from 'src/payroll/pay-records';
import { masterRuleRate } from 'src/payroll/pay-rules';
import {
  type ItemPayRow,
  keptSquareMeterRates,
  NO_KEPT_RATES,
  planItemPayRows,
} from 'src/payroll/workshop-pay';
import { loadWorkshopCatalog } from 'src/payroll/workshop-rates-data';
import { formatMoney, formatQuantity, formatWhole } from 'src/ui/format';
import { usePalette } from 'src/ui/kit';
import { RADIUS, SPACE, TABULAR_NUMBERS, TYPE } from 'src/ui/tokens';
import { joinFullName } from 'src/utils/full-name';

const PAGE_SIZE = 200;

type OrderPay = {
  masterName: string | null;
  isInstalled: boolean;
  rows: (ItemPayRow & { title: string; sizeText: string | null })[];
  // What the master's lines on this order add up to, once it is installed
  earned: number | null;
};

const loadOrderPay = async (orderId: string): Promise<OrderPay> => {
  const client = new CoreApiClient();
  const { orders, orderItems, payAccruals } = await client.query({
    orders: {
      __args: { filter: { id: { eq: orderId } }, first: 1 },
      edges: {
        node: {
          id: true,
          status: true,
          masterId: true,
          master: { fullName: { firstName: true, lastName: true } },
        },
      },
    },
    orderItems: {
      __args: {
        filter: { orderId: { eq: orderId } },
        first: PAGE_SIZE,
        orderBy: [{ createdAt: 'AscNullsLast' }],
      },
      edges: {
        node: { id: true, name: true, designId: true, areaSquareMeters: true, quantity: true },
      },
    },
    payAccruals: {
      __args: { filter: { orderId: { eq: orderId } }, first: PAGE_SIZE },
      edges: { node: ACCRUAL_SELECTION },
    },
  });
  const order = orders?.edges[0]?.node;
  const masterId = order?.masterId ?? null;
  const installed = isInstalled(order?.status ?? null);

  if (!order || masterId === null) {
    return { masterName: null, isInstalled: installed, rows: [], earned: null };
  }

  const [catalog, { payRules }] = await Promise.all([
    loadWorkshopCatalog(client),
    client.query({
      payRules: {
        __args: { filter: { workerId: { eq: masterId } }, first: PAGE_SIZE },
        edges: { node: PAY_RULE_SELECTION },
      },
    }),
  ]);
  const lines = (payAccruals?.edges ?? []).flatMap(({ node }) => toAccrualLine(node) ?? []);
  const items = (orderItems?.edges ?? []).map(({ node }) => ({
    id: node.id,
    designId: node.designId ?? null,
    areaSquareMeters: node.areaSquareMeters === null || node.areaSquareMeters === undefined ? null : Number(node.areaSquareMeters),
    quantity: node.quantity === null || node.quantity === undefined ? null : Number(node.quantity),
    sizeText: node.name ?? null,
  }));
  const rows = planItemPayRows({
    catalog,
    masterId,
    items,
    ruleRate: masterRuleRate(toPayRules((payRules?.edges ?? []).map(({ node }) => node))),
    // The lines of an order that is not installed are about to be removed.
    kept: installed ? keptSquareMeterRates(lines, masterId) : NO_KEPT_RATES,
  });
  const masterLines = lines.filter(
    (line) => line.workerId === masterId && line.work === 'MASTER' && line.method === 'PER_SQUARE_METER',
  );

  return {
    masterName: joinFullName(order.master?.fullName ?? null),
    isInstalled: installed,
    rows: rows.map((row, index) => ({
      ...row,
      title: `Проём ${index + 1}`,
      sizeText: items[index].sizeText,
    })),
    earned: installed && masterLines.length > 0 ? masterLines.reduce((sum, line) => sum + line.amount, 0) : null,
  };
};

const OrderWorkshopPayOf = ({ orderId }: { orderId: string }) => {
  const colors = usePalette();
  const [pay, setPay] = useState<OrderPay | null>(null);

  useEffect(() => {
    // A role without pay records is refused; the block then stays empty, as pay is the owner's.
    loadOrderPay(orderId)
      .then(setPay)
      .catch((error: unknown) => console.error(error));
  }, [orderId]);

  if (pay === null) return null;

  const note = { ...TYPE.label, color: colors.muted, margin: 0 };

  if (pay.masterName === null) return <p style={note}>Мастер цеха не выбран</p>;
  if (pay.rows.length === 0) return <p style={note}>В заказе пока нет проёмов</p>;

  const area = pay.rows.reduce((sum, row) => sum + (row.areaSquareMeters ?? 0), 0);
  const counted = pay.rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const total = pay.earned ?? counted;

  return (
    <div
      style={{
        display: 'grid',
        padding: SPACE.md,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.card,
        color: colors.text,
        ...TYPE.body,
      }}
    >
      <span style={{ ...TYPE.label, color: colors.muted, marginBottom: SPACE.sm }}>
        {`Цех: ${pay.masterName} · ${pay.isInstalled ? 'начислено при установке' : 'начислится при установке'}`}
      </span>
      {pay.rows.map((row) => (
        <div
          key={row.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: SPACE.md,
            padding: `${SPACE.md}px 0`,
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>
              {`${row.title} · ${row.designName === null ? 'решётка не выбрана' : `«${row.designName}»`}`}
            </div>
            <div style={{ ...TYPE.label, color: colors.muted, ...TABULAR_NUMBERS }}>
              {[
                row.rowLabel,
                row.sizeText,
                row.areaSquareMeters === null
                  ? 'размеры не указаны'
                  : row.rate === null
                    ? `${formatQuantity(row.areaSquareMeters, 'м²')}, ставки нет`
                    : `${formatQuantity(row.areaSquareMeters, 'м²')} × ${formatWhole(row.rate)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              {row.isOwn ? (
                <span
                  style={{
                    marginLeft: SPACE.sm,
                    padding: `0 ${SPACE.sm}px`,
                    borderRadius: 99,
                    background: colors.accentTint,
                    color: colors.accent,
                    fontWeight: 600,
                  }}
                >
                  своя
                </span>
              ) : null}
            </div>
          </div>
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap', ...TABULAR_NUMBERS }}>
            {row.amount === null ? '—' : formatWhole(row.amount)}
          </span>
        </div>
      ))}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: SPACE.md,
          padding: `${SPACE.md}px 0 0`,
          borderTop: `2px solid ${colors.text}`,
          fontWeight: 700,
          ...TABULAR_NUMBERS,
        }}
      >
        <span>{`Цеху за заказ · ${formatQuantity(Math.round(area * 100) / 100, 'м²')}`}</span>
        <span>{formatMoney(total)}</span>
      </div>
      <p style={{ ...note, marginTop: SPACE.sm }}>
        Посчитано само из решёток проёмов и ставок этого мастера в «ЗП → Ставки цеха». Ставки берутся на день
        установки и дальше не меняются.
      </p>
    </div>
  );
};

export const OrderWorkshopPay = () => {
  const selectedRecordIds = useSelectedRecordIds();

  if (selectedRecordIds.length !== 1) return null;

  return <OrderWorkshopPayOf key={selectedRecordIds[0]} orderId={selectedRecordIds[0]} />;
};
