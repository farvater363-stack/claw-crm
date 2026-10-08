import { createContext, type ReactNode, useContext } from 'react';

import { usePalette } from 'src/ui/kit';
import {
  CONTROL_HEIGHT,
  type Palette,
  RADIUS,
  SPACE,
  TABULAR_NUMBERS,
  TYPE,
} from 'src/ui/tokens';

export type Accent =
  'danger' | 'warning' | 'success' | 'urgent' | 'accent' | 'neutral';

const accentColors = (colors: Palette, accent: Accent) => {
  switch (accent) {
    case 'danger':
      return { color: colors.danger, background: colors.dangerTint };
    case 'warning':
      return { color: colors.warning, background: colors.warningTint };
    case 'success':
      return { color: colors.success, background: colors.successTint };
    case 'urgent':
      return { color: colors.urgent, background: colors.urgentTint };
    case 'accent':
      return { color: colors.accent, background: colors.accentTint };
    default:
      return { color: colors.muted, background: colors.panel };
  }
};

// True on a phone: cards and rows tighten so text keeps its width.
export const CompactContext = createContext(false);

const useIsCompact = () => useContext(CompactContext);

const LABEL_CAPS = {
  ...TYPE.label,
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
} as const;

// Two columns side by side from this width of the screen's own block.
export const TWO_COLUMNS_FROM_WIDTH = 860;

export const TwoColumns = ({
  isWide,
  left,
  right,
  ratio = '1.35fr 1fr',
}: {
  isWide: boolean;
  left: ReactNode;
  right: ReactNode;
  ratio?: string;
}) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: isWide ? ratio : 'minmax(0, 1fr)',
      gap: SPACE.lg,
      alignItems: 'start',
    }}
  >
    <div style={{ minWidth: 0 }}>{left}</div>
    <div style={{ minWidth: 0 }}>{right}</div>
  </div>
);

// What needs attention, as round chips. Each one jumps to its rows: a plain
// fragment link, because the sandbox cannot scroll the host page itself.
export const AttentionChip = ({
  accent,
  count,
  text,
  anchor,
}: {
  accent: Accent;
  count: number;
  text: string;
  anchor: string;
}) => {
  const colors = usePalette();
  const { color, background } = accentColors(colors, accent);

  return (
    <a
      href={`#${anchor}`}
      style={{
        flex: '0 0 auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: SPACE.sm,
        minHeight: CONTROL_HEIGHT - SPACE.sm,
        padding: `0 ${SPACE.lg}px 0 ${SPACE.sm}px`,
        boxSizing: 'border-box',
        borderRadius: 999,
        background,
        color,
        font: 'inherit',
        ...TYPE.label,
        fontWeight: 600,
        textDecoration: 'none',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          display: 'inline-grid',
          placeItems: 'center',
          minWidth: 24,
          height: 24,
          padding: `0 ${SPACE.xs}px`,
          boxSizing: 'border-box',
          borderRadius: 999,
          background: color,
          color: colors.surface,
          fontSize: '12px',
          fontWeight: 800,
          ...TABULAR_NUMBERS,
        }}
      >
        {count}
      </span>
      {text}
    </a>
  );
};

export const ChipRow = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: SPACE.sm,
      marginBottom: SPACE.lg,
    }}
  >
    {children}
  </div>
);

export const TileGrid = ({
  isWide,
  children,
}: {
  isWide: boolean;
  children: ReactNode;
}) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: isWide
        ? 'repeat(4, minmax(0, 1fr))'
        : 'repeat(2, minmax(0, 1fr))',
      gap: SPACE.sm,
      marginBottom: SPACE.lg,
    }}
  >
    {children}
  </div>
);

export type ValueTone = 'good' | 'bad' | 'muted' | 'plain';

const valueColor = (colors: Palette, tone: ValueTone) =>
  tone === 'good'
    ? colors.success
    : tone === 'bad'
      ? colors.danger
      : tone === 'muted'
        ? colors.muted
        : colors.text;

const tileStyle = (colors: Palette, isCompact: boolean) =>
  ({
    display: 'grid',
    gap: 2,
    alignContent: 'start',
    minWidth: 0,
    padding: isCompact
      ? `${SPACE.sm}px ${SPACE.md}px`
      : `${SPACE.md}px ${SPACE.lg}px`,
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: RADIUS.card,
    color: colors.text,
    font: 'inherit',
    textAlign: 'left',
  }) as const;

