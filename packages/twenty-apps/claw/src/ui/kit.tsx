import { type CSSProperties, type ReactNode, useState } from 'react';
import { useColorScheme } from 'twenty-sdk/front-component';

import { groupThousands } from 'src/ui/format';
import {
  COLUMNS_MIN_WIDTH,
  CONTENT_MAX_WIDTH,
  CONTROL_HEIGHT,
  PALETTE,
  type Palette,
  RADIUS,
  ROW_MIN_HEIGHT,
  SPACE,
  TABULAR_NUMBERS,
  type Tone,
  TYPE,
} from 'src/ui/tokens';

export const usePalette = (): Palette => PALETTE[useColorScheme()];

// A plain grid's one column is never narrower than its content, so an input
// (about 200 px wide by itself) would overflow a narrower parent. This
// column takes the parent's width and the content shrinks to it.
const SHRINKABLE_GRID = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
} as const;

const CHEVRON_WIDTH = SPACE.md;

const toneColors = (colors: Palette, tone: Tone) =>
  tone === 'danger'
    ? { color: colors.danger, background: colors.dangerTint }
    : tone === 'warning'
      ? { color: colors.warning, background: colors.warningTint }
      : tone === 'success'
        ? { color: colors.success, background: colors.successTint }
        : { color: colors.muted, background: colors.panel };

