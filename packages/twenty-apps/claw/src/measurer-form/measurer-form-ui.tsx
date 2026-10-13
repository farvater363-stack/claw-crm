import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import { type ProjectionKind } from 'src/constants/select-options';
import {
  layoutOpeningSketch,
  layoutRailingSketch,
  SKETCH_HEIGHT,
  SKETCH_WIDTH,
  type SketchInput,
  type SketchLayout,
} from 'src/opening-shape/sketch-layout';
import { usePalette } from 'src/ui/kit';
import {
  CONTROL_HEIGHT,
  RADIUS,
  ROW_MIN_HEIGHT,
  SPACE,
  TABULAR_NUMBERS,
  TYPE,
} from 'src/ui/tokens';

const SIGNATURE_PAD_HEIGHT_PX = 220;
const WIDTH_POLL_INTERVAL_MS = 500;

// Children of a flex row take the whole line each while the row is narrower
// than this, and share it above.
// Without a width the buttons keep their text width and wrap to a new line
// instead of squeezing over each other.
const stackBelow = (widthPx: number): CSSProperties =>
  widthPx === 0
    ? { flex: '1 1 auto' }
    : { flex: `1 1 calc((${widthPx}px - 100%) * 999)`, minWidth: 0 };

export type SignaturePoint = { x: number; y: number };
export type SignatureStroke = SignaturePoint[];

// The sandbox has no ResizeObserver and no media queries. The host keeps an
// element's size current once it has been read, so reading it now and then
// follows a tablet turned on its side.
export const useElementWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const read = () =>
      setWidth(Math.round(ref.current?.getBoundingClientRect().width ?? 0));

    read();

    const timer = setInterval(read, WIDTH_POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  return { ref, width };
};

// The same polling for a block whose height sets where the sticky ones below
// it start.
export const useElementHeight = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const read = () =>
      setHeight(Math.round(ref.current?.getBoundingClientRect().height ?? 0));

    read();

    const timer = setInterval(read, WIDTH_POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  return { ref, height };
};

export const FieldLabel = ({ children }: { children: ReactNode }) => {
  const colors = usePalette();

  return <span style={{ ...TYPE.label, color: colors.muted }}>{children}</span>;
};

// The steps of the form in one line. Any of them opens on a tap; the screen
// decides whether the ones before it are filled.
export const StepTrail = <TStep extends string>({
  steps,
  current,
  onOpen,
}: {
  steps: { key: TStep; label: string }[];
  current: TStep;
  onOpen: (step: TStep) => void;
}) => {
  const colors = usePalette();

  return (
    <ol
      aria-label="Шаги"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        margin: 0,
        padding: 0,
        listStyle: 'none',
      }}
    >
      {steps.map((item, index) => {
        const isCurrent = item.key === current;

        return (
          <li
            key={item.key}
            aria-current={isCurrent ? 'step' : undefined}
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            {index > 0 && (
              <span aria-hidden style={{ color: colors.muted }}>
                ›
              </span>
            )}
            <button
              type="button"
              onClick={() => onOpen(item.key)}
              style={{
                minHeight: CONTROL_HEIGHT - SPACE.sm,
                padding: `0 ${SPACE.sm}px`,
                background: 'transparent',
                border: 'none',
                color: isCurrent ? colors.text : colors.muted,
                font: 'inherit',
                fontWeight: isCurrent ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
};

// One line of the list beside the form: a visit, a проём, «Услуги».
export const RailItem = ({
  title,
  detail,
  aside,
  isSelected,
  isWrong = false,
  onSelect,
}: {
  title: string;
  detail?: string;
  aside?: ReactNode;
  isSelected: boolean;
  isWrong?: boolean;
  onSelect: () => void;
}) => {
  const colors = usePalette();

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        alignItems: 'center',
        columnGap: SPACE.sm,
        width: '100%',
        minHeight: ROW_MIN_HEIGHT,
        padding: `${SPACE.sm}px ${SPACE.md}px`,
        background: isSelected ? colors.panel : 'transparent',
        border: 'none',
        borderRadius: RADIUS.control,
        color: colors.text,
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>
        {title}
      </span>
      <span style={{ ...TYPE.label, ...TABULAR_NUMBERS, color: colors.muted }}>
        {aside}
      </span>
      {detail ? (
        <span
          style={{
            gridColumn: '1 / -1',
            ...TYPE.label,
            ...TABULAR_NUMBERS,
            color: isWrong ? colors.danger : colors.muted,
            overflowWrap: 'anywhere',
          }}
        >
          {detail}
        </span>
      ) : null}
    </button>
  );
};

// A setting on one line: what it is on the left, its control on the right.
export const SettingRow = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: `${SPACE.sm}px ${SPACE.lg}px`,
        minHeight: ROW_MIN_HEIGHT,
        padding: `${SPACE.sm}px 0`,
        borderTop: `1px solid ${colors.border}`,
      }}
    >
      <span style={{ color: colors.muted }}>{label}</span>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: SPACE.sm,
          minWidth: 0,
          marginLeft: 'auto',
          textAlign: 'right',
        }}
      >
        {children}
      </div>
    </div>
  );
};