// One key figure of today. With `onClick` it opens what it counts.
export const KpiTile = ({
  label,
  value,
  hint,
  tone = 'plain',
  onClick,
  anchor,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: ValueTone;
  onClick?: () => void;
  // Jumps to these rows on the same screen instead of calling onClick
  anchor?: string;
}) => {
  const colors = usePalette();
  const isCompact = useIsCompact();
  const body = (
    <>
      <span style={{ ...LABEL_CAPS, color: colors.muted }}>{label}</span>
      <span
        style={{
          ...TABULAR_NUMBERS,
          fontSize: isCompact ? '17px' : '21px',
          lineHeight: isCompact ? '24px' : '28px',
          fontWeight: 600,
          color: valueColor(colors, tone),
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
      {hint ? (
        <span style={{ ...TYPE.label, color: colors.muted }}>{hint}</span>
      ) : null}
    </>
  );

  if (anchor !== undefined) {
    return (
      <a
        href={`#${anchor}`}
        style={{
          ...tileStyle(colors, isCompact),
          textDecoration: 'none',
          cursor: 'pointer',
        }}
      >
        {body}
      </a>
    );
  }

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      style={{ ...tileStyle(colors, isCompact), cursor: 'pointer' }}
    >
      {body}
    </button>
  ) : (
    <div style={tileStyle(colors, isCompact)}>{body}</div>
  );
};

const SPARK_WIDTH = 64;
const SPARK_HEIGHT = 26;
const SPARK_PADDING = 3;

export const Sparkline = ({ values }: { values: (number | null)[] }) => {
  const colors = usePalette();
  const known = values.flatMap((value, index) =>
    value === null ? [] : [{ value, index }],
  );

  if (known.length < 2) return null;

  const lowest = Math.min(...known.map((point) => point.value));
  const highest = Math.max(...known.map((point) => point.value));
  const span = highest - lowest || 1;
  const step =
    (SPARK_WIDTH - 2 * SPARK_PADDING) / Math.max(1, values.length - 1);
  const points = known.map(({ value, index }) => ({
    x: SPARK_PADDING + index * step,
    y:
      SPARK_HEIGHT -
      SPARK_PADDING -
      ((value - lowest) / span) * (SPARK_HEIGHT - 2 * SPARK_PADDING),
  }));
  const last = points[points.length - 1];

  return (
    <svg
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      aria-hidden
      style={{ flex: 'none' }}
    >
      <polyline
        fill="none"
        stroke={colors.accent}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.map((point) => `${point.x},${point.y}`).join(' ')}
      />
      <circle cx={last.x} cy={last.y} r={2.5} fill={colors.accent} />
    </svg>
  );
};

// A figure of the period with its last months as a line and its change.
export const TrendTile = ({
  label,
  value,
  series,
  change,
  note,
  tone = 'plain',
}: {
  label: string;
  value: string;
  series: (number | null)[];
  change: { direction: 'up' | 'down' | 'flat'; text: string } | null;
  // Says what the change is measured against, or why there is none
  note: string;
  tone?: ValueTone;
}) => {
  const colors = usePalette();
  const isCompact = useIsCompact();
  const changeColor =
    change?.direction === 'up'
      ? colors.success
      : change?.direction === 'down'
        ? colors.danger
        : colors.muted;

  return (
    <div style={tileStyle(colors, isCompact)}>
      <span style={{ ...LABEL_CAPS, color: colors.muted }}>{label}</span>
      <span
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: SPACE.sm,
          minWidth: 0,
        }}
      >
        <span
          style={{
            ...TABULAR_NUMBERS,
            fontSize: isCompact ? '17px' : '20px',
            lineHeight: isCompact ? '24px' : '28px',
            fontWeight: 600,
            color: valueColor(colors, tone),
            minWidth: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </span>
        {isCompact ? null : <Sparkline values={series} />}
      </span>
      <span style={{ ...TYPE.label }}>
        {change ? (
          <span style={{ color: changeColor, fontWeight: 700 }}>
            {change.text}{' '}
          </span>
        ) : null}
        <span style={{ color: colors.muted }}>{note}</span>
      </span>
    </div>
  );
};

