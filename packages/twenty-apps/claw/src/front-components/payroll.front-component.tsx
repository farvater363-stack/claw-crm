import { type CSSProperties, Fragment, useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  openSidePanelPage,
  SidePanelPages,
  useColorScheme,
} from 'twenty-sdk/front-component';

import {
  MASTER_PAYMENT_KIND_OPTIONS,
  type MasterPaymentKind,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { todayInTashkent } from 'src/pricing/dates';
import {
  computeMonthlyPayroll,
  type PayrollOrder,
  type PayrollPayment,
} from 'src/payroll/compute-monthly-payroll';
import { buildPaymentInput } from 'src/payroll/payment-draft';
import {
  currentMonthInTashkent,
  formatMonthLabel,
  shiftMonth,
} from 'src/payroll/payroll-month';
import { fromCurrency } from 'src/recalc/money';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';

type LoadState =
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      masters: { id: string; name: string }[];
      orders: PayrollOrder[];
      payments: PayrollPayment[];
      skippedPaymentCount: number;
    };

type PaymentForm = {
  masterId: string;
  kind: MasterPaymentKind;
  amount: string;
  paidOn: string;
  comment: string;
};

// Twenty caps a page at 200 records.
const PAGE_SIZE = 200;

const PALETTE = {
  light: {
    text: '#1f1f1f',
    muted: '#666666',
    border: '#d6d6d6',
    surface: '#ffffff',
    panel: '#f6f6f6',
    accent: '#1961ed',
    danger: '#b42318',
  },
  dark: {
    text: '#ebebeb',
    muted: '#a6a6a6',
    border: '#3d3d3d',
    surface: '#1b1b1b',
    panel: '#242424',
    accent: '#5b8def',
    danger: '#f97066',
  },
} as const;

const formatMoney = (value: number) =>
  `${value.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} сум`;

const formatSquareMeters = (value: number) =>
  value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-');

  return `${day}.${month}.${year}`;
};

const kindLabel = (kind: string | null) =>
  MASTER_PAYMENT_KIND_OPTIONS.find((option) => option.value === kind)?.label ??
  '';

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Roles without read on payments get a permission error (or an unknown field)
// from this query; nothing else is loaded for them.
const isAccessError = (error: unknown) =>
  /permission|Cannot query field/i.test(describeError(error));

// Throws on any failure except an access error on payments, which is the owner check.
const loadPayrollData = async (): Promise<
  Extract<LoadState, { status: 'ready' | 'forbidden' }>
