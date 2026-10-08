import { isInstalled } from 'src/constants/order-status-sets';
import { type AccrualMethod } from 'src/constants/select-options';
import {
  isAreaMissingForRates,
  masterRuleRate,
  type PayRule,
  type PayWork,
  workLabel,
} from 'src/payroll/pay-rules';
import {
  EMPTY_WORKSHOP_CATALOG,
  keptSquareMeterRates,
  planSquareMeterParts,
  type WorkshopCatalog,
  type WorkshopItem,
} from 'src/payroll/workshop-pay';
import { formatQuantity, formatWhole } from 'src/ui/format';
import { deterministicUuid } from 'src/utils/deterministic-uuid';

export type AccrualLine = {
  id: string;
  workerId: string;
  orderId: string | null;
  earnedOn: string;
  method: AccrualMethod;
  work: PayWork | null;
  basis: number;
  rate: number;
  amount: number;
  name: string;
  // The row of «Ставки цеха» a workshop line per m² was paid by
  part: string | null;
};

export type OrderForAccruals = {
  id: string;
  name: string;
  status: string | null;
  areaSquareMeters: number | null;
  total: number | null;
  masterId: string | null;
  installerId: string | null;
  measurerWorkerId: string | null;
  soldById: string | null;
  masterBonus: number | null;
  masterPenalty: number | null;
  installedOn: string | null;
  measuredOn: string | null;
  items: WorkshopItem[];
};

export type AccrualPlan = { upserts: AccrualLine[]; deleteIds: string[] };

type Draft = Pick<
  AccrualLine,
  'workerId' | 'earnedOn' | 'method' | 'work' | 'basis' | 'rate'
> & { part?: string; label?: string };
type Rate = { method: AccrualMethod; rate: number };

const ORDER_METHODS: readonly AccrualMethod[] = [
  'PER_SQUARE_METER',
  'PER_ORDER',
];
const COMPARED_KEYS = [
  'workerId',
  'orderId',
  'earnedOn',
  'method',
  'work',
  'basis',
  'rate',
  'amount',
  'name',
  'part',
] as const;

// A NaN never equals itself, so a line holding one would be rewritten on every run.
const finiteOrZero = (value: number | null): number =>
  value !== null && Number.isFinite(value) ? value : 0;

// A line is written with upsert under this id, so running the plan again can never add a second one.
// A workshop line per m² has one line per row of «Ставки цеха», told apart by its part.
export const accrualId = ({
  orderId,
  workerId,
  method,
  work,
  part,
}: {
  orderId: string;
  workerId: string;
  method: AccrualMethod;
  work: PayWork | null;
  part?: string;
}): string =>
  deterministicUuid(
    `accrual:${orderId}:${workerId}:${method}:${work ?? ''}${part ? `:${part}` : ''}`,
  );

const amountOf = ({ method, basis, rate }: Draft): number => {
  if (method === 'PERCENT_OF_SALES') return Math.round((basis * rate) / 100);

  return method === 'PENALTY'
    ? -Math.round(basis * rate)
    : Math.round(basis * rate);
};

const detailOf = ({ method, basis, rate }: Draft): string => {
  if (method === 'PER_SQUARE_METER') {
    return `${formatQuantity(basis, 'м²')} × ${formatWhole(rate)}`;
  }
  if (method === 'PERCENT_OF_SALES') {
    return `${formatQuantity(rate, '%')} от ${formatWhole(basis)}`;
  }
  if (method === 'PER_ORDER') return `за заказ ${formatWhole(rate)}`;
  if (method === 'PER_MEASUREMENT') return `за замер ${formatWhole(rate)}`;
  if (method === 'BONUS') return `премия ${formatWhole(rate)}`;
  if (method === 'PENALTY') return `штраф ${formatWhole(rate)}`;

  return formatWhole(rate);
};

