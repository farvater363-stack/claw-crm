import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import { type ProjectionKind } from 'src/constants/select-options';
import { TextInput, usePalette } from 'src/ui/kit';
import {
  CONTROL_HEIGHT,
  RADIUS,
  SPACE,
  TABULAR_NUMBERS,
  TYPE,
} from 'src/ui/tokens';

const PICKER_LIST_MAX_HEIGHT = 440;
const SIGNATURE_PAD_HEIGHT_PX = 220;
const WIDTH_POLL_INTERVAL_MS = 500;

// Children of a flex row take the whole line each while the row is narrower
// than this, and share it above.
const stackBelow = (widthPx: number): CSSProperties => ({
  flex: `1 1 calc((${widthPx}px - 100%) * 999)`,
  minWidth: 0,
});

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

export const Card = ({
  children,
  padding = SPACE.lg,
  isHighlighted = false,
}: {
  children: ReactNode;
  padding?: number;
  isHighlighted?: boolean;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: SPACE.lg,
        padding,
        background: colors.surface,
        border: `1px solid ${isHighlighted ? colors.danger : colors.border}`,
        borderRadius: RADIUS.card,
      }}
    >
      {children}
    </div>
  );
};

export const SectionTitle = ({
  title,
  aside,
}: {
  title: string;
  aside?: ReactNode;
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
      }}
    >
      <h3
        style={{
          margin: 0,
          ...TYPE.label,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: colors.muted,
        }}
      >
        {title}
      </h3>
      {aside}
    </div>
  );
};

export const FieldLabel = ({ children }: { children: ReactNode }) => {
  const colors = usePalette();

  return <span style={{ ...TYPE.label, color: colors.muted }}>{children}</span>;
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
                background: isChosen ? colors.accent : colors.surface,
                border: `1px solid ${isChosen ? colors.accent : colors.border}`,
                borderRadius: CONTROL_HEIGHT,
                color: isChosen ? colors.onAccent : colors.text,
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

export type VisitCardData = {
  id: string;
  when: string;
  title: string;
  detail: string;
};

export const VisitCards = ({
  visits,
  chosenId,
  newClientId,
  onPick,
}: {
  visits: VisitCardData[];
  chosenId: string;
  newClientId: string;
  onPick: (id: string) => void;
}) => {
  const colors = usePalette();
  const card = (isChosen: boolean): CSSProperties => ({
    display: 'grid',
    alignContent: 'start',
    gap: SPACE.xs,
    minHeight: 96,
    padding: `${SPACE.md}px ${SPACE.lg}px`,
    background: isChosen ? colors.accentTint : colors.surface,
    border: `2px solid ${isChosen ? colors.accent : colors.border}`,
    borderRadius: RADIUS.card,
    color: colors.text,
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
  });

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: SPACE.md,
      }}
    >
      {visits.map((visit) => (
        <button
          key={visit.id}
          type="button"
          aria-pressed={visit.id === chosenId}
          onClick={() => onPick(visit.id)}
          style={card(visit.id === chosenId)}
        >
          <span
            style={{ ...TYPE.label, fontWeight: 600, color: colors.accent }}
          >
            {visit.when}
          </span>
          <span style={TYPE.rowTitle}>{visit.title}</span>
          <span style={{ ...TYPE.label, color: colors.muted }}>
            {visit.detail}
          </span>
        </button>
      ))}
      <button
        type="button"
        aria-pressed={chosenId === newClientId}
        onClick={() => onPick(newClientId)}
        style={{
          ...card(chosenId === newClientId),
          alignContent: 'center',
          justifyItems: 'center',
          borderStyle: chosenId === newClientId ? 'solid' : 'dashed',
          color: colors.accent,
          fontWeight: 600,
        }}
      >
        + Новый клиент
      </button>
    </div>
  );
};