> => {
  const client = new CoreApiClient();
  let paymentNodes;

  try {
    paymentNodes = await fetchAllPages(async (after) => {
      const { masterPayments } = await client.query({
        masterPayments: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              id: true,
              masterId: true,
              paidOn: true,
              amount: { amountMicros: true, currencyCode: true },
              kind: true,
              comment: true,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return masterPayments;
    });
  } catch (error) {
    if (isAccessError(error)) return { status: 'forbidden' };

    throw error;
  }

  const masterNodes = await fetchAllPages(async (after) => {
    const { masters } = await client.query({
      masters: {
        __args: { first: PAGE_SIZE, after },
        edges: { node: { id: true, name: true } },
        pageInfo: PAGE_INFO,
      },
    });

    return masters;
  });
  const orderNodes = await fetchAllPages(async (after) => {
    const { orders } = await client.query({
      orders: {
        __args: {
          filter: { readyAt: { is: 'NOT_NULL' } },
          first: PAGE_SIZE,
          after,
        },
        edges: {
          node: {
            id: true,
            name: true,
            masterId: true,
            readyAt: true,
            status: true,
            areaSquareMeters: true,
            masterPayCalculated: { amountMicros: true },
            masterPenalty: { amountMicros: true },
            masterBonus: { amountMicros: true },
            masterPayTotal: { amountMicros: true },
          },
        },
        pageInfo: PAGE_INFO,
      },
    });

    return orders;
  });

  const payments: PayrollPayment[] = [];
  let skippedPaymentCount = 0;

  for (const node of paymentNodes) {
    const amount = fromCurrency(node.amount);

    if (!node.masterId || !node.paidOn || amount === null) {
      skippedPaymentCount += 1;
      continue;
    }

    payments.push({
      id: node.id,
      masterId: node.masterId,
      paidOn: String(node.paidOn).slice(0, 10),
      amount,
      kind: node.kind ? String(node.kind) : null,
      comment: node.comment ?? null,
    });
  }

  return {
    status: 'ready',
    masters: masterNodes.map((node) => ({
      id: node.id,
      name: node.name ?? '',
    })),
    orders: orderNodes.flatMap((node) =>
      node.masterId && node.readyAt
        ? [
            {
              id: node.id,
              name: node.name ?? '',
              masterId: node.masterId,
              readyAt: String(node.readyAt).slice(0, 10),
              status: String(node.status ?? ''),
              areaSquareMeters:
                node.areaSquareMeters === null ||
                node.areaSquareMeters === undefined
                  ? null
                  : Number(node.areaSquareMeters),
              masterPayCalculated: fromCurrency(node.masterPayCalculated),
              masterPenalty: fromCurrency(node.masterPenalty),
              masterBonus: fromCurrency(node.masterBonus),
              masterPayTotal: fromCurrency(node.masterPayTotal),
            },
          ]
        : [],
    ),
    payments,
    skippedPaymentCount,
  };
};

const Payroll = () => {
  const colors = PALETTE[useColorScheme()];
  const [month, setMonth] = useState(currentMonthInTashkent);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [expandedMasterId, setExpandedMasterId] = useState<string | null>(null);
  const [form, setForm] = useState<PaymentForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [reloadError, setReloadError] = useState<string | null>(null);

  useEffect(() => {
    const loadInitially = async () => {
      try {
        setLoad(await loadPayrollData());
      } catch (error) {
        setLoad({
          status: 'error',
          message: `Не удалось загрузить данные: ${describeError(error)}`,
        });
      }
    };

    void loadInitially();
  }, []);

  const cell: CSSProperties = {
    padding: '8px 10px',
    borderBottom: `1px solid ${colors.border}`,
    textAlign: 'right',
    whiteSpace: 'nowrap',
  };
  const leftCell: CSSProperties = { ...cell, textAlign: 'left' };
  const headCell: CSSProperties = {
    ...cell,
    color: colors.muted,
    fontWeight: 600,
  };
  const input: CSSProperties = {
    padding: '6px 8px',
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    background: colors.surface,
    color: colors.text,
  };
  const button: CSSProperties = { ...input, cursor: 'pointer' };
  const linkButton: CSSProperties = {
    border: 'none',
    background: 'none',
    color: colors.accent,
    cursor: 'pointer',
    padding: 0,
  };

  const openOrder = (orderId: string) =>
    openSidePanelPage({
      page: SidePanelPages.ViewRecord,
      recordId: orderId,
      objectNameSingular: 'order',
    });

  const openForm = (
    kind: MasterPaymentKind,
    masterId: string,
    owed: number,
  ) => {
    setFormError(null);
    setForm({
      masterId,
      kind,
      amount: kind === 'SETTLEMENT' && owed > 0 ? String(owed) : '',
      paidOn: todayInTashkent(),
      comment: '',
    });
  };

  const save = async (masterName: string) => {
    if (form === null) return;

    const result = buildPaymentInput({ ...form, masterName });

    if (!result.isValid) {
      setFormError(result.error);

      return;
    }

    setIsSaving(true);
    setFormError(null);
    setReloadError(null);

    try {
      await new CoreApiClient().mutation({
        createMasterPayment: { __args: { data: result.data }, id: true },
      });
    } catch (error) {
      setFormError(`Не удалось сохранить: ${describeError(error)}`);
      setIsSaving(false);

      return;
    }

    setForm(null);

    // The payment is saved; a failed refresh keeps the old table instead of an error page.
    try {
      setLoad(await loadPayrollData());
    } catch (error) {
      setReloadError(
        `Выплата сохранена, но данные не обновились: ${describeError(error)}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const wrapper: CSSProperties = {
    padding: 16,
    color: colors.text,
    background: colors.surface,
    fontFamily: 'inherit',
  };

  if (load.status === 'loading') {
    return <p style={{ ...wrapper, color: colors.muted }}>Загрузка…</p>;
  }

  if (load.status === 'forbidden') {
    return <p style={wrapper}>Доступно только владельцу</p>;
  }

  if (load.status === 'error') {
    return <p style={{ ...wrapper, color: colors.danger }}>{load.message}</p>;
  }

  const { rows, totals } = computeMonthlyPayroll({ month, ...load });

  return (
    <div style={wrapper}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          style={button}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ‹
        </button>
        <strong style={{ minWidth: 140, textAlign: 'center' }}>
          {formatMonthLabel(month)}
        </strong>
        <button
          type="button"
          style={button}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          ›
        </button>
      </div>
      {reloadError !== null && (
        <p style={{ color: colors.danger }}>{reloadError}</p>
      )}
      {rows.length === 0 ? (
        <p style={{ color: colors.muted }}>
          За этот месяц нет начислений и выплат
        </p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...headCell, textAlign: 'left' }}>Мастер</th>
              <th style={headCell}>м²</th>
              <th style={headCell}>Начислено</th>
              <th style={headCell}>Штраф</th>
              <th style={headCell}>Премия</th>
              <th style={headCell}>Итого за месяц</th>
              <th style={headCell}>Выплачено</th>
              <th style={headCell}>Перенос</th>
              <th style={headCell}>К выплате</th>
              <th style={headCell} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.masterId}>
                <tr>
                  <td style={leftCell}>
                    <button
                      type="button"
                      style={{ ...linkButton, color: colors.text }}
                      onClick={() =>
                        setExpandedMasterId(
                          expandedMasterId === row.masterId
                            ? null
                            : row.masterId,
                        )
                      }
                    >
                      {expandedMasterId === row.masterId ? '▾' : '▸'}{' '}
                      {row.masterName}
                    </button>
                  </td>
                  <td style={cell}>{formatSquareMeters(row.squareMeters)}</td>
                  <td style={cell}>{formatMoney(row.basePay)}</td>
                  <td style={cell}>{formatMoney(row.penalty)}</td>
                  <td style={cell}>{formatMoney(row.bonus)}</td>
                  <td style={cell}>{formatMoney(row.earned)}</td>
                  <td style={cell}>{formatMoney(row.paidThisMonth)}</td>
                  <td style={cell}>{formatMoney(row.carriedOver)}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>
                    {formatMoney(row.owed)}
                  </td>
                  <td style={cell}>
                    <button
                      type="button"
                      style={button}
                      onClick={() =>
                        openForm('ADVANCE', row.masterId, row.owed)
                      }
                    >
                      Выдать аванс
                    </button>{' '}
                    <button
                      type="button"
                      style={button}
                      onClick={() =>
                        openForm('SETTLEMENT', row.masterId, row.owed)
                      }
                    >
                      Рассчитать
                    </button>
                  </td>
                </tr>
                {form?.masterId === row.masterId && (
                  <tr>
                    <td
                      colSpan={10}
                      style={{ ...leftCell, background: colors.panel }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          flexWrap: 'wrap',
                          alignItems: 'center',
                        }}
                      >
                        <strong>{kindLabel(form.kind)}</strong>
                        <input
                          style={input}
                          placeholder="Сумма"
                          value={form.amount}
                          onChange={(event) =>
                            setForm({ ...form, amount: event.target.value })
                          }
                        />
                        <input
                          style={input}
                          type="date"
                          value={form.paidOn}
                          onChange={(event) =>
                            setForm({ ...form, paidOn: event.target.value })
                          }
                        />
                        <input
                          style={{ ...input, minWidth: 220 }}
                          placeholder="Комментарий"
                          value={form.comment}
                          onChange={(event) =>
                            setForm({ ...form, comment: event.target.value })
                          }
                        />
                        <button
                          type="button"
                          style={button}
                          disabled={isSaving}
                          onClick={() => void save(row.masterName)}
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          style={button}
                          onClick={() => setForm(null)}
                        >
                          Отмена
                        </button>
                        {formError !== null && (
                          <span style={{ color: colors.danger }}>
                            {formError}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {expandedMasterId === row.masterId && (
                  <tr>
                    <td
                      colSpan={10}
                      style={{ ...leftCell, background: colors.panel }}
                    >
                      <table
                        style={{ borderCollapse: 'collapse', width: '100%' }}
                      >
                        <thead>
                          <tr>
                            <th style={{ ...headCell, textAlign: 'left' }}>
                              №
                            </th>
                            <th style={headCell}>Готов</th>
                            <th style={headCell}>м²</th>
                            <th style={headCell}>Штраф</th>
                            <th style={headCell}>Премия</th>
                            <th style={headCell}>ЗП</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.orders.map((order) => (
                            <tr key={order.id}>
                              <td style={leftCell}>
                                <button
                                  type="button"
                                  style={linkButton}
                                  onClick={() => openOrder(order.id)}
                                >
                                  {order.name}
                                </button>
                              </td>
                              <td style={cell}>{formatDate(order.readyAt)}</td>
                              <td style={cell}>
                                {formatSquareMeters(
                                  order.areaSquareMeters ?? 0,
                                )}
                              </td>
                              <td style={cell}>
                                {formatMoney(order.masterPenalty ?? 0)}
                              </td>
                              <td style={cell}>
                                {formatMoney(order.masterBonus ?? 0)}
                              </td>
                              <td style={cell}>
                                {formatMoney(order.masterPayTotal ?? 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {row.payments.length > 0 && (
                        <table
                          style={{
                            borderCollapse: 'collapse',
                            width: '100%',
                            marginTop: 12,
                          }}
                        >
                          <thead>
                            <tr>
                              <th style={{ ...headCell, textAlign: 'left' }}>
                                Дата
                              </th>
                              <th style={{ ...headCell, textAlign: 'left' }}>
                                Тип
                              </th>
                              <th style={headCell}>Сумма</th>
                              <th style={{ ...headCell, textAlign: 'left' }}>
                                Комментарий
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.payments.map((payment) => (
                              <tr key={payment.id}>
                                <td style={leftCell}>
                                  {formatDate(payment.paidOn)}
                                </td>
                                <td style={leftCell}>
                                  {kindLabel(payment.kind)}
                                </td>
                                <td style={cell}>
                                  {formatMoney(payment.amount)}
                                </td>
                                <td style={leftCell}>
                                  {payment.comment ?? ''}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            <tr style={{ fontWeight: 600 }}>
              <td style={leftCell}>Итого</td>
              <td style={cell}>{formatSquareMeters(totals.squareMeters)}</td>
              <td style={cell}>{formatMoney(totals.basePay)}</td>
              <td style={cell}>{formatMoney(totals.penalty)}</td>
              <td style={cell}>{formatMoney(totals.bonus)}</td>
              <td style={cell}>{formatMoney(totals.earned)}</td>
              <td style={cell}>{formatMoney(totals.paidThisMonth)}</td>
              <td style={cell}>{formatMoney(totals.carriedOver)}</td>
              <td style={cell}>{formatMoney(totals.owed)}</td>
              <td style={cell} />
            </tr>
          </tbody>
        </table>
      )}
      {load.skippedPaymentCount > 0 && (
        <p style={{ color: colors.danger }}>
          Не учтено выплат без даты, суммы или мастера:{' '}
          {load.skippedPaymentCount} — исправьте в списке «Выплаты»
        </p>
      )}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: IDS.payroll.frontComponent,
  name: 'payroll',
  description: 'ЗП мастеров за месяц: начисления, выплаты, остаток',
  component: Payroll,
});
