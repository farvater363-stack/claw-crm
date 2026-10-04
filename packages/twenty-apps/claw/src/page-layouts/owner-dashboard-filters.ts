import { IDS } from 'src/constants/universal-identifiers';
import { STEP_STATUS } from 'src/order-header/order-steps';

type ChartRecordFilter = {
  fieldMetadataUniversalIdentifier: string;
  operand: string;
  value: string;
  recordFilterGroupId?: string;
  subFieldName?: string;
};

type ChartRecordFilterGroup = {
  id: string;
  logicalOperator: 'AND' | 'OR';
  parentRecordFilterGroupId?: string;
};

export type ChartFilter = {
  recordFilters: ChartRecordFilter[];
  recordFilterGroups?: ChartRecordFilterGroup[];
};

const TIME_ZONE = 'Asia/Tashkent';
const ROOT_GROUP_ID = '09f1f5f0-6151-4617-b76b-0a343a92262c';
const ANY_OF_GROUP_ID = 'ba192f14-9069-489b-ae84-507d2ee72032';

export const CHART_DEFAULTS = {
  timezone: TIME_ZONE,
  firstDayOfTheWeek: 1,
  displayDataLabel: true,
} as const;

export const relative = (period: string) => `${period};;${TIME_ZONE};;`;

const NOT_CANCELLED: ChartRecordFilter = {
  fieldMetadataUniversalIdentifier: IDS.order.status,
  operand: 'IS_NOT',
  value: JSON.stringify(['CANCELLED']),
};

const CANCELLED: ChartRecordFilter = {
  fieldMetadataUniversalIdentifier: IDS.order.status,
  operand: 'IS',
  value: JSON.stringify(['CANCELLED']),
};

export const READY_THIS_MONTH: ChartFilter = {
  recordFilters: [
    {
      fieldMetadataUniversalIdentifier: IDS.order.readyAt,
      operand: 'IS_RELATIVE',
      value: relative('THIS_1_MONTH'),
    },
    NOT_CANCELLED,
  ],
};

// Twenty's PAST_n_MONTH stops before the current month, so «last 12 months»
// is the past 11 months or this one.
const inLastTwelveMonths = (
  dateFieldUniversalIdentifier: string,
  alsoRequired: ChartRecordFilter,
): ChartFilter => ({
  recordFilterGroups: [
    { id: ROOT_GROUP_ID, logicalOperator: 'AND' },
    {
      id: ANY_OF_GROUP_ID,
      logicalOperator: 'OR',
      parentRecordFilterGroupId: ROOT_GROUP_ID,
    },
  ],
  recordFilters: [
    {
      fieldMetadataUniversalIdentifier: dateFieldUniversalIdentifier,
      operand: 'IS_RELATIVE',
      value: relative('PAST_11_MONTH'),
      recordFilterGroupId: ANY_OF_GROUP_ID,
    },
    {
      fieldMetadataUniversalIdentifier: dateFieldUniversalIdentifier,
      operand: 'IS_RELATIVE',
      value: relative('THIS_1_MONTH'),
      recordFilterGroupId: ANY_OF_GROUP_ID,
    },
    { ...alsoRequired, recordFilterGroupId: ROOT_GROUP_ID },
  ],
});

export const READY_IN_LAST_TWELVE_MONTHS = inLastTwelveMonths(
  IDS.order.readyAt,
  NOT_CANCELLED,
);

// There is no cancel date; the order's creation date stands in for it.
export const CANCELLED_IN_LAST_TWELVE_MONTHS = inLastTwelveMonths(
  IDS.order.createdAt,
  CANCELLED,
);

// Conversion counts decided orders only: ready or cancelled. Open orders and
// the imported ones (closed, never stamped ready) fall outside both.
export const DECIDED_ORDERS: ChartFilter = {
  recordFilterGroups: [{ id: ANY_OF_GROUP_ID, logicalOperator: 'OR' }],
  recordFilters: [
    {
      fieldMetadataUniversalIdentifier: IDS.order.readyAt,
      operand: 'IS_NOT_EMPTY',
      value: '',
      recordFilterGroupId: ANY_OF_GROUP_ID,
    },
    { ...CANCELLED, recordFilterGroupId: ANY_OF_GROUP_ID },
  ],
};

const statusIs = (status: string): ChartRecordFilter => ({
  fieldMetadataUniversalIdentifier: IDS.order.status,
  operand: 'IS',
  value: JSON.stringify([status]),
});

export const OVERDUE_ORDERS: ChartFilter = {
  recordFilters: [
    {
      fieldMetadataUniversalIdentifier: IDS.order.deadlineState,
      operand: 'IS',
      value: JSON.stringify(['OVERDUE']),
    },
  ],
};

export const ORDERS_IN_PRODUCTION: ChartFilter = {
  recordFilters: [statusIs(STEP_STATUS.production)],
};

// The same two conditions as the «Должны нам» list: whole sums, so «at least 1» is «more than 0».
export const INSTALLED_WITH_BALANCE: ChartFilter = {
  recordFilters: [
    statusIs(STEP_STATUS.installed),
    {
      fieldMetadataUniversalIdentifier: IDS.order.balance,
      operand: 'GREATER_THAN_OR_EQUAL',
      subFieldName: 'amountMicros',
      value: '1',
    },
  ],
};

// BUY and LOW are exactly the materials with something to buy.
export const MATERIALS_TO_BUY: ChartFilter = {
  recordFilters: [
    {
      fieldMetadataUniversalIdentifier: IDS.material.stockState,
      operand: 'IS',
      value: JSON.stringify(['BUY', 'LOW']),
    },
  ],
};