export const Fact = ({ label, value }: { label: string; value: string }) => {
  const colors = usePalette();

  return (
    <div style={{ display: 'grid', minWidth: 0 }}>
      <span
        style={{
          ...TYPE.label,
          fontSize: '12px',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: colors.muted,
        }}
      >
        {label}
      </span>
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
        background: colors.note,
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
  value,
  onChange,
}: {
  label: string;
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
      <FieldLabel>{label}</FieldLabel>
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
}: {
  widthCm: number | null;
  heightCm: number | null;
  projectionKind: ProjectionKind;
  projectionCm: number;
}) => {
  const colors = usePalette();

  if (widthCm === null || heightCm === null || widthCm <= 0 || heightCm <= 0) {
    return (
      <svg viewBox="0 0 240 172" width="100%" role="img" aria-label="Эскиз">
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
          Введите размеры
        </text>
      </svg>
    );
  }

  const scale = Math.min(140 / widthCm, 120 / heightCm);
  const frontWidth = widthCm * scale;
  const frontHeight = heightCm * scale;
  const left = 30 + (140 - frontWidth) / 2;
  const top = 18 + (120 - frontHeight) / 2;
  const bottom = top + frontHeight;
  const wall = 200;
  const depth = Math.min(projectionCm * scale, 32);
  const hasProjection = projectionKind !== 'NONE' && projectionCm > 0;
  const profile =
    projectionKind === 'BOTTOM'
      ? `M${wall} ${top}L${wall + depth} ${bottom}L${wall} ${bottom}`
      : `M${wall} ${top}H${wall + depth}V${bottom}H${wall}`;

  return (
    <svg
      viewBox="0 0 240 172"
      width="100%"
      role="img"
      aria-label={`Эскиз: ${widthCm} на ${heightCm} см`}
    >
      <rect
        x={left}
        y={top}
        width={frontWidth}
        height={frontHeight}
        fill={colors.accentTint}
        stroke={colors.text}
        strokeWidth="2"
      />
      <text
        x={left + frontWidth / 2}
        y={bottom + 18}
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        fill={colors.text}
      >
        {`${widthCm} см`}
      </text>
      <text
        x={left - 8}
        y={top + frontHeight / 2}
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        fill={colors.text}
        transform={`rotate(-90 ${left - 8} ${top + frontHeight / 2})`}
      >
        {`${heightCm} см`}
      </text>
      <line
        x1={wall - 2}
        y1={top - 6}
        x2={wall - 2}
        y2={bottom + 6}
        stroke={colors.muted}
        strokeWidth="1"
        strokeDasharray="2 3"
      />
      {hasProjection ? (
        <path
          d={profile}
          fill={colors.accentTint}
          stroke={colors.accent}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      ) : (
        <line
          x1={wall}
          y1={top}
          x2={wall}
          y2={bottom}
          stroke={colors.accent}
          strokeWidth="3"
        />
      )}
      {/* Two short lines: «вынос 100 см» on one runs off the right edge. */}
      <text
        x={wall + 12}
        y={bottom + 16}
        textAnchor="middle"
        fontSize="11"
        fill={colors.muted}
      >
        {hasProjection ? 'вынос' : 'сбоку'}
      </text>
      {hasProjection ? (
        <text
          x={wall + 12}
          y={bottom + 29}
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill={colors.text}
        >
          {`${projectionCm} см`}
        </text>
      ) : null}
    </svg>
  );
};

export const PickButton = ({
  photoUrl,
  hasPicture = false,
  title,
  subtitle,
  actionText,
  isEmpty,
  onClick,
}: {
  photoUrl?: string | null;
  // Grilles are chosen by their look; visors by name only
  hasPicture?: boolean;
  title: string;
  subtitle: string;
  actionText: string;
  isEmpty: boolean;
  onClick: () => void;
}) => {
  const colors = usePalette();
  const pictureSize = 60;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACE.md,
        width: '100%',
        minHeight: hasPicture
          ? pictureSize + 2 * SPACE.sm
          : CONTROL_HEIGHT + SPACE.xs,
        padding: `${SPACE.sm}px ${SPACE.lg}px ${SPACE.sm}px ${hasPicture ? SPACE.sm : SPACE.lg}px`,
        background: colors.surface,
        border: `${isEmpty ? 2 : 1}px ${isEmpty ? 'dashed' : 'solid'} ${colors.border}`,
        borderRadius: RADIUS.card,
        color: colors.text,
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      {hasPicture ? (
        photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            style={{
              flex: 'none',
              width: pictureSize,
              height: pictureSize,
              objectFit: 'cover',
              borderRadius: RADIUS.control,
            }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              flex: 'none',
              width: pictureSize,
              height: pictureSize,
              borderRadius: RADIUS.control,
              background: isEmpty ? colors.panel : colors.accentTint,
            }}
          />
        )
      ) : null}
      <span style={{ flex: 1, minWidth: 0, display: 'grid' }}>
        <span style={TYPE.rowTitle}>{title}</span>
        <span
          style={{ ...TYPE.label, ...TABULAR_NUMBERS, color: colors.muted }}
        >
          {subtitle}
        </span>
      </span>
      <span
        style={{
          flex: 'none',
          color: colors.accent,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {actionText} ›
      </span>
    </button>
  );
};