export const Screen = ({
  title,
  subtitle,
  action,
  isWide = false,
  maxWidth = CONTENT_MAX_WIDTH,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  // The wall screen uses the whole width; every other screen is a column
  isWide?: boolean;
  maxWidth?: number;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        maxWidth: isWide ? 'none' : maxWidth,
        margin: '0 auto',
        padding: SPACE.lg,
        color: colors.text,
        fontFamily: 'inherit',
        ...TYPE.body,
      }}
    >
      <div
        style={{
          display: 'flex',
          // An action too wide for the title's line goes under the title
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: SPACE.md,
          marginBottom: SPACE.xl,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, ...TYPE.title }}>{title}</h2>
          {subtitle ? (
            <div
              style={{
                ...TYPE.label,
                color: colors.muted,
                marginTop: SPACE.xs,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
};

export const Section = ({
  title,
  footer,
  children,
}: {
  title: string;
  // The section's own action, such as its add button, under the rows
  footer?: ReactNode;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <section style={{ marginBottom: SPACE.xl }}>
      <div
        style={{ ...TYPE.label, color: colors.muted, marginBottom: SPACE.sm }}
      >
        {title}
      </div>
      <div
        style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: RADIUS.card,
          overflow: 'hidden',
        }}
      >
        {/* Every row draws its top border; pulled up by one pixel, the first
            one is clipped instead of doubling the card's own border. */}
        <div style={{ marginTop: -1 }}>
          {children}
          {footer ? (
            <div
              style={{
                padding: SPACE.lg,
                borderTop: `1px solid ${colors.border}`,
                display: 'grid',
                gap: SPACE.md,
                justifyItems: 'start',
              }}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export const StatePill = ({ tone, text }: { tone: Tone; text: string }) => {
  const colors = usePalette();

  return (
    <span
      style={{
        ...toneColors(colors, tone),
        ...TYPE.body,
        fontWeight: tone === 'danger' ? 600 : 400,
        padding: `${SPACE.xs}px ${SPACE.md}px`,
        borderRadius: RADIUS.control,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
};

export const Row = ({
  leading,
  title,
  value,
  pill,
  action,
  isOpen,
  onToggle,
  children,
}: {
  leading?: ReactNode;
  title: ReactNode;
  value?: ReactNode;
  pill?: ReactNode;
  // The row's own button. Beside the header, not inside it: the header is a button itself
  action?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) => {
  const colors = usePalette();
  // A leading thumbnail is as tall as a control; without one the first line
  // fills the row's minimum height.
  const firstLineHeight = leading
    ? CONTROL_HEIGHT
    : ROW_MIN_HEIGHT - 2 * SPACE.sm;
  const wrapping: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: `${SPACE.xs}px ${SPACE.md}px`,
  };

  return (
    <div
      style={{
        borderTop: `1px solid ${colors.border}`,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        style={{
          ...wrapping,
          position: 'relative',
          // Alone on its line it takes the whole width; an action wraps under it on a phone
          flex: '1 1 240px',
          minWidth: 0,
          minHeight: ROW_MIN_HEIGHT,
          // The right padding is the chevron's room: it is placed there, not
          // laid out with the rest, so it stays at the end of the first line
          // however the name, the value and the pill wrap.
          padding: `${SPACE.sm}px ${SPACE.lg + CHEVRON_WIDTH + SPACE.md}px ${SPACE.sm}px ${SPACE.lg}px`,
          background: 'transparent',
          border: 'none',
          color: colors.text,
          font: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: SPACE.md,
            flex: '1 1 auto',
            minWidth: 0,
            minHeight: firstLineHeight,
          }}
        >
          {leading}
          <span
            style={{ minWidth: 0, overflowWrap: 'anywhere', ...TYPE.rowTitle }}
          >
            {title}
          </span>
        </span>
        {/* One group: beside the name when both fit on the line, under it as
            a whole when they do not. */}
        {value || pill ? (
          <span style={{ ...wrapping, minWidth: 0 }}>
            {value ? <span style={TABULAR_NUMBERS}>{value}</span> : null}
            {pill}
          </span>
        ) : null}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: SPACE.sm,
            right: SPACE.lg,
            width: CHEVRON_WIDTH,
            height: firstLineHeight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            color: colors.muted,
          }}
        >
          {isOpen ? '⌄' : '›'}
        </span>
      </button>
      {action ? (
        <div style={{ padding: `${SPACE.sm}px ${SPACE.lg}px` }}>{action}</div>
      ) : null}
      {isOpen && (
        <div
          style={{
            flex: '1 1 100%',
            minWidth: 0,
            padding: `0 ${SPACE.lg}px ${SPACE.lg}px`,
            display: 'grid',
            gap: SPACE.md,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export const Button = ({
  variant = 'quiet',
  isBusy = false,
  busyText = 'Сохраняем…',
  label,
  isWideOnPhone = false,
  onClick,
  children,
}: {
  variant?: 'primary' | 'quiet' | 'link';
  isBusy?: boolean;
  busyText?: string;
  // The accessible name of a button whose text is a symbol, like «×»
  label?: string;
  // The primary button of a form is as wide as its block on a phone, where a
  // thumb has to find it
  isWideOnPhone?: boolean;
  onClick: () => void;
  children: ReactNode;
}) => {
  const colors = usePalette();
  const base: CSSProperties = {
    minHeight: CONTROL_HEIGHT,
    // The same switch as in Columns: the whole width while the block is
    // narrower than the threshold, the control's own minimum above it.
    minWidth: isWideOnPhone
      ? `min(100%, max(${CONTROL_HEIGHT}px, (${COLUMNS_MIN_WIDTH}px - 100%) * 999))`
      : CONTROL_HEIGHT,
    padding: `0 ${SPACE.lg}px`,
    borderRadius: RADIUS.control,
    font: 'inherit',
    fontWeight: 600,
    cursor: 'pointer',
  };
  const look: CSSProperties =
    variant === 'primary'
      ? { background: colors.accent, color: colors.onAccent, border: 'none' }
      : variant === 'link'
        ? {
            background: 'transparent',
            color: colors.accent,
            border: 'none',
            padding: 0,
            fontWeight: 400,
          }
        : {
            background: 'transparent',
            color: colors.text,
            border: `1px solid ${colors.border}`,
          };

  return (
    <button
      type="button"
      style={{ ...base, ...look }}
      aria-busy={isBusy}
      aria-label={label}
      onClick={() => {
        if (!isBusy) onClick();
      }}
    >
      {isBusy ? busyText : children}
    </button>
  );
};

export const Field = ({
  label,
  error,
  isSaved = false,
  isInline = false,
  children,
}: {
  label: string;
  error?: string | null;
  isSaved?: boolean;
  // The label is the thing being measured (a material) and sits beside the
  // control at reading size; it wraps above the control on a phone
  isInline?: boolean;
  children: ReactNode;
}) => {
  const colors = usePalette();
  const saved = isSaved && (
    <span
      style={{ ...TYPE.label, color: colors.success, marginLeft: SPACE.sm }}
    >
      ✓ Сохранено
    </span>
  );
  const errorLine = error ? (
    <span style={{ ...TYPE.body, color: colors.danger, flexBasis: '100%' }}>
      {error}
    </span>
  ) : null;

  if (isInline) {
    return (
      <label
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: `${SPACE.xs}px ${SPACE.md}px`,
          ...TYPE.body,
        }}
      >
        <span style={{ flex: '1 1 160px' }}>
          {label}
          {saved}
        </span>
        <span style={{ flex: '0 1 200px', minWidth: 0, ...SHRINKABLE_GRID }}>
          {children}
        </span>
        {errorLine}
      </label>
    );
  }

  return (
    <label style={{ ...SHRINKABLE_GRID, gap: SPACE.xs, ...TYPE.label }}>
      <span style={{ color: colors.muted }}>
        {label}
        {saved}
      </span>
      {children}
      {errorLine}
    </label>
  );
};

export const TextInput = ({
  value,
  onChange,
  onCommit,
  onEnter,
  onCancel,
  inputMode = 'text',
  type = 'text',
  isMoney = false,
  isLarge = false,
  prefix,
  suffix,
  placeholder,
  label,
}: {
  // `datetime-local` gives local wall time without a zone: «2026-10-12T14:00»;
  // `date` a calendar day: «2026-10-12»
  type?: 'text' | 'date' | 'datetime-local';
  value: string;
  onChange: (value: string) => void;
  // The accessible name. Without it the name is all the text of the field
  // around the input: its label, the unit, «Сохранено», an error
  label?: string;
  // Fires on Enter and on every blur, changed or not: a consumer must skip a
  // value equal to the saved one, or it saves twice
  onCommit?: () => void;
  // Enter alone, for a form that must not save when the field loses focus
  onEnter?: () => void;
  // Escape, for a field in a form that can be closed
  onCancel?: () => void;
  inputMode?: 'text' | 'decimal' | 'numeric';
  // A whole sum: thousands get their commas when the field is left. Regrouping
  // on every key would scramble the digits: the caret keeps its index here.
  isMoney?: boolean;
  // A size typed on site, read at arm's length
  isLarge?: boolean;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
}) => {
  const colors = usePalette();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACE.sm,
        minHeight: isLarge ? CONTROL_HEIGHT + SPACE.md : CONTROL_HEIGHT,
        padding: `0 ${SPACE.md}px`,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.control,
        background: colors.surface,
        // The inner input drops its own outline so the ring wraps the suffix too
        outline: isFocused ? `2px solid ${colors.accent}` : 'none',
      }}
    >
      {prefix ? (
        <span
          style={{ flex: 'none', whiteSpace: 'nowrap', color: colors.muted }}
        >
          {prefix}
        </span>
      ) : null}
      <input
        type={type}
        aria-label={label}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);

          if (isMoney && groupThousands(value) !== value) {
            onChange(groupThousands(value));
          }

          onCommit?.();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onCommit?.();
            onEnter?.();
          }

          if (event.key === 'Escape') onCancel?.();
        }}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: colors.text,
          font: 'inherit',
          ...(isLarge ? TYPE.keyNumber : TYPE.body),
          ...(inputMode === 'text' ? {} : TABULAR_NUMBERS),
        }}
      />
      {suffix ? (
        <span
          style={{ flex: 'none', whiteSpace: 'nowrap', color: colors.muted }}
        >
          {suffix}
        </span>
      ) : null}
    </span>
  );
};

export const SelectInput = ({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label?: string;
}) => {
  const colors = usePalette();

  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{
        minHeight: CONTROL_HEIGHT,
        padding: `0 ${SPACE.md}px`,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.control,
        background: colors.surface,
        color: colors.text,
        font: 'inherit',
        ...TYPE.body,
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

export const Checkbox = ({
  label,
  isChecked,
  onChange,
}: {
  label: string;
  isChecked: boolean;
  onChange: (isChecked: boolean) => void;
}) => {
  const colors = usePalette();

  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: SPACE.sm,
        minHeight: CONTROL_HEIGHT,
        cursor: 'pointer',
        ...TYPE.body,
      }}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: 20, height: 20, margin: 0, accentColor: colors.accent }}
      />
      {label}
    </label>
  );
};