export const planOrderAccruals = ({
  order,
  rules,
  existing,
  catalog = EMPTY_WORKSHOP_CATALOG,
}: {
  order: OrderForAccruals;
  rules: PayRule[];
  existing: AccrualLine[];
  catalog?: WorkshopCatalog;
}): AccrualPlan => {
  const due = new Map<string, AccrualLine>();

  const add = ({ part, label, ...input }: Draft) => {
    const draft = {
      ...input,
      basis: finiteOrZero(input.basis),
      rate: finiteOrZero(input.rate),
    };
    const id = accrualId({
      orderId: order.id,
      workerId: draft.workerId,
      method: draft.method,
      work: draft.work,
      part,
    });

    // Two rules of one method for one work would share the id; the first one counts.
    if (due.has(id)) return;

    due.set(id, {
      ...draft,
      id,
      orderId: order.id,
      amount: amountOf(draft),
      name: `${order.name} · ${workLabel(draft.work)} · ${[label, detailOf(draft)].filter(Boolean).join(' ')}`,
      part: part || null,
    });
  };

  // The rate written on a line stays; a worker with no line yet is paid by his rules of today.
  const ratesOf = (
    workerId: string,
    work: PayWork,
    methods: readonly AccrualMethod[],
  ): Rate[] => {
    const kept = existing.filter(
      (line) =>
        line.workerId === workerId &&
        line.work === work &&
        methods.includes(line.method),
    );

    return kept.length > 0
      ? kept.map(({ method, rate }) => ({ method, rate }))
      : rules
          .filter(
            (rule) =>
              rule.workerId === workerId &&
              rule.work === work &&
              methods.includes(rule.method),
          )
          .map((rule) => ({
            method: rule.method,
            rate:
              (rule.method === 'PERCENT_OF_SALES'
                ? rule.percent
                : rule.amount) ?? 0,
          }));
  };

  const { installedOn, measuredOn } = order;

  // Pay for an order is earned when the order is installed.
  if (isInstalled(order.status) && installedOn !== null) {
    const people: [PayWork, string | null][] = [
      ['MASTER', order.masterId],
      ['INSTALLER', order.installerId],
      ['MEASURER', order.measurerWorkerId],
    ];

    // The order shows no pay for a master whose pay cannot be counted, so he gets no line either.
    let isMasterPayUnknown = false;

    for (const [work, workerId] of people) {
      if (workerId === null) continue;

      const rates = ratesOf(workerId, work, ORDER_METHODS);

      // Цех is paid per m² by the grille of each проём, so its lines come from «Ставки цеха».
      if (work === 'MASTER') {
        const parts = planSquareMeterParts({
          catalog,
          masterId: workerId,
          items: order.items,
          orderAreaSquareMeters: order.areaSquareMeters,
          ruleRate: masterRuleRate(
            rules.filter((rule) => rule.workerId === workerId),
          ),
          kept: keptSquareMeterRates(existing, workerId),
        });

        if (parts === null) {
          isMasterPayUnknown = true;
          continue;
        }

        for (const { part, label, basis, rate } of parts) {
          add({
            workerId,
            earnedOn: installedOn,
            method: 'PER_SQUARE_METER',
            work,
            basis,
            rate,
            part,
            label,
          });
        }

        for (const { method, rate } of rates) {
          if (method !== 'PER_ORDER') continue;

          add({ workerId, earnedOn: installedOn, method, work, basis: 1, rate });
        }

        continue;
      }

      if (isAreaMissingForRates(order.areaSquareMeters, rates)) continue;

      for (const { method, rate } of rates) {
        const basis =
          method === 'PER_SQUARE_METER' ? (order.areaSquareMeters ?? 0) : 1;

        add({ workerId, earnedOn: installedOn, method, work, basis, rate });
      }
    }

    if (order.soldById !== null) {
      for (const { method, rate } of ratesOf(order.soldById, 'SALES', [
        'PERCENT_OF_SALES',
      ])) {
        add({
          workerId: order.soldById,
          earnedOn: installedOn,
          method,
          work: 'SALES',
          basis: order.total ?? 0,
          rate,
        });
      }
    }

    if (order.masterId !== null && !isMasterPayUnknown) {
      const extras: [AccrualMethod, number][] = [
        ['BONUS', finiteOrZero(order.masterBonus)],
        ['PENALTY', finiteOrZero(order.masterPenalty)],
      ];

      for (const [method, value] of extras) {
        if (value !== 0) {
          add({
            workerId: order.masterId,
            earnedOn: installedOn,
            method,
            work: 'MASTER',
            basis: 1,
            rate: value,
          });
        }
      }
    }
  }

  // Earned at the measurement and kept whatever happens to the order afterwards.
  if (measuredOn !== null && order.measurerWorkerId !== null) {
    for (const { method, rate } of ratesOf(order.measurerWorkerId, 'MEASURER', [
      'PER_MEASUREMENT',
    ])) {
      add({
        workerId: order.measurerWorkerId,
        earnedOn: measuredOn,
        method,
        work: 'MEASURER',
        basis: 1,
        rate,
      });
    }
  }

  const existingById = new Map(existing.map((line) => [line.id, line]));

  return {
    upserts: [...due.values()].filter((line) => {
      const stored = existingById.get(line.id);

      return (
        stored === undefined ||
        COMPARED_KEYS.some((key) => line[key] !== stored[key])
      );
    }),
    deleteIds: existing
      .filter((line) => !due.has(line.id))
      .map((line) => line.id),
  };
};
