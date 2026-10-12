import { type CSSProperties } from 'react';

import {
  type PadKey,
  type PadValueKind,
  sanitizePadInput,
} from 'src/measurer-form/pad-input';
import { usePalette } from 'src/ui/kit';
import {
  CONTROL_HEIGHT,
  RADIUS,
  SPACE,
  TABULAR_NUMBERS,
  TYPE,
} from 'src/ui/tokens';

const KEY_HEIGHT_PX = 56;
const DIGIT_ROWS: PadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

// A number typed on our own keys: a tablet's keyboard covers half the
// screen and hides the sketch the measurer checks the size against.
export type PadTarget = {
  id: string;
  label: string;
  unit: string;
  kind: PadValueKind;
  value: string;
  onChange: (value: string) => void;
};

export const NumberPad = ({
  target,
  nextLabel,
  onKey,
  onNext,
  onDone,
}: {
  target: PadTarget | null;
  // The field «Далее» moves to; null on the last one, where it says «Готово»
  nextLabel: string | null;
  onKey: (key: PadKey) => void;
  onNext: () => void;
  onDone: () => void;
}) => {
  const colors = usePalette();
  const isIdle = target === null;
  const key: CSSProperties = {
    minHeight: KEY_HEIGHT_PX,
    minWidth: 0,
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: RADIUS.control + SPACE.xs,
    color: colors.text,
    font: 'inherit',
    fontSize: '24px',
    lineHeight: '28px',
    cursor: isIdle ? 'default' : 'pointer',
    opacity: isIdle ? 0.5 : 1,
    touchAction: 'manipulation',
    ...TABULAR_NUMBERS,
  };
  const press = (padKey: PadKey) => {
    if (!isIdle) onKey(padKey);
  };
  const extraKey: PadKey = target?.kind === 'money' ? '000' : ',';

  return (
    <div style={{ display: 'grid', gap: SPACE.sm, minWidth: 0 }}>
      <div
        style={{
          ...TYPE.label,
          textAlign: 'center',
          color: isIdle ? colors.muted : colors.text,
          overflowWrap: 'anywhere',
        }}
      >
        {isIdle ? (
          'Нажмите на поле с числом'
        ) : (
          <>
            <strong>{target.label}</strong>
            {target.unit === '' ? '' : `, ${target.unit}`}
          </>
        )}
      </div>
      <div
        role="group"
        aria-label="Цифры"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: SPACE.sm,
        }}
      >
        {DIGIT_ROWS.flat().map((digit) => (
          <button
            key={digit}
            type="button"
            style={key}
            onClick={() => press(digit)}
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          aria-label={extraKey === ',' ? 'Запятая' : 'Три нуля'}
          style={key}
          onClick={() => press(extraKey)}
        >
          {extraKey}
        </button>
        <button type="button" style={key} onClick={() => press('0')}>
          0
        </button>
        <button
          type="button"
          aria-label="Стереть цифру"
          style={key}
          onClick={() => press('BACKSPACE')}
        >
          ⌫
        </button>
      </div>
      <button
        type="button"
        disabled={isIdle}
        onClick={nextLabel === null ? onDone : onNext}
        style={{
          minHeight: CONTROL_HEIGHT + SPACE.sm,
          padding: `${SPACE.xs}px ${SPACE.md}px`,
          background: isIdle ? colors.panel : colors.accent,
          border: 'none',
          borderRadius: RADIUS.control + SPACE.xs,
          color: isIdle ? colors.muted : colors.onAccent,
          font: 'inherit',
          ...TYPE.rowTitle,
          cursor: isIdle ? 'default' : 'pointer',
          overflowWrap: 'anywhere',
        }}
      >
        {nextLabel === null ? 'Готово' : `Далее: ${nextLabel} →`}
      </button>
    </div>
  );
};

// A number field that opens the pad instead of the system keyboard. A
// physical keyboard still types into it.
export const PadField = ({
  target,
  isActive,
  isWrong = false,
  isLarge = true,
  placeholder = '—',
  onActivate,
  onEnter,
}: {
  target: PadTarget;
  isActive: boolean;
  isWrong?: boolean;
  isLarge?: boolean;
  placeholder?: string;
  onActivate: () => void;
  onEnter: () => void;
}) => {
  const colors = usePalette();
  const borderColor = isActive
    ? colors.accent
    : isWrong
      ? colors.danger
      : colors.border;

  return (
    <label
      onClick={onActivate}
      style={{
        display: 'grid',
        alignContent: 'start',
        gap: SPACE.xs,
        minWidth: 0,
        padding: `${SPACE.sm}px ${SPACE.md}px`,
        background: colors.surface,
        border: `2px solid ${borderColor}`,
        borderRadius: RADIUS.card,
        boxShadow: isActive ? `0 0 0 3px ${colors.accentTint}` : 'none',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          ...TYPE.label,
          color: isWrong && !isActive ? colors.danger : colors.muted,
          overflowWrap: 'anywhere',
        }}
      >
        {target.label}
      </span>
      <span
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: SPACE.xs,
          minWidth: 0,
        }}
      >
        <input
          aria-label={
            target.unit === ''
              ? target.label
              : `${target.label}, ${target.unit}`
          }
          inputMode="none"
          autoComplete="off"
          value={target.value}
          placeholder={placeholder}
          onFocus={onActivate}
          onChange={(event) =>
            target.onChange(sanitizePadInput(event.target.value, target.kind))
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter') onEnter();
          }}
          style={{
            flex: 1,
            width: '100%',
            minWidth: 0,
            padding: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: colors.text,
            font: 'inherit',
            ...(isLarge ? TYPE.keyNumber : TYPE.rowTitle),
            ...TABULAR_NUMBERS,
            cursor: 'pointer',
          }}
        />
        {target.unit === '' ? null : (
          <span style={{ flex: 'none', ...TYPE.label, color: colors.muted }}>
            {target.unit}
          </span>
        )}
      </span>
    </label>
  );
};