export const InlineConfirm = ({
  question,
  confirmText,
  cancelText,
  confirmVariant = 'quiet',
  isBusy = false,
  onConfirm,
  onCancel,
}: {
  question: string;
  confirmText: string;
  cancelText: string;
  // `primary` where confirming is the one thing the screen asks for
  confirmVariant?: 'primary' | 'quiet';
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: SPACE.md,
    }}
  >
    <span style={{ flex: '1 1 200px' }}>{question}</span>
    <Button variant={confirmVariant} isBusy={isBusy} onClick={onConfirm}>
      {confirmText}
    </Button>
    <Button variant="link" onClick={onCancel}>
      {cancelText}
    </Button>
  </div>
);

export const UndoBar = ({
  text,
  onUndo,
}: {
  text: string;
  onUndo: () => void;
}) => {
  const colors = usePalette();

  return (
    <div
      role="status"
      style={{
        position: 'sticky',
        bottom: SPACE.lg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: SPACE.md,
        padding: `${SPACE.sm}px ${SPACE.lg}px`,
        background: colors.panel,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.card,
      }}
    >
      <span>{text}</span>
      <Button variant="link" onClick={onUndo}>
        Вернуть
      </Button>
    </div>
  );
};

export const EmptyState = ({
  text,
  actionText,
  onAction,
}: {
  text: string;
  actionText: string;
  onAction: () => void;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'grid',
        gap: SPACE.lg,
        justifyItems: 'start',
        padding: SPACE.xl,
        background: colors.panel,
        borderRadius: RADIUS.card,
      }}
    >
      <span>{text}</span>
      <Button variant="primary" onClick={onAction}>
        {actionText}
      </Button>
    </div>
  );
};

