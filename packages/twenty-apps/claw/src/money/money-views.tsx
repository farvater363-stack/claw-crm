import { type MoneyMove, type MoneySource } from 'src/money/money-books';
import { formatDayMonth, formatWhole } from 'src/ui/format';
import { usePalette } from 'src/ui/kit';
import {
  CONTROL_HEIGHT,
  RADIUS,
  SPACE,
  TABULAR_NUMBERS,
  TYPE,
} from 'src/ui/tokens';

const SOURCE_LABEL: Record<MoneySource, string> = {
  order: 'заказ',
  payroll: 'ЗП',
  stock: 'склад',
  recurring: 'постоянный',
  hand: 'вручную',
  recount: 'пересчёт',
};

// Written by the app from what is recorded elsewhere, not typed in here.
const isAutomatic = (source: MoneySource) =>
  source === 'order' || source === 'payroll' || source === 'stock';

export const signed = (amount: number): string =>
  amount > 0
    ? `+${formatWhole(amount)}`
    : amount < 0
      ? `−${formatWhole(-amount)}`
      : '0';

const SmallLabel = ({ text }: { text: string }) => {
  const colors = usePalette();

  return (
    <div
      style={{
        fontSize: '12px',
        lineHeight: '16px',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: colors.muted,
        padding: `${SPACE.md}px 0 ${SPACE.xs}px`,
      }}
    >
      {text}
    </div>
  );
};

const LedgerRow = ({ move }: { move: MoneyMove }) => {
  const colors = usePalette();
  const direction = move.flow > 0 ? 'in' : move.flow < 0 ? 'out' : 'move';
  const tint =
    direction === 'in'
      ? { color: colors.success, background: colors.successTint }
      : direction === 'out'
        ? { color: colors.danger, background: colors.dangerTint }
        : { color: colors.muted, background: colors.panel };
  const automatic = isAutomatic(move.source);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: `${SPACE.xs}px ${SPACE.md}px`,
        padding: `${SPACE.sm + 2}px 0`,
        borderTop: `1px solid ${colors.border}`,
      }}
    >
      <span
        aria-hidden
        style={{
          ...tint,
          width: 34,
          height: 34,
          borderRadius: 10,
          display: 'grid',
          placeItems: 'center',
          fontWeight: 700,
        }}
      >
        {direction === 'in' ? '+' : direction === 'out' ? '−' : '⇄'}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {move.title}
        </span>
        <span style={{ ...TYPE.label, color: colors.muted }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: '11px',
              lineHeight: '16px',
              fontWeight: 700,
              padding: '1px 7px',
              borderRadius: 99,
              marginRight: SPACE.sm - 2,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: automatic ? colors.accentTint : colors.panel,
              color: automatic ? colors.accent : colors.muted,
            }}
          >
            {SOURCE_LABEL[move.source]}
          </span>
          {move.walletText}
        </span>
      </span>
      <span
        style={{
          ...TABULAR_NUMBERS,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          textAlign: 'right',
          color: tint.color,
        }}
      >
        {direction === 'move' ? formatWhole(move.amount) : signed(move.flow)}
      </span>
    </div>
  );
};

export const Ledger = ({
  days,
}: {
  days: { date: string; moves: MoneyMove[] }[];
}) => (
  <div>
    {days.map((day) => (
      <div key={day.date}>
        <SmallLabel text={formatDayMonth(day.date)} />
        {day.moves.map((move) => (
          <LedgerRow key={move.key} move={move} />
        ))}
      </div>
    ))}
  </div>
);

const CHART = { width: 440, height: 170, left: 64, right: 430, base: 145 };
const BAR_WIDTH = 30;

// Rounds up to 1, 2, 2.5 or 5 times a power of ten.
const niceCeiling = (value: number) => {
  if (value <= 0) return 1;

  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * power >= value);

  return (step ?? 10) * power;
};