// A setting whose line is a button: it opens under itself, or, without
// `isOpen`, leads somewhere else.
export const DisclosureRow = ({
  label,
  value,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  value: ReactNode;
  isOpen?: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <div style={{ borderTop: `1px solid ${colors.border}` }}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: SPACE.lg,
          width: '100%',
          minHeight: ROW_MIN_HEIGHT,
          padding: `${SPACE.sm}px 0`,
          background: 'transparent',
          border: 'none',
          color: colors.text,
          font: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span style={{ color: colors.muted }}>{label}</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: SPACE.md,
            minWidth: 0,
          }}
        >
          {value}
          <span aria-hidden style={{ color: colors.muted }}>
            {isOpen ? '⌄' : '›'}
          </span>
        </span>
      </button>
      {isOpen && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            gap: SPACE.md,
            paddingBottom: SPACE.lg,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export const TextArea = ({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) => {
  const colors = usePalette();

  return (
    <label style={{ display: 'grid', gap: SPACE.xs }}>
      <FieldLabel>{label}</FieldLabel>
      <textarea
        rows={2}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          minHeight: CONTROL_HEIGHT + SPACE.xl,
          padding: `${SPACE.sm}px ${SPACE.md}px`,
          border: `1px solid ${colors.border}`,
          borderRadius: RADIUS.control,
          background: colors.surface,
          color: colors.text,
          font: 'inherit',
          ...TYPE.body,
          resize: 'vertical',
        }}
      />
    </label>
  );
};

export type SegmentOption<TValue extends string> = {
  value: TValue;
  label: string;
  hint?: string;
};