export const ErrorNote = ({
  text,
  onRetry,
}: {
  text: string;
  onRetry?: () => void;
}) => {
  const colors = usePalette();

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: SPACE.md,
        padding: SPACE.lg,
        color: colors.danger,
        background: colors.dangerTint,
        borderRadius: RADIUS.card,
      }}
    >
      <span style={{ flex: '1 1 200px' }}>{text}</span>
      {onRetry ? <Button onClick={onRetry}>Повторить</Button> : null}
    </div>
  );
};

export const SkeletonRows = ({ count }: { count: number }) => {
  const colors = usePalette();

  return (
    <div aria-busy="true" style={{ display: 'grid', gap: 1 }}>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          style={{ height: ROW_MIN_HEIGHT, background: colors.panel }}
        />
      ))}
    </div>
  );
};

export const PhotoTile = ({
  name,
  photoUrl,
  isSelected,
  onSelect,
  caption,
}: {
  name: string;
  photoUrl: string | null;
  isSelected: boolean;
  onSelect: () => void;
  caption?: string;
}) => {
  const colors = usePalette();

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      style={{
        display: 'grid',
        // A tile stretched to its row's height must not stretch its own rows:
        // the square would take its size from the height and leave the tile.
        alignContent: 'start',
        gap: SPACE.xs,
        padding: SPACE.sm,
        background: colors.surface,
        border: `2px solid ${isSelected ? colors.accent : colors.border}`,
        borderRadius: RADIUS.card,
        color: colors.text,
        font: 'inherit',
        cursor: 'pointer',
      }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt=""
          style={{
            width: '100%',
            aspectRatio: '1',
            objectFit: 'cover',
            borderRadius: RADIUS.control,
          }}
        />
      ) : (
        <span
          style={{
            width: '100%',
            aspectRatio: '1',
            background: colors.panel,
            borderRadius: RADIUS.control,
          }}
        />
      )}
      <span style={TYPE.body}>{name}</span>
      {caption ? (
        <span style={{ ...TYPE.label, color: colors.muted }}>{caption}</span>
      ) : null}
    </button>
  );
};

