import { type CSSProperties, type ReactNode, useState } from 'react';
import { useColorScheme } from 'twenty-sdk/front-component';

import {
  CONTENT_MAX_WIDTH,
  CONTROL_HEIGHT,
  PALETTE,
  type Palette,
  RADIUS,
  ROW_MIN_HEIGHT,
  SPACE,
  type Tone,
  TYPE,
} from 'src/ui/tokens';

export const usePalette = (): Palette => PALETTE[useColorScheme()];

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
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        maxWidth: CONTENT_MAX_WIDTH,
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
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: SPACE.md,
          marginBottom: SPACE.xl,
        }}
      >
        <h2 style={{ margin: 0, ...TYPE.title }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
};

export const Section = ({
  title,
  children,
}: {
  title: string;
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
        {children}
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
  title,
  value,
  pill,
  isOpen,
  onToggle,
  children,
}: {
  title: ReactNode;
  value?: ReactNode;
  pill?: ReactNode;
  isOpen: boolean;
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
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: SPACE.md,
          width: '100%',
          minHeight: ROW_MIN_HEIGHT,
          padding: `${SPACE.sm}px ${SPACE.lg}px`,
          background: 'transparent',
          border: 'none',
          color: colors.text,
          font: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span style={{ flex: '1 1 160px', ...TYPE.rowTitle }}>{title}</span>
        {value}
        {pill}
        <span aria-hidden style={{ color: colors.muted }}>
          {isOpen ? '⌄' : '›'}
        </span>
      </button>
      {isOpen && (
        <div
          style={{
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
  onClick,
  children,
}: {
  variant?: 'primary' | 'quiet' | 'link';
  isBusy?: boolean;
  busyText?: string;
  onClick: () => void;
  children: ReactNode;
}) => {
  const colors = usePalette();
  const base: CSSProperties = {
    minHeight: CONTROL_HEIGHT,
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
  children,
}: {
  label: string;
  error?: string | null;
  isSaved?: boolean;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <label style={{ display: 'grid', gap: SPACE.xs, ...TYPE.label }}>
      <span style={{ color: colors.muted }}>
        {label}
        {isSaved && (
          <span style={{ color: colors.success, marginLeft: SPACE.sm }}>
            ✓ Сохранено
          </span>
        )}
      </span>
      {children}
      {error ? (
        <span style={{ ...TYPE.body, color: colors.danger }}>{error}</span>
      ) : null}
    </label>
  );
};

export const TextInput = ({
  value,
  onChange,
  onCommit,
  inputMode = 'text',
  suffix,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  // Fires on Enter and on every blur, changed or not: a consumer must skip a
  // value equal to the saved one, or it saves twice
  onCommit?: () => void;
  inputMode?: 'text' | 'decimal' | 'numeric';
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
        minHeight: CONTROL_HEIGHT,
        padding: `0 ${SPACE.md}px`,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.control,
        background: colors.surface,
        // The inner input drops its own outline so the ring wraps the suffix too
        outline: isFocused ? `2px solid ${colors.accent}` : 'none',
      }}
    >
      <input
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          onCommit?.();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onCommit?.();
        }}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: colors.text,
          font: 'inherit',
          ...TYPE.body,
        }}
      />
      {suffix ? <span style={{ color: colors.muted }}>{suffix}</span> : null}
    </span>
  );
};

export const SelectInput = ({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) => {
  const colors = usePalette();

  return (
    <select
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

export const InlineConfirm = ({
  question,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}: {
  question: string;
  confirmText: string;
  cancelText: string;
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
    <Button onClick={onConfirm}>{confirmText}</Button>
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