// A card: title and its link or button on one line, then the content.
export const Card = ({
  id,
  title,
  subtitle,
  action,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) => {
  const colors = usePalette();
  const isCompact = useIsCompact();

  return (
    <section
      id={id}
      style={{
        display: 'grid',
        gap: SPACE.md,
        minWidth: 0,
        scrollMarginTop: SPACE.lg,
        marginBottom: SPACE.lg,
        padding: isCompact ? SPACE.md : SPACE.lg,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.card,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: `${SPACE.xs}px ${SPACE.md}px`,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, ...TYPE.rowTitle, fontSize: '17px' }}>
            {title}
          </h3>
          {subtitle ? (
            <div style={{ ...TYPE.label, color: colors.muted }}>{subtitle}</div>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
};

// A word button inside a card: «Все заказы», «Склад».
export const TextButton = ({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: `${SPACE.xs}px 0`,
        background: 'transparent',
        border: 'none',
        color: colors.accent,
        font: 'inherit',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
};

export const SmallButton = ({
  variant = 'quiet',
  onClick,
  children,
}: {
  variant?: 'primary' | 'quiet';
  onClick: () => void;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 36,
        padding: `0 ${SPACE.md}px`,
        borderRadius: RADIUS.control,
        border: variant === 'primary' ? 'none' : `1px solid ${colors.border}`,
        background: variant === 'primary' ? colors.accent : colors.surface,
        color: variant === 'primary' ? colors.onAccent : colors.text,
        font: 'inherit',
        ...TYPE.label,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        ...TABULAR_NUMBERS,
      }}
    >
      {children}
    </button>
  );
};

export const Tag = ({ accent, text }: { accent: Accent; text: string }) => {
  const colors = usePalette();
  const { color, background } = accentColors(colors, accent);

  return (
    <span
      style={{
        display: 'inline-block',
        marginRight: SPACE.sm,
        padding: '1px 8px',
        borderRadius: 999,
        background,
        color,
        fontSize: '11px',
        lineHeight: '18px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        verticalAlign: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
};

export const GroupTitle = ({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <div
      id={id}
      style={{
        scrollMarginTop: SPACE.lg,
        ...LABEL_CAPS,
        color: colors.muted,
        padding: `${SPACE.md}px 0 ${SPACE.xs}px`,
      }}
    >
      {children}
    </div>
  );
};

// A line of the day: when, what and for whom, and what to do about it.
export const PlanRow = ({
  when,
  whenTone = 'muted',
  tag,
  title,
  details,
  action,
  isDone = false,
}: {
  when: string;
  whenTone?: ValueTone;
  tag: ReactNode;
  title: string;
  details: string | null;
  action?: ReactNode;
  isDone?: boolean;
}) => {
  const colors = usePalette();
  const isCompact = useIsCompact();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isCompact
          ? '44px minmax(0, 1fr)'
          : '56px minmax(0, 1fr) auto',
        alignItems: isCompact ? 'start' : 'center',
        gap: isCompact ? `${SPACE.sm}px ${SPACE.sm}px` : `2px ${SPACE.md}px`,
        padding: `${SPACE.md}px 0`,
        borderTop: `1px solid ${colors.border}`,
        opacity: isDone ? 0.6 : 1,
      }}
    >
      <span
        style={{
          ...TYPE.label,
          ...TABULAR_NUMBERS,
          fontWeight: 600,
          color: valueColor(colors, whenTone),
        }}
      >
        {when}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontWeight: 600,
            overflowWrap: 'anywhere',
            textDecoration: isDone ? 'line-through' : 'none',
          }}
        >
          {tag}
          {title}
        </span>
        {details ? (
          <span
            style={{
              display: 'block',
              ...TYPE.label,
              color: colors.muted,
              overflowWrap: 'anywhere',
            }}
          >
            {details}
          </span>
        ) : null}
      </span>
      {isCompact ? (
        action ? (
          <span style={{ gridColumn: 2, justifySelf: 'start' }}>{action}</span>
        ) : null
      ) : (
        (action ?? <span />)
      )}
    </div>
  );
};

export const QuietLine = ({ text }: { text: string }) => {
  const colors = usePalette();

  return (
    <div
      style={{
        ...TYPE.label,
        color: colors.muted,
        padding: `${SPACE.sm}px 0`,
      }}
    >
      {text}
    </div>
  );
};

// A label, a bar as long as its share of the largest, and the figure.
export const BarRow = ({
  label,
  value,
  level,
  accent = 'accent',
  isThick = false,
  labelWidth = 140,
  onClick,
}: {
  label: string;
  value: string;
  level: number;
  accent?: 'accent' | 'danger';
  isThick?: boolean;
  labelWidth?: number;
  onClick?: () => void;
}) => {
  const colors = usePalette();
  const content = (
    <>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{label}</span>
      <span
        aria-hidden
        style={{
          height: isThick ? 22 : 10,
          borderRadius: isThick ? 6 : 999,
          background: colors.panel,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${Math.max(0, Math.min(1, level)) * 100}%`,
            background: accent === 'danger' ? colors.danger : colors.accent,
            borderRadius: isThick ? 6 : 999,
          }}
        />
      </span>
      <span style={{ ...TABULAR_NUMBERS, fontWeight: 600, textAlign: 'right' }}>
        {value}
      </span>
    </>
  );
  const style = {
    display: 'grid',
    gridTemplateColumns: `minmax(0, ${labelWidth}px) minmax(40px, 1fr) auto`,
    alignItems: 'center',
    gap: SPACE.md,
    ...TYPE.label,
    fontSize: '14px',
    color: colors.text,
  } as const;

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...style,
        width: '100%',
        padding: 0,
        background: 'transparent',
        border: 'none',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      {content}
    </button>
  ) : (
    <div style={style}>{content}</div>
  );
};

export const Bars = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'grid', gap: SPACE.sm }}>{children}</div>
);

// Small figures side by side, such as the workshop's stages.
export const MiniStats = ({
  stats,
}: {
  stats: { label: string; value: string }[];
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
        gap: SPACE.sm,
      }}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          style={{
            padding: `${SPACE.sm}px ${SPACE.md}px`,
            background: colors.panel,
            borderRadius: RADIUS.control,
            minWidth: 0,
          }}
        >
          <div style={{ ...TYPE.label, fontSize: '12px', color: colors.muted }}>
            {stat.label}
          </div>
          <div
            style={{
              ...TABULAR_NUMBERS,
              fontSize: '18px',
              lineHeight: '24px',
              fontWeight: 600,
            }}
          >
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
};

// A row of a list inside a card: what on the left, a figure or pill on the right.
export const ListLine = ({
  title,
  details,
  trailing,
}: {
  title: string;
  details?: string;
  trailing: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: SPACE.md,
        padding: `${SPACE.sm}px 0`,
        borderTop: `1px solid ${colors.border}`,
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600 }}>{title}</span>
        {details ? (
          <span
            style={{ display: 'block', ...TYPE.label, color: colors.muted }}
          >
            {details}
          </span>
        ) : null}
      </span>
      <span style={{ ...TABULAR_NUMBERS, whiteSpace: 'nowrap' }}>
        {trailing}
      </span>
    </div>
  );
};

export const Pill = ({ accent, text }: { accent: Accent; text: string }) => {
  const colors = usePalette();
  const { color, background } = accentColors(colors, accent);

  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 999,
        background,
        color,
        fontSize: '12px',
        lineHeight: '18px',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
};

const CHART_WIDTH = 440;
const CHART_HEIGHT = 186;
const CHART_LEFT = 44;
const CHART_RIGHT = 6;
const CHART_TOP = 24;
const CHART_BASE = 160;
const GRID_LINES = 4;

// A round step for the axis: 1, 2 or 5 times a power of ten.
const niceStep = (rough: number) => {
  const power = 10 ** Math.floor(Math.log10(rough));
  const scaled = rough / power;

  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
};

const MILLION = 1_000_000;

const axisLabel = (value: number) =>
  (value / MILLION).toLocaleString('ru-RU', { maximumFractionDigits: 1 });

// Two bars a month, the sums in millions on the axis.
export const MonthBarsChart = ({
  bars,
  firstLabel,
  secondLabel,
}: {
  bars: { label: string; first: number; second: number; isOngoing: boolean }[];
  firstLabel: string;
  secondLabel: string;
}) => {
  const colors = usePalette();
  const highest = Math.max(
    1,
    ...bars.flatMap((bar) => [bar.first, bar.second]),
  );
  const step = niceStep(highest / GRID_LINES);
  const top = Math.ceil(highest / step) * step;
  const scale = (CHART_BASE - CHART_TOP) / top;
  const slot =
    (CHART_WIDTH - CHART_LEFT - CHART_RIGHT) / Math.max(1, bars.length);
  const barWidth = Math.min(22, (slot - 10) / 2);
  const ticks = Array.from(
    { length: Math.round(top / step) + 1 },
    (_, index) => index * step,
  );
  const bestIndex = bars.reduce(
    (best, bar, index) => (bar.first > (bars[best]?.first ?? 0) ? index : best),
    0,
  );
  const textStyle = { fill: colors.muted, fontSize: 11 } as const;

  return (
    <div style={{ display: 'grid', gap: SPACE.sm }}>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        width="100%"
        role="img"
        aria-label={`${firstLabel} и ${secondLabel.toLowerCase()} по месяцам`}
      >
        {ticks.map((tick) => {
          const y = CHART_BASE - tick * scale;

          return (
            <g key={tick}>
              <line
                x1={CHART_LEFT}
                x2={CHART_WIDTH - CHART_RIGHT}
                y1={y}
                y2={y}
                stroke={colors.border}
                strokeWidth={1}
              />
              <text
                x={CHART_LEFT - 6}
                y={y + 4}
                textAnchor="end"
                style={textStyle}
              >
                {axisLabel(tick)}
              </text>
            </g>
          );
        })}
        {bars.map((bar, index) => {
          const center = CHART_LEFT + slot * index + slot / 2;
          const firstHeight = bar.first * scale;
          const secondHeight = bar.second * scale;
          const opacity = bar.isOngoing ? 0.55 : 1;

          return (
            <g key={`${bar.label}-${index}`}>
              <rect
                x={center - barWidth - 1}
                y={CHART_BASE - firstHeight}
                width={barWidth}
                height={firstHeight}
                rx={3}
                fill={colors.accent}
                opacity={opacity}
              />
              <rect
                x={center + 1}
                y={CHART_BASE - secondHeight}
                width={barWidth}
                height={secondHeight}
                rx={3}
                fill={colors.success}
                opacity={opacity * 0.55}
              />
              {index === bestIndex && bar.first > 0 ? (
                <text
                  x={center - barWidth / 2 - 1}
                  y={CHART_BASE - firstHeight - 6}
                  textAnchor="middle"
                  style={{ ...textStyle, fill: colors.text, fontWeight: 700 }}
                >
                  {axisLabel(bar.first)}
                </text>
              ) : null}
              <text
                x={center}
                y={CHART_BASE + 18}
                textAnchor="middle"
                style={textStyle}
              >
                {bar.isOngoing ? `${bar.label}*` : bar.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: SPACE.lg,
          ...TYPE.label,
          fontSize: '12.5px',
          color: colors.muted,
        }}
      >
        <span>
          <LegendSwatch color={colors.accent} />
          {firstLabel}
        </span>
        <span>
          <LegendSwatch color={colors.success} isFaint />
          {secondLabel}
        </span>
        {bars.some((bar) => bar.isOngoing) ? <span>* месяц идёт</span> : null}
      </div>
    </div>
  );
};

const LegendSwatch = ({
  color,
  isFaint = false,
}: {
  color: string;
  isFaint?: boolean;
}) => (
  <span
    aria-hidden
    style={{
      display: 'inline-block',
      width: 10,
      height: 10,
      marginRight: 6,
      borderRadius: 3,
      background: color,
      opacity: isFaint ? 0.55 : 1,
      verticalAlign: -1,
    }}
  />
);

// A step of the way from a request to an installed grille.
export const FunnelStep = ({
  label,
  count,
  level,
}: {
  label: string;
  count: number;
  level: number;
}) => {
  const colors = usePalette();

  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <span
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: SPACE.md,
          fontSize: '14px',
        }}
      >
        <span>{label}</span>
        <span style={{ ...TABULAR_NUMBERS, fontWeight: 600 }}>{count}</span>
      </span>
      <span
        aria-hidden
        style={{
          height: 26,
          borderRadius: 6,
          background: colors.panel,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${Math.max(0, Math.min(1, level)) * 100}%`,
            background: colors.accent,
            borderRadius: 6,
          }}
        />
      </span>
    </div>
  );
};

export const FunnelDrop = ({ children }: { children: ReactNode }) => {
  const colors = usePalette();

  return (
    <div
      style={{
        ...TYPE.label,
        fontSize: '12.5px',
        color: colors.muted,
        paddingLeft: SPACE.sm,
      }}
    >
      {children}
    </div>
  );
};

export const DropCount = ({ value }: { value: number }) => {
  const colors = usePalette();

  return <b style={{ color: colors.danger, ...TABULAR_NUMBERS }}>{value}</b>;
};

export type TableColumn<TRow> = {
  title: string;
  isNumber?: boolean;
  render: (row: TRow) => ReactNode;
};

// A table that scrolls sideways inside its card on a phone.
export const DataTable = <TRow,>({
  columns,
  rows,
  rowKey,
  minWidth = 460,
}: {
  columns: TableColumn<TRow>[];
  rows: TRow[];
  rowKey: (row: TRow) => string;
  minWidth?: number;
}) => {
  const colors = usePalette();
  const cell = (isNumber: boolean, isFirst: boolean) =>
    ({
      padding: `${SPACE.sm}px ${isFirst ? 0 : SPACE.sm}px`,
      textAlign: isNumber ? 'right' : 'left',
      whiteSpace: isNumber ? 'nowrap' : 'normal',
      ...(isNumber ? TABULAR_NUMBERS : {}),
    }) as const;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          minWidth,
          borderCollapse: 'collapse',
          fontSize: '14px',
        }}
      >
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={column.title}
                style={{
                  ...cell(column.isNumber ?? false, index === 0),
                  ...LABEL_CAPS,
                  color: colors.muted,
                  borderBottom: `1px solid ${colors.border}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column, index) => (
                <td
                  key={column.title}
                  style={{
                    ...cell(column.isNumber ?? false, index === 0),
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// A check of the data a figure depends on: done, or what is missing.
export const CheckLine = ({
  isDone,
  children,
}: {
  isDone: boolean;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: SPACE.md,
        padding: `${SPACE.xs}px 0`,
        fontSize: '14px',
      }}
    >
      <span
        aria-label={isDone ? 'Готово' : 'Не хватает'}
        style={{
          flex: '0 0 22px',
          height: 22,
          display: 'grid',
          placeItems: 'center',
          borderRadius: 999,
          background: isDone ? colors.successTint : colors.dangerTint,
          color: isDone ? colors.success : colors.danger,
          fontSize: '12px',
          fontWeight: 800,
        }}
      >
        {isDone ? '✓' : '!'}
      </span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
};

// Sections of a period-wide control bar: the period chips and the arrows.
export const Segmented = <TValue extends string>({
  value,
  options,
  onChange,
}: {
  value: TValue;
  options: { value: TValue; label: string }[];
  onChange: (value: TValue) => void;
}) => {
  const colors = usePalette();

  return (
    <div
      role="group"
      style={{
        display: 'inline-flex',
        padding: 3,
        background: colors.panel,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.control + 2,
      }}
    >
      {options.map((option) => {
        const isChosen = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isChosen}
            onClick={() => onChange(option.value)}
            style={{
              minHeight: 36,
              padding: `0 ${SPACE.md}px`,
              border: 'none',
              borderRadius: RADIUS.control,
              background: isChosen ? colors.surface : 'transparent',
              boxShadow: isChosen ? '0 1px 3px rgba(0, 0, 0, 0.12)' : 'none',
              color: isChosen ? colors.text : colors.muted,
              font: 'inherit',
              ...TYPE.label,
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

export const ArrowButton = ({
  label,
  isDisabled = false,
  onClick,
  children,
}: {
  label: string;
  isDisabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <button
      type="button"
      aria-label={label}
      disabled={isDisabled}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.control,
        background: colors.surface,
        color: isDisabled ? colors.border : colors.text,
        font: 'inherit',
        cursor: isDisabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
};