export const Group = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <div style={{ display: 'grid', gap: SPACE.md }}>
    <div style={{ ...TYPE.body, fontWeight: 600 }}>{title}</div>
    {children}
  </div>
);

// Fields in one row when the block is wider than a phone, one under another
// when it is not. The basis is nothing above the threshold and huge below it,
// so the fields never split two and one.
export const Columns = ({ children }: { children: ReactNode[] }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.md }}>
    {children.map((child, index) => (
      <div
        key={index}
        style={{
          flex: `1 1 calc((${COLUMNS_MIN_WIDTH}px - 100%) * 999)`,
          minWidth: 0,
          ...SHRINKABLE_GRID,
        }}
      >
        {child}
      </div>
    ))}
  </div>
);

// A field with its own action beside it, such as «×» on a composition line
export const Line = ({
  action,
  children,
}: {
  action: ReactNode;
  children: ReactNode;
}) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACE.sm }}>
    <div style={{ flex: 1, minWidth: 0, ...SHRINKABLE_GRID }}>{children}</div>
    {action}
  </div>
);

export const Wrap = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: SPACE.md,
    }}
  >
    {children}
  </div>
);

// A line of text that is not a field's own: a note in the urgency's colour,
// or, in `danger`, an error that belongs to several fields at once
export const Hint = ({
  text,
  tone = 'neutral',
  isSmall = false,
}: {
  text: string;
  tone?: Tone;
  // Under a row's title, which is larger and bold
  isSmall?: boolean;
}) => {
  const colors = usePalette();

  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      style={{
        color: toneColors(colors, tone).color,
        ...(isSmall ? TYPE.label : {}),
      }}
    >
      {text}
    </div>
  );
};

export const Link = ({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <a
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: SPACE.xs,
        minHeight: CONTROL_HEIGHT,
        color: colors.accent,
        textDecoration: 'none',
      }}
    >
      {children}
    </a>
  );
};

// On top, not at the bottom like UndoBar: the save button of a long list has
// to be in reach from any row, and Twenty's own floating navigation covers
// the bottom of a phone screen.
export const StickyBar = ({ children }: { children: ReactNode }) => {
  const colors = usePalette();

  return (
    <div
      style={{
        ...SHRINKABLE_GRID,
        position: 'sticky',
        top: 0,
        // Above the inputs of the rows that scroll under it
        zIndex: 1,
        gap: SPACE.sm,
        marginBottom: SPACE.lg,
        padding: `${SPACE.md}px ${SPACE.lg}px`,
        // Opaque, or the rows would show through
        background: colors.panel,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.card,
      }}
    >
      {children}
    </div>
  );
};

// Wider than this the panel floats as a dialog; narrower it is a sheet along
// the bottom edge, where a thumb reaches it.
const SHEET_DIALOG_FROM_WIDTH = 640;
const SHEET_MAX_WIDTH = 560;
// The same switch as Button's isWideOnPhone, on the viewport: 0 on a phone,
// the full amount on a wide screen.
const onWideScreen = (value: string) =>
  `clamp(0px, (100vw - ${SHEET_DIALOG_FROM_WIDTH}px) * 999, ${value})`;

