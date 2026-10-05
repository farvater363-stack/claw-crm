import { type CSSProperties, type ReactNode } from 'react';

import { usePalette } from 'src/ui/kit';
import {
  type Palette,
  RADIUS,
  SPACE,
  TABULAR_NUMBERS,
  TYPE,
} from 'src/ui/tokens';
import { type Tone } from 'src/workshop/workshop-board';

// Pieces of «В работе» only. The screen is read from across the workshop and
// worked with a finger on the shared monitor, so every target is at least
// 40 px and the numbers that decide the day are the largest type on a card.

export const toneColors = (colors: Palette, tone: Tone) =>
  tone === 'danger'
    ? { color: colors.danger, background: colors.dangerTint }
    : tone === 'warning'
      ? { color: colors.warning, background: colors.warningTint }
      : tone === 'success'
        ? { color: colors.success, background: colors.successTint }
        : { color: colors.muted, background: colors.panel };

export const ELLIPSIS: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const Photo = ({
  url,
  alt,
  size,
  radius = RADIUS.control,
  caption,
}: {
  url: string | null;
  alt: string;
  size: number | '100%';
  radius?: number;
  // A count laid over the corner, such as how many photos the order has
  caption?: string;
}) => {
  const colors = usePalette();
  const box: CSSProperties = {
    display: 'block',
    width: size,
    height: size === '100%' ? 'auto' : size,
    aspectRatio: size === '100%' ? '4 / 3' : undefined,
    maxWidth: '100%',
    borderRadius: radius,
    background: colors.panel,
    objectFit: 'cover',
  };

  return (
    <div style={{ position: 'relative', flex: 'none', width: size }}>
      {url ? (
        <img src={url} alt={alt} style={box} />
      ) : (
        <div
          aria-hidden
          style={{
            ...box,
            display: 'grid',
            placeItems: 'center',
            color: colors.muted,
            fontSize: '12px',
          }}
        >
          нет фото
        </div>
      )}
      {caption ? (
        <span
          style={{
            position: 'absolute',
            right: SPACE.xs,
            bottom: SPACE.xs,
            padding: '1px 5px',
            borderRadius: 6,
            background: 'rgba(0, 0, 0, 0.65)',
            color: '#ffffff',
            fontSize: '11px',
            lineHeight: '16px',
            fontWeight: 600,
            ...TABULAR_NUMBERS,
          }}
        >
          {caption}
        </span>
      ) : null}
    </div>
  );
};