const scaleLabel = (value: number) =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`
    : value >= 1_000
      ? `${Math.round(value / 1_000)} тыс`
      : String(value);

export const WeeklyChart = ({
  weeks,
}: {
  weeks: { label: string; in: number; out: number }[];
}) => {
  const colors = usePalette();
  // Three gridlines at round sums: 10, 20, 30 млн rather than 8.3, 16.7, 25.
  const top =
    niceCeiling(
      Math.max(...weeks.flatMap((week) => [week.in, week.out]), 0) / 3,
    ) * 3;
  const height = CHART.base - 20;
  const ys = [0, 1 / 3, 2 / 3, 1].map(
    (part) => CHART.base - part * height,
  );
  const slot = (CHART.right - CHART.left) / weeks.length;
  const barHeight = (value: number) => (value / top) * height;

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        width="100%"
        role="img"
        aria-label="Приход и расход по неделям"
      >
        {ys.map((y, index) => (
          <g key={y}>
            <line
              x1={CHART.left}
              x2={CHART.right}
              y1={y}
              y2={y}
              stroke={colors.border}
            />
            <text
              x={CHART.left - 6}
              y={y + 4}
              textAnchor="end"
              fill={colors.muted}
              fontSize={11}
            >
              {index === 0 ? '0' : scaleLabel((top * index) / 3)}
            </text>
          </g>
        ))}
        {weeks.map((week, index) => {
          const center = CHART.left + slot * index + slot / 2;

          return (
            <g key={week.label}>
              <rect
                x={center - BAR_WIDTH - 2}
                y={CHART.base - barHeight(week.in)}
                width={BAR_WIDTH}
                height={barHeight(week.in)}
                rx={4}
                fill={colors.success}
              />
              <rect
                x={center + 2}
                y={CHART.base - barHeight(week.out)}
                width={BAR_WIDTH}
                height={barHeight(week.out)}
                rx={4}
                fill={colors.danger}
              />
              <text
                x={center}
                y={CHART.base + 17}
                textAnchor="middle"
                fill={colors.muted}
                fontSize={11}
              >
                {week.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div
        style={{
          display: 'flex',
          gap: SPACE.md + 2,
          ...TYPE.label,
          color: colors.muted,
          marginTop: SPACE.sm,
        }}
      >
        {[
          { text: 'Пришло', color: colors.success },
          { text: 'Ушло', color: colors.danger },
        ].map((item) => (
          <span key={item.text}>
            <i
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 3,
                marginRight: 5,
                background: item.color,
              }}
            />
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
};

export type StatementRow = {
  label: string;
  amount: string;
  kind?: 'line' | 'part' | 'sum' | 'total';
  tone?: 'in' | 'out';
};

// A statement as in the mockup: parts indented and muted, sums under a rule.
export const Statement = ({
  rows,
  isSmall = false,
}: {
  rows: StatementRow[];
  isSmall?: boolean;
}) => {
  const colors = usePalette();

  return (
    <div style={isSmall ? TYPE.label : undefined}>
      {rows.map((row, index) => {
        const kind = row.kind ?? 'line';
        const isSum = kind === 'sum' || kind === 'total';

        return (
          <div
            key={`${row.label}-${index}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: SPACE.md,
              padding: `${SPACE.sm + 1}px 0`,
              borderTop: isSum
                ? `2px solid ${colors.text}`
                : `1px solid ${colors.border}`,
              fontWeight: isSum ? 800 : 400,
              ...(kind === 'total'
                ? { fontSize: '22px', lineHeight: '28px' }
                : {}),
            }}
          >
            <span
              style={{
                minWidth: 0,
                paddingLeft: kind === 'part' ? SPACE.lg : 0,
                color: kind === 'part' ? colors.muted : colors.text,
              }}
            >
              {row.label}
            </span>
            <span
              style={{
                ...TABULAR_NUMBERS,
                whiteSpace: 'nowrap',
                color:
                  row.tone === 'in'
                    ? colors.success
                    : row.tone === 'out'
                      ? colors.danger
                      : undefined,
              }}
            >
              {row.amount}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export const ShareBar = ({ share }: { share: number }) => {
  const colors = usePalette();

  return (
    <div
      aria-hidden
      style={{
        height: SPACE.sm,
        borderRadius: 99,
        background: colors.panel,
        overflow: 'hidden',
        marginTop: SPACE.xs + 2,
      }}
    >
      <span
        style={{
          display: 'block',
          height: '100%',
          width: `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`,
          background: colors.danger,
        }}
      />
    </div>
  );
};

// Chips in a grid of three, one chosen, as «На что» in the mockup.
export const ChipGrid = <TValue extends string>({
  value,
  options,
  onChange,
}: {
  value: TValue | '';
  options: readonly { value: TValue; label: string }[];
  onChange: (value: TValue) => void;
}) => {
  const colors = usePalette();

  return (
    <div
      role="radiogroup"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: SPACE.xs + 2,
      }}
    >
      {options.map((option) => {
        const isChosen = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isChosen}
            onClick={() => onChange(option.value)}
            style={{
              minHeight: CONTROL_HEIGHT - SPACE.sm,
              padding: `0 ${SPACE.xs}px`,
              borderRadius: RADIUS.control + 2,
              border: `1px solid ${isChosen ? colors.text : colors.border}`,
              background: isChosen ? colors.text : colors.surface,
              color: isChosen ? colors.surface : colors.text,
              font: 'inherit',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export const MutedNote = ({ text }: { text: string }) => {
  const colors = usePalette();

  return (
    <p style={{ ...TYPE.label, color: colors.muted, margin: 0 }}>{text}</p>
  );
};

// The mockup's yellow note: a bold lead, then the text.
export const WarningNote = ({
  lead,
  lines,
}: {
  lead: string;
  lines: string[];
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        background: colors.warningTint,
        color: colors.text,
        borderRadius: RADIUS.card - 2,
        padding: `${SPACE.md}px ${SPACE.lg}px`,
        ...TYPE.label,
      }}
    >
      <b style={{ color: colors.warning }}>{lead}</b>{' '}
      {lines.join(' ')}
    </div>
  );
};