// A form opened from a button. The screen stays underneath; a tap beside the
// panel, «×» or Escape closes it unless a save is on its way.
export const Sheet = ({
  title,
  isBusy = false,
  onClose,
  footer,
  children,
}: {
  title: string;
  isBusy?: boolean;
  onClose: () => void;
  // The form's save button and its note, kept in view under the fields
  footer?: ReactNode;
  children: ReactNode;
}) => {
  const colors = usePalette();
  const close = () => {
    if (!isBusy) onClose();
  };

  return (
    <div
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
      }}
      // The widget wrapper has will-change: transform, which traps a fixed
      // overlay inside it; the panel sticks to the page's scroll area (cqh).
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '100%',
        minHeight: '100cqh',
        zIndex: 1000,
      }}
    >
      <div
        role="presentation"
        // A sibling of the panel, not its parent: stopPropagation in a front
        // component never reaches the host's event.
        onClick={close}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
        }}
      />
      <div
        style={{
          position: 'sticky',
          top: 0,
          height: '100cqh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingBottom: onWideScreen('10cqh'),
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          style={{
            pointerEvents: 'auto',
            width: '100%',
            maxWidth: SHEET_MAX_WIDTH,
            maxHeight: '85cqh',
            display: 'flex',
            flexDirection: 'column',
            background: colors.surface,
            color: colors.text,
            borderRadius: `${RADIUS.card + SPACE.xs}px ${RADIUS.card + SPACE.xs}px ${onWideScreen(`${RADIUS.card + SPACE.xs}px`)} ${onWideScreen(`${RADIUS.card + SPACE.xs}px`)}`,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
            ...TYPE.body,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: SPACE.md,
              padding: `${SPACE.lg}px ${SPACE.lg}px ${SPACE.md}px`,
            }}
          >
            <h3 style={{ margin: 0, ...TYPE.rowTitle }}>{title}</h3>
            <Button label="Закрыть" onClick={close}>
              ×
            </Button>
          </div>
          <div
            style={{
              ...SHRINKABLE_GRID,
              gap: SPACE.md,
              overflowY: 'auto',
              padding: `0 ${SPACE.lg}px ${SPACE.lg}px`,
            }}
          >
            {children}
          </div>
          {footer ? (
            <div
              style={{
                ...SHRINKABLE_GRID,
                gap: SPACE.sm,
                padding: `${SPACE.md}px ${SPACE.lg}px ${SPACE.lg}px`,
                borderTop: `1px solid ${colors.border}`,
              }}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// Two or three views of one thing; the chosen one is outlined in the accent.
export const Tabs = <TValue extends string>({
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
      {options.map((option) => {
        const isChosen = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isChosen}
            onClick={() => onChange(option.value)}
            style={{
              minHeight: CONTROL_HEIGHT,
              padding: `0 ${SPACE.lg}px`,
              background: colors.surface,
              border: `2px solid ${isChosen ? colors.accent : colors.border}`,
              borderRadius: RADIUS.control,
              color: isChosen ? colors.accent : colors.text,
              font: 'inherit',
              fontWeight: isChosen ? 600 : 400,
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

// A line of a statement: what it is on the left, its sum on the right.
export const AmountLine = ({
  amount,
  isTotal = false,
  children,
}: {
  amount: string;
  isTotal?: boolean;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: SPACE.md,
        ...(isTotal && {
          paddingTop: SPACE.sm,
          borderTop: `1px solid ${colors.border}`,
          fontWeight: 600,
        }),
      }}
    >
      <span style={{ minWidth: 0 }}>{children}</span>
      <span style={{ ...TABULAR_NUMBERS, whiteSpace: 'nowrap' }}>{amount}</span>
    </div>
  );
};

// How full something is, 0 to 1. The colour repeats the pill beside it, which
// carries the word.
export const LevelBar = ({
  level,
  tone,
}: {
  level: number;
  tone: 'danger' | 'warning' | 'success';
}) => {
  const colors = usePalette();

  return (
    <span
      aria-hidden
      style={{
        display: 'block',
        height: SPACE.sm,
        borderRadius: SPACE.xs,
        background: colors.panel,
        border: `1px solid ${colors.border}`,
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          display: 'block',
          height: '100%',
          width: `${Math.round(level * 100)}%`,
          background: colors[tone],
        }}
      />
    </span>
  );
};

export const StaticRow = ({ children }: { children: ReactNode }) => {
  const colors = usePalette();

  return (
    <div
      style={{
        ...SHRINKABLE_GRID,
        alignContent: 'center',
        gap: SPACE.md,
        minHeight: ROW_MIN_HEIGHT,
        padding: `${SPACE.sm}px ${SPACE.lg}px`,
        borderTop: `1px solid ${colors.border}`,
      }}
    >
      {children}
    </div>
  );
};

export const Thumbnail = ({
  photoUrl,
  alt = '',
  size = CONTROL_HEIGHT,
}: {
  photoUrl: string | null;
  alt?: string;
  size?: number;
}) => {
  const colors = usePalette();
  const box: CSSProperties = {
    flex: 'none',
    width: size,
    height: size,
    borderRadius: RADIUS.control,
    background: colors.panel,
  };

  return photoUrl ? (
    <img src={photoUrl} alt={alt} style={{ ...box, objectFit: 'cover' }} />
  ) : (
    <span aria-hidden style={{ ...box, display: 'inline-block' }} />
  );
};

export const FilePicker = ({
  text,
  accept,
  isBusy = false,
  busyText = 'Сохраняем…',
  onPick,
}: {
  text: string;
  accept: string;
  isBusy?: boolean;
  busyText?: string;
  onPick: (files: File[]) => void;
}) => {
  const colors = usePalette();
  const [pickCount, setPickCount] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <label
      aria-busy={isBusy}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: CONTROL_HEIGHT,
        padding: `0 ${SPACE.lg}px`,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.control,
        color: colors.text,
        ...TYPE.body,
        fontWeight: 600,
        cursor: 'pointer',
        // The input itself is hidden, so the ring is drawn on its label
        outline: isFocused ? `2px solid ${colors.accent}` : 'none',
      }}
    >
      {isBusy ? busyText : text}
      {/* Re-keyed per pick so choosing the same file again still fires
          onChange. */}
      <input
        key={pickCount}
        type="file"
        accept={accept}
        multiple
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          overflow: 'hidden',
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);

          setPickCount((count) => count + 1);

          if (!isBusy) onPick(files);
        }}
      />
    </label>
  );
};

type StepTrackerProps = {
  steps: readonly { key: string; label: string }[];
  currentKey: string | null;
};

// The steps of an order in a row. A done step carries a check mark and the
// current one is filled and bold, so the state never rests on colour alone.
export const StepTracker = ({ steps, currentKey }: StepTrackerProps) => {
  const colors = usePalette();
  const currentIndex = steps.findIndex((step) => step.key === currentKey);

  return (
    <ol
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: SPACE.sm,
        margin: 0,
        padding: 0,
        listStyle: 'none',
      }}
    >
      {steps.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <li
            key={step.key}
            aria-current={isCurrent ? 'step' : undefined}
            style={{
              ...TYPE.body,
              fontWeight: isCurrent ? 600 : 400,
              padding: `${SPACE.xs}px ${SPACE.md}px`,
              borderRadius: RADIUS.control,
              border: `1px solid ${
                isCurrent
                  ? colors.accent
                  : isDone
                    ? colors.successTint
                    : colors.border
              }`,
              background: isCurrent
                ? colors.accent
                : isDone
                  ? colors.successTint
                  : 'transparent',
              color: isCurrent
                ? colors.onAccent
                : isDone
                  ? colors.success
                  : colors.muted,
            }}
          >
            {isDone ? `✓ ${step.label}` : step.label}
          </li>
        );
      })}
    </ol>
  );
};