// A few answers to one question, one tap each. The buttons stand one under
// another when the row is narrower than `stackBelowPx`.
export const Segmented = <TValue extends string>({
  label,
  value,
  options,
  stackBelowPx = 0,
  onChange,
}: {
  label: string;
  value: TValue;
  options: SegmentOption<TValue>[];
  stackBelowPx?: number;
  onChange: (value: TValue) => void;
}) => {
  const colors = usePalette();

  return (
    <div
      role="group"
      aria-label={label}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: SPACE.xs,
        padding: SPACE.xs,
        background: colors.panel,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.control + SPACE.xs,
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
              ...stackBelow(stackBelowPx),
              display: 'grid',
              alignContent: 'center',
              minHeight: CONTROL_HEIGHT - SPACE.xs,
              padding: `${SPACE.xs}px ${SPACE.md}px`,
              background: isChosen ? colors.surface : 'transparent',
              border: `1px solid ${isChosen ? colors.border : 'transparent'}`,
              borderRadius: RADIUS.control,
              color: isChosen ? colors.text : colors.muted,
              font: 'inherit',
              ...TYPE.body,
              fontWeight: isChosen ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {option.label}
            {option.hint ? (
              <span style={{ ...TYPE.label, ...TABULAR_NUMBERS }}>
                {option.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

// Tapping the chosen chip again clears the choice: these fields may stay empty.
export const ChoiceChips = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) => {
  const colors = usePalette();

  return (
    <div style={{ display: 'grid', gap: SPACE.xs }}>
      <FieldLabel>{label}</FieldLabel>
      <div
        role="group"
        aria-label={label}
        style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}
      >
        {options.map((option) => {
          const isChosen = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isChosen}
              onClick={() => onChange(isChosen ? '' : option.value)}
              style={{
                minHeight: CONTROL_HEIGHT - SPACE.xs,
                padding: `0 ${SPACE.lg}px`,
                background: isChosen ? colors.panel : colors.surface,
                border: `1px solid ${isChosen ? colors.text : colors.border}`,
                borderRadius: CONTROL_HEIGHT,
                color: colors.text,
                font: 'inherit',
                ...TYPE.body,
                fontWeight: isChosen ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const Fact = ({ label, value }: { label: string; value: string }) => {
  const colors = usePalette();

  return (
    <div style={{ display: 'grid', minWidth: 0 }}>
      <span style={{ ...TYPE.label, color: colors.muted }}>{label}</span>
      <span style={{ overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  );
};

export const NoteBox = ({ title, text }: { title: string; text: string }) => {
  const colors = usePalette();

  return (
    <div
      style={{
        padding: `${SPACE.sm}px ${SPACE.md}px`,
        background: colors.panel,
        borderRadius: RADIUS.control,
      }}
    >
      <div style={{ ...TYPE.label, fontWeight: 600, color: colors.muted }}>
        {title}
      </div>
      {text}
    </div>
  );
};

export const QuantityStepper = ({
  label,
  isLabelShown = true,
  value,
  onChange,
}: {
  label: string;
  // Off where the line it stands on already names it
  isLabelShown?: boolean;
  value: string;
  onChange: (value: string) => void;
}) => {
  const colors = usePalette();
  const step = (delta: number) =>
    onChange(String(Math.max(1, (Number.parseInt(value, 10) || 1) + delta)));
  const button: CSSProperties = {
    width: CONTROL_HEIGHT + SPACE.sm,
    minHeight: CONTROL_HEIGHT + SPACE.sm,
    background: colors.panel,
    border: 'none',
    color: colors.accent,
    font: 'inherit',
    fontSize: '24px',
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'grid', gap: SPACE.xs, justifyItems: 'start' }}>
      {isLabelShown && <FieldLabel>{label}</FieldLabel>}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'stretch',
          border: `1px solid ${colors.border}`,
          borderRadius: RADIUS.control,
          overflow: 'hidden',
          background: colors.surface,
        }}
      >
        <button
          type="button"
          aria-label="Меньше"
          style={button}
          onClick={() => step(-1)}
        >
          −
        </button>
        <input
          inputMode="numeric"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={{
            width: 64,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: colors.text,
            font: 'inherit',
            ...TYPE.rowTitle,
            fontSize: '22px',
            textAlign: 'center',
            ...TABULAR_NUMBERS,
          }}
        />
        <button
          type="button"
          aria-label="Больше"
          style={button}
          onClick={() => step(1)}
        >
          +
        </button>
      </div>
    </div>
  );
};

// The opening as seen from the front, to scale, and from the side, where the
// вынос shows as the triangle (bottom only) or the box (bottom and top) that
// the area is counted from.
export const OpeningSketch = ({
  widthCm,
  heightCm,
  projectionKind,
  projectionCm,
  shape = null,
}: {
  widthCm: number | null;
  heightCm: number | null;
  projectionKind: ProjectionKind;
  projectionCm: number;
  shape?: SketchInput['shape'];
}) => (
  <SketchDrawing
    layout={layoutOpeningSketch({
      widthCm,
      heightCm,
      projectionKind,
      projectionCm,
      shape,
    })}
  />
);

export const RailingSketch = ({
  lengthCm,
  heightCm,
}: {
  lengthCm: number | null;
  heightCm: number | null;
}) => <SketchDrawing layout={layoutRailingSketch({ lengthCm, heightCm })} />;

export const SketchDrawing = ({ layout }: { layout: SketchLayout }) => {
  const colors = usePalette();

  if (layout.placeholder !== null) {
    return (
      <svg
        viewBox={`0 0 ${SKETCH_WIDTH} ${SKETCH_HEIGHT}`}
        width="100%"
        role="img"
        aria-label={layout.ariaLabel}
      >
        <rect
          x="50"
          y="20"
          width="120"
          height="120"
          rx="3"
          fill="none"
          stroke={colors.border}
          strokeWidth="2"
          strokeDasharray="6 6"
        />
        <text
          x="110"
          y="84"
          textAnchor="middle"
          fontSize="12"
          fill={colors.muted}
        >
          {layout.placeholder}
        </text>
      </svg>
    );
  }

  const { side } = layout;

  return (
    <svg
      viewBox={`0 0 ${SKETCH_WIDTH} ${SKETCH_HEIGHT}`}
      width="100%"
      role="img"
      aria-label={layout.ariaLabel}
    >
      {layout.framePath !== null && (
        <path
          d={layout.framePath}
          fill="none"
          stroke={colors.muted}
          strokeWidth="1"
          strokeDasharray="4 4"
        />
      )}
      {layout.shapePath !== null && (
        <path
          d={layout.shapePath}
          fill={colors.accentTint}
          stroke={colors.text}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
      {layout.guides.map((guide, index) => (
        <line
          key={`guide-${index}`}
          {...guide}
          stroke={colors.muted}
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      ))}
      {layout.bars.map(({ line, isThick }, index) => (
        <line
          key={`bar-${index}`}
          {...line}
          stroke={colors.accent}
          strokeWidth={isThick ? 3 : 1.5}
          strokeLinecap="round"
        />
      ))}
      {layout.markers.map((marker) => (
        <g key={`marker-${marker.label}`}>
          <circle cx={marker.x} cy={marker.y} r="6" fill={colors.accent} />
          <text
            x={marker.x}
            y={marker.y + 3.5}
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fill={colors.onAccent}
          >
            {marker.label}
          </text>
        </g>
      ))}
      {side !== null && (
        <>
          <line
            x1={side.wallX - 2}
            y1={side.top - 6}
            x2={side.wallX - 2}
            y2={side.bottom + 6}
            stroke={colors.muted}
            strokeWidth="1"
            strokeDasharray="2 3"
          />
          {side.profilePath === null ? (
            <line
              x1={side.wallX}
              y1={side.top}
              x2={side.wallX}
              y2={side.bottom}
              stroke={colors.accent}
              strokeWidth="3"
            />
          ) : (
            <path
              d={side.profilePath}
              fill={colors.accentTint}
              stroke={colors.accent}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          )}
        </>
      )}
      {layout.texts.map((label, index) => (
        <text
          key={`text-${index}`}
          x={label.x}
          y={label.y}
          textAnchor={label.anchor}
          fontSize={label.size}
          fontWeight={label.isBold ? 600 : 400}
          fill={label.isMuted ? colors.muted : colors.text}
          transform={
            label.isRotated ? `rotate(-90 ${label.x} ${label.y})` : undefined
          }
        >
          {label.text}
        </text>
      ))}
    </svg>
  );
};

export const TileGrid = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(116px, 1fr))',
      gap: SPACE.sm,
    }}
  >
    {children}
  </div>
);

export const FilterChips = ({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: SPACE.sm,
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
              flex: 'none',
              minHeight: CONTROL_HEIGHT - SPACE.sm,
              padding: `0 ${SPACE.md}px`,
              background: isChosen ? colors.panel : colors.surface,
              border: `1px solid ${isChosen ? colors.text : colors.border}`,
              borderRadius: CONTROL_HEIGHT,
              color: colors.text,
              font: 'inherit',
              ...TYPE.label,
              fontWeight: isChosen ? 600 : 400,
              whiteSpace: 'nowrap',
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

export const SummaryLine = ({
  label,
  value,
  isTotal = false,
}: {
  label: ReactNode;
  value: string;
  isTotal?: boolean;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: SPACE.md,
        ...(isTotal && TYPE.title),
      }}
    >
      <span
        style={{ color: isTotal ? colors.text : colors.muted, minWidth: 0 }}
      >
        {label}
      </span>
      <span
        style={{
          ...TABULAR_NUMBERS,
          marginLeft: 'auto',
          textAlign: 'right',
          fontWeight: 600,
        }}
      >
        {value}
      </span>
    </div>
  );
};

export const ErrorList = ({ errors }: { errors: string[] }) => {
  const colors = usePalette();

  if (errors.length === 0) return null;

  return (
    <div
      role="alert"
      style={{
        display: 'grid',
        gap: SPACE.xs,
        padding: `${SPACE.md}px ${SPACE.lg}px`,
        background: colors.dangerTint,
        color: colors.danger,
        borderRadius: RADIUS.control,
      }}
    >
      {errors.map((error) => (
        <span key={error}>{error}</span>
      ))}
    </div>
  );
};

export const SignaturePad = ({
  strokes,
  height = SIGNATURE_PAD_HEIGHT_PX,
  onChange,
}: {
  strokes: SignatureStroke[];
  height?: number;
  onChange: (update: (strokes: SignatureStroke[]) => SignatureStroke[]) => void;
}) => {
  const pad = useRef<HTMLDivElement>(null);
  // Where the pad sits on the screen while one stroke is drawn; null between
  // strokes. A pointer event carries screen coordinates only.
  const origin = useRef<(SignaturePoint & { pointerId: number }) | null>(null);

  const pointOf = (event: PointerEvent<HTMLDivElement>): SignaturePoint => ({
    x: Math.round(event.clientX - (origin.current?.x ?? 0)),
    y: Math.round(event.clientY - (origin.current?.y ?? 0)),
  });

  // The sandbox starts measuring an element at the first read and has nothing
  // to give until then; read once here, so the first stroke finds the pad.
  useEffect(() => {
    pad.current?.getBoundingClientRect();
  }, []);

  const start = (event: PointerEvent<HTMLDivElement>) => {
    const rect = pad.current?.getBoundingClientRect();

    if (rect === undefined || rect.width === 0) return;

    // One finger draws; a palm resting on the screen starts nothing.
    if (origin.current !== null) return;

    origin.current = { x: rect.x, y: rect.y, pointerId: event.pointerId };

    const point = pointOf(event);

    onChange((current) => [...current, [point]]);
  };

  const extend = (event: PointerEvent<HTMLDivElement>) => {
    if (origin.current?.pointerId !== event.pointerId) return;

    const point = pointOf(event);

    onChange((current) => [
      ...current.slice(0, -1),
      [...(current[current.length - 1] ?? []), point],
    ]);
  };

  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (origin.current?.pointerId === event.pointerId) origin.current = null;
  };

  return (
    <div
      ref={pad}
      role="img"
      aria-label="Поле для подписи клиента"
      style={{
        // White in both themes: the signature is saved as black on white
        background: '#ffffff',
        border: '2px dashed #c9ccd4',
        borderRadius: RADIUS.card,
        cursor: 'crosshair',
        height: `${height}px`,
        overflow: 'hidden',
        position: 'relative',
        // Without it a finger drawing on the pad scrolls the page instead.
        touchAction: 'none',
        userSelect: 'none',
      }}
      onPointerDown={start}
      onPointerMove={extend}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
    >
      <svg
        width="100%"
        height="100%"
        style={{ inset: 0, pointerEvents: 'none', position: 'absolute' }}
      >
        <line
          x1="24"
          y1={height - 50}
          x2="96%"
          y2={height - 50}
          stroke="#c9ccd4"
          strokeWidth="1"
        />
        {strokes.length === 0 ? (
          <text
            x="50%"
            y={height / 2 - 10}
            textAnchor="middle"
            fontSize="15"
            fill="#9a9ea8"
          >
            Распишитесь здесь
          </text>
        ) : null}
        {strokes.map((stroke, index) => (
          <polyline
            key={index}
            // A lone point is doubled so a tap shows as a dot.
            points={[stroke[0], ...stroke]
              .map((point) => `${point.x},${point.y}`)
              .join(' ')}
            fill="none"
            stroke="#000000"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  );
};