export const Badge = ({
  tone,
  children,
  size = 'normal',
}: {
  tone: Tone;
  children: ReactNode;
  size?: 'normal' | 'large';
}) => {
  const colors = usePalette();

  return (
    <span
      style={{
        ...toneColors(colors, tone),
        ...TABULAR_NUMBERS,
        padding: size === 'large' ? '4px 10px' : '2px 8px',
        borderRadius: 6,
        fontSize: size === 'large' ? '18px' : '15px',
        lineHeight: size === 'large' ? '26px' : '22px',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
};

export const UrgentTag = () => {
  const colors = usePalette();

  return (
    <span
      style={{
        padding: '2px 6px',
        borderRadius: 5,
        background: colors.urgent,
        color: colors.surface,
        fontSize: '11px',
        lineHeight: '16px',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      Срочно
    </span>
  );
};

export const Chip = ({
  tone = null,
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <span
      style={{
        ...toneColors(colors, tone),
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: '13px',
        lineHeight: '20px',
        fontWeight: tone === null ? 500 : 600,
      }}
    >
      {children}
    </span>
  );
};

export const CommentNote = ({
  text,
  lines,
}: {
  text: string;
  // Shown in full when absent
  lines?: number;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        padding: `${SPACE.xs + 2}px ${SPACE.sm}px`,
        borderRadius: RADIUS.control,
        background: colors.note,
        borderLeft: `3px solid ${colors.warning}`,
        ...TYPE.label,
        ...(lines === undefined
          ? { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
          : {
              display: '-webkit-box',
              WebkitLineClamp: lines,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }),
      }}
    >
      {text}
    </div>
  );
};

export const TimeBar = ({
  percent,
  tone,
  text,
}: {
  percent: number | null;
  tone: Tone;
  text: string;
}) => {
  const colors = usePalette();
  const fill =
    tone === 'danger'
      ? colors.danger
      : tone === 'warning'
        ? colors.warning
        : colors.success;

  return (
    <div style={{ display: 'grid', gap: 3, minWidth: 0, flex: 1 }}>
      {percent === null ? null : (
        <div
          aria-hidden
          style={{
            height: 4,
            borderRadius: 2,
            background: colors.border,
            overflow: 'hidden',
          }}
        >
          <div
            style={{ width: `${percent}%`, height: '100%', background: fill }}
          />
        </div>
      )}
      <span style={{ ...ELLIPSIS, fontSize: '12px', color: colors.muted }}>
        {text}
      </span>
    </div>
  );
};

export const Avatar = ({ name }: { name: string | null }) => {
  const colors = usePalette();

  return (
    <span
      title={name ?? 'Мастер не назначен'}
      aria-label={name ?? 'Мастер не назначен'}
      style={{
        flex: 'none',
        width: 28,
        height: 28,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontSize: '11px',
        fontWeight: 700,
        background: name === null ? 'transparent' : colors.panel,
        border:
          name === null
            ? `1.5px dashed ${colors.border}`
            : `1px solid ${colors.border}`,
        color: name === null ? colors.muted : colors.text,
      }}
    >
      {name === null ? '?' : name.slice(0, 2)}
    </span>
  );
};

export const SmallButton = ({
  onClick,
  isBusy = false,
  variant = 'quiet',
  label,
  children,
}: {
  onClick: () => void;
  isBusy?: boolean;
  variant?: 'quiet' | 'primary';
  label?: string;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <button
      type="button"
      aria-label={label}
      aria-busy={isBusy}
      onClick={() => {
        if (!isBusy) onClick();
      }}
      style={{
        flex: 'none',
        minHeight: 40,
        padding: `0 ${SPACE.md}px`,
        borderRadius: RADIUS.control,
        border:
          variant === 'primary' ? 'none' : `1px solid ${colors.border}`,
        background: variant === 'primary' ? colors.accent : colors.surface,
        color: variant === 'primary' ? colors.onAccent : colors.text,
        font: 'inherit',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {isBusy ? 'Сохраняем…' : children}
    </button>
  );
};

export const Segmented = <TValue extends string>({
  options,
  value,
  label,
  onChange,
}: {
  options: readonly { value: TValue; label: string }[];
  value: TValue;
  label: string;
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
        gap: 2,
        padding: 3,
        borderRadius: RADIUS.control + 2,
        background: colors.panel,
      }}
    >
      {options.map((option) => {
        const isOn = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isOn}
            onClick={() => onChange(option.value)}
            style={{
              minHeight: 36,
              padding: `0 ${SPACE.md}px`,
              border: 'none',
              borderRadius: RADIUS.control,
              background: isOn ? colors.surface : 'transparent',
              color: isOn ? colors.text : colors.muted,
              boxShadow: isOn ? `0 0 0 1px ${colors.border}` : 'none',
              font: 'inherit',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export const Stat = ({
  value,
  label,
  tone = null,
}: {
  value: string;
  label: string;
  tone?: Tone;
}) => {
  const colors = usePalette();
  const look =
    tone === null
      ? {
          color: colors.text,
          background: colors.surface,
          border: `1px solid ${colors.border}`,
        }
      : { ...toneColors(colors, tone), border: '1px solid transparent' };

  return (
    <div
      style={{
        ...look,
        display: 'flex',
        alignItems: 'baseline',
        gap: SPACE.xs + 2,
        padding: `${SPACE.xs + 2}px ${SPACE.md}px`,
        borderRadius: RADIUS.control + 2,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ ...TABULAR_NUMBERS, fontSize: '20px', fontWeight: 700 }}>
        {value}
      </span>
      <span style={{ fontSize: '13px' }}>{label}</span>
    </div>
  );
};

export const SectionCard = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: SPACE.sm,
        padding: SPACE.lg,
        borderRadius: RADIUS.card,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: '12px',
          lineHeight: '16px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: colors.muted,
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
};