// The screen's main switch: one grey strip, the chosen view raised in white.
export const TabStrip = <TValue extends string>({
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
      role="tablist"
      style={{
        display: 'flex',
        gap: SPACE.xs,
        padding: SPACE.xs,
        overflowX: 'auto',
        background: colors.panel,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.card,
      }}
    >
      {options.map((option) => {
        const isChosen = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isChosen}
            onClick={() => onChange(option.value)}
            style={{
              flex: '1 0 auto',
              minHeight: CONTROL_HEIGHT - SPACE.sm,
              padding: `0 ${SPACE.md}px`,
              background: isChosen ? colors.surface : 'transparent',
              border: 'none',
              borderRadius: RADIUS.control,
              boxShadow: isChosen ? '0 1px 3px rgba(0, 0, 0, 0.12)' : 'none',
              color: isChosen ? colors.text : colors.muted,
              font: 'inherit',
              fontWeight: 600,
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

export type StatTone = 'in' | 'out' | 'warning' | 'neutral';

// Key figures side by side: as many per line as fit, at least two on a phone.
export const StatTiles = ({
  tiles,
}: {
  tiles: { label: string; value: string; tone: StatTone }[];
}) => {
  const colors = usePalette();
  const valueColor: Record<StatTone, string> = {
    in: colors.success,
    out: colors.danger,
    warning: colors.warning,
    neutral: colors.text,
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: SPACE.sm,
      }}
    >
      {tiles.map((tile) => (
        <div
          key={tile.label}
          style={{
            display: 'grid',
            gap: SPACE.xs,
            alignContent: 'start',
            padding: `${SPACE.md}px ${SPACE.lg}px`,
            background: colors.panel,
            borderRadius: RADIUS.card,
          }}
        >
          <span style={{ ...TYPE.label, color: colors.muted }}>
            {tile.label}
          </span>
          <span
            style={{
              ...TABULAR_NUMBERS,
              fontSize: '20px',
              lineHeight: '28px',
              fontWeight: 600,
              color: valueColor[tile.tone],
              whiteSpace: 'nowrap',
            }}
          >
            {tile.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// A card with its title and buttons inside, over rows that draw their own
// top border.
export const Panel = ({
  title,
  subtitle,
  action,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <section
      style={{
        marginBottom: SPACE.lg,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.card,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: SPACE.md,
          padding: SPACE.lg,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, ...TYPE.rowTitle }}>{title}</h3>
          {subtitle ? (
            <div
              style={{ ...TYPE.label, ...TABULAR_NUMBERS, color: colors.muted }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
        {action}
      </div>
      {children}
      {footer ? (
        <div
          style={{
            padding: SPACE.lg,
            borderTop: `1px solid ${colors.border}`,
            display: 'grid',
            gap: SPACE.md,
            justifyItems: 'start',
          }}
        >
          {footer}
        </div>
      ) : null}
    </section>
  );
};

// Short explanations side by side, each a title over a line or two of text.
export const InfoCards = ({
  cards,
}: {
  cards: { title: string; text: string }[];
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: SPACE.sm,
      }}
    >
      {cards.map((card) => (
        <div
          key={card.title}
          style={{
            display: 'grid',
            gap: SPACE.xs,
            alignContent: 'start',
            padding: `${SPACE.md}px ${SPACE.lg}px`,
            background: colors.panel,
            borderRadius: RADIUS.card,
          }}
        >
          <span style={{ fontWeight: 600 }}>{card.title}</span>
          <span style={{ ...TYPE.label, color: colors.muted }}>
            {card.text}
          </span>
        </div>
      ))}
    </div>
  );
};