export const QuickPicks = ({
  items,
  onPick,
}: {
  items: { id: string; label: string; photoUrl?: string | null }[];
  onPick: (id: string) => void;
}) => {
  const colors = usePalette();

  if (items.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACE.sm,
        overflowX: 'auto',
        paddingBottom: SPACE.xs,
      }}
    >
      <span style={{ ...TYPE.label, color: colors.muted, flex: 'none' }}>
        Часто:
      </span>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(item.id)}
          style={{
            flex: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: SPACE.sm,
            minHeight: CONTROL_HEIGHT - SPACE.xs,
            padding: `0 ${SPACE.md}px 0 ${item.photoUrl ? SPACE.xs : SPACE.md}px`,
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: CONTROL_HEIGHT,
            color: colors.text,
            font: 'inherit',
            ...TYPE.label,
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          {item.photoUrl ? (
            <img
              src={item.photoUrl}
              alt=""
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                objectFit: 'cover',
              }}
            />
          ) : null}
          {item.label}
        </button>
      ))}
    </div>
  );
};

// Opens under the field it belongs to rather than over the page: the form is
// drawn inside the host page and has no layer of its own to put a dialog on.
export const PickerPanel = ({
  title,
  query,
  placeholder,
  filters,
  onQueryChange,
  onClose,
  children,
}: {
  title: string;
  query: string;
  placeholder: string;
  filters?: ReactNode;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <div
      role="dialog"
      aria-label={title}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: SPACE.md,
        padding: SPACE.md,
        background: colors.panel,
        border: `2px solid ${colors.accent}`,
        borderRadius: RADIUS.card,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: SPACE.md,
        }}
      >
        <span style={TYPE.rowTitle}>{title}</span>
        <button
          type="button"
          onClick={onClose}
          style={{
            minHeight: CONTROL_HEIGHT - SPACE.xs,
            padding: `0 ${SPACE.lg}px`,
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: RADIUS.control,
            color: colors.text,
            font: 'inherit',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Закрыть
        </button>
      </div>
      <TextInput
        label="Поиск"
        placeholder={placeholder}
        value={query}
        onChange={onQueryChange}
        onCancel={onClose}
      />
      {filters}
      <div
        style={{
          display: 'grid',
          gap: SPACE.lg,
          maxHeight: PICKER_LIST_MAX_HEIGHT,
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export const PickerGroup = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <div style={{ display: 'grid', gap: SPACE.sm }}>
    <SectionTitle title={title} />
    {children}
  </div>
);

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

export const ListRow = ({
  title,
  value,
  isSelected,
  onSelect,
}: {
  title: string;
  value: string;
  isSelected: boolean;
  onSelect: () => void;
}) => {
  const colors = usePalette();

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: `${SPACE.xs}px ${SPACE.md}px`,
        minHeight: CONTROL_HEIGHT + SPACE.sm,
        padding: `${SPACE.sm}px ${SPACE.lg}px`,
        background: isSelected ? colors.accentTint : colors.surface,
        border: `${isSelected ? 2 : 1}px solid ${isSelected ? colors.accent : colors.border}`,
        borderRadius: RADIUS.control,
        color: colors.text,
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontWeight: 600 }}>
        {isSelected ? `✓ ${title}` : title}
      </span>
      <span style={{ ...TABULAR_NUMBERS, color: colors.muted }}>{value}</span>
    </button>
  );
};

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
        gap: SPACE.sm,
        overflowX: 'auto',
        paddingBottom: SPACE.xs,
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
              background: isChosen ? colors.accent : colors.surface,
              border: `1px solid ${isChosen ? colors.accent : colors.border}`,
              borderRadius: CONTROL_HEIGHT,
              color: isChosen ? colors.onAccent : colors.text,
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

export const BigNumber = ({
  label,
  value,
}: {
  label: string;
  value: string;
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
        padding: `${SPACE.md}px ${SPACE.lg}px`,
        background: colors.accentTint,
        borderRadius: RADIUS.card,
      }}
    >
      <span style={{ color: colors.accent, fontWeight: 600 }}>{label}</span>
      <span style={{ ...TYPE.keyNumber, ...TABULAR_NUMBERS }}>{value}</span>
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
  onChange,
}: {
  strokes: SignatureStroke[];
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
        height: `${SIGNATURE_PAD_HEIGHT_PX}px`,
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
          y1={SIGNATURE_PAD_HEIGHT_PX - 50}
          x2="96%"
          y2={SIGNATURE_PAD_HEIGHT_PX - 50}
          stroke="#c9ccd4"
          strokeWidth="1"
        />
        {strokes.length === 0 ? (
          <text
            x="50%"
            y={SIGNATURE_PAD_HEIGHT_PX / 2 - 10}
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
