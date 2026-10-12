import { type CSSProperties } from 'react';

import { DISTRICT_OPTIONS, SOURCE_OPTIONS } from 'src/constants/select-options';
import {
  type ClientMatch,
  describeClientMatch,
} from 'src/measurer-form/client-match';
import { WRAP } from 'src/measurer-form/measurement-parts';
import {
  formatUzbekNationalPhone,
  type MeasurementDraft,
  UZBEK_PHONE_PREFIX,
} from 'src/measurer-form/measurer-form';
import {
  ChoiceChips,
  FieldLabel,
  TextArea,
} from 'src/measurer-form/measurer-form-ui';
import { Button, Field, Sheet, TextInput, usePalette } from 'src/ui/kit';
import {
  CONTROL_HEIGHT,
  RADIUS,
  SPACE,
  TABULAR_NUMBERS,
  TYPE,
} from 'src/ui/tokens';

export type VisitChoice = {
  id: string;
  when: string;
  title: string;
  address: string;
  phone: string;
};

// «Чей замер?»: the visits the manager booked for today and later, and a new
// client met without a booking.
export const VisitChooser = ({
  visits,
  isLoading,
  onPick,
  onNewClient,
}: {
  visits: VisitChoice[];
  isLoading: boolean;
  onPick: (id: string) => void;
  onNewClient: () => void;
}) => {
  const colors = usePalette();
  const card: CSSProperties = {
    display: 'grid',
    alignContent: 'start',
    gap: SPACE.xs,
    minHeight: 132,
    padding: SPACE.lg,
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: RADIUS.card + SPACE.xs,
    color: colors.text,
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    ...WRAP,
  };

  return (
    <div style={{ display: 'grid', gap: SPACE.lg, minWidth: 0 }}>
      <div style={{ display: 'grid', gap: SPACE.xs }}>
        <h2
          style={{
            margin: 0,
            ...TYPE.title,
            fontSize: '26px',
            lineHeight: '32px',
          }}
        >
          Чей замер?
        </h2>
        <span style={{ color: colors.muted }}>
          Выберите запись менеджера или добавьте нового клиента.
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
          gap: SPACE.md,
        }}
      >
        {visits.map((visit) => (
          <button
            key={visit.id}
            type="button"
            onClick={() => onPick(visit.id)}
            style={card}
          >
            <span
              style={{ ...TYPE.label, fontWeight: 600, color: colors.accent }}
            >
              {visit.when}
            </span>
            <span style={{ ...TYPE.title }}>{visit.title}</span>
            <span style={{ ...TYPE.label, color: colors.muted }}>
              {visit.address}
            </span>
            <span
              style={{ ...TYPE.label, ...TABULAR_NUMBERS, color: colors.muted }}
            >
              {visit.phone}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={onNewClient}
          style={{
            ...card,
            alignContent: 'center',
            justifyItems: 'center',
            textAlign: 'center',
            background: colors.accentTint,
            border: `2px dashed ${colors.accent}`,
            color: colors.accent,
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'grid',
              placeItems: 'center',
              width: CONTROL_HEIGHT,
              height: CONTROL_HEIGHT,
              borderRadius: '50%',
              background: colors.accent,
              color: colors.onAccent,
              fontSize: '28px',
              lineHeight: 1,
            }}
          >
            +
          </span>
          <span style={TYPE.title}>Новый клиент</span>
          <span style={{ ...TYPE.label, color: colors.muted }}>
            Без записи менеджера
          </span>
        </button>
      </div>
      {isLoading ? (
        <span style={{ color: colors.muted }}>Загружаем записи…</span>
      ) : null}
    </div>
  );
};

const FloorStepper = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  const colors = usePalette();
  const floor = Number.parseInt(value, 10);
  const step = (delta: number) => {
    if (Number.isNaN(floor)) {
      onChange(delta > 0 ? '1' : '');

      return;
    }

    const next = floor + delta;

    onChange(next < 1 ? '' : String(next));
  };
  const button: CSSProperties = {
    width: CONTROL_HEIGHT + SPACE.sm,
    minHeight: CONTROL_HEIGHT + SPACE.xs,
    background: colors.panel,
    border: 'none',
    color: colors.accent,
    font: 'inherit',
    fontSize: '24px',
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'grid', gap: SPACE.xs, justifyItems: 'start' }}>
      <FieldLabel>Этаж</FieldLabel>
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
          aria-label="Этаж ниже"
          style={button}
          onClick={() => step(-1)}
        >
          −
        </button>
        <input
          inputMode="numeric"
          aria-label="Этаж"
          value={value}
          placeholder="—"
          onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
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
          aria-label="Этаж выше"
          style={button}
          onClick={() => step(1)}
        >
          +
        </button>
      </div>
    </div>
  );
};

// The client's details, phone first: it is the one thing the order cannot be
// saved without, and it finds a client the CRM already knows.
export const ClientSheet = ({
  draft,
  isNew,
  match,
  phoneError,
  canChooseOther,
  onChange,
  onTakeMatch,
  onClose,
  onDone,
  onOtherClient,
}: {
  draft: MeasurementDraft;
  isNew: boolean;
  match: ClientMatch | null;
  phoneError: string | null;
  // Other visits are booked: «Другой клиент» goes back to them
  canChooseOther: boolean;
  onChange: (changes: Partial<MeasurementDraft>) => void;
  onTakeMatch: () => void;
  onClose: () => void;
  onDone: () => void;
  onOtherClient: () => void;
}) => {
  const colors = usePalette();
  const pair: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
    gap: SPACE.md,
    alignItems: 'end',
  };

  return (
    <Sheet
      title={isNew ? 'Новый клиент' : 'Клиент'}
      onClose={onClose}
      footer={
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: SPACE.sm,
          }}
        >
          {canChooseOther ? (
            <Button variant="link" onClick={onOtherClient}>
              ← Другой клиент
            </Button>
          ) : (
            <span />
          )}
          <Button variant="primary" onClick={onDone}>
            {isNew ? 'Начать замер →' : 'Готово'}
          </Button>
        </div>
      }
    >
      <Field label="Телефон · обязательно" error={phoneError}>
        <TextInput
          label="Телефон"
          inputMode="numeric"
          isLarge
          prefix={UZBEK_PHONE_PREFIX}
          placeholder="90 123 45 67"
          value={draft.clientPhone}
          onChange={(clientPhone) => onChange({ clientPhone })}
          onCommit={() =>
            onChange({
              clientPhone: formatUzbekNationalPhone(draft.clientPhone),
            })
          }
        />
      </Field>
      {match !== null ? (
        <div
          role="status"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: SPACE.md,
            padding: SPACE.md,
            background: colors.warningTint,
            borderRadius: RADIUS.card,
          }}
        >
          <span style={{ flex: '1 1 220px', ...WRAP }}>
            Этот номер уже есть: <strong>{describeClientMatch(match)}</strong>
          </span>
          <Button variant="primary" onClick={onTakeMatch}>
            Взять его данные
          </Button>
        </div>
      ) : null}
      <div style={pair}>
        <Field label="Имя">
          <TextInput
            label="Имя"
            value={draft.clientFirstName}
            onChange={(clientFirstName) => onChange({ clientFirstName })}
          />
        </Field>
        <Field label="Фамилия">
          <TextInput
            label="Фамилия"
            value={draft.clientLastName}
            onChange={(clientLastName) => onChange({ clientLastName })}
          />
        </Field>
      </div>
      <ChoiceChips
        label="Район"
        value={draft.district}
        options={DISTRICT_OPTIONS}
        onChange={(district) =>
          onChange({ district: district as MeasurementDraft['district'] })
        }
      />
      <div style={pair}>
        <Field label="Адрес">
          <TextInput
            label="Адрес"
            placeholder="Улица, дом, квартира"
            value={draft.addressLine}
            onChange={(addressLine) => onChange({ addressLine })}
          />
        </Field>
        <FloorStepper
          value={draft.floor}
          onChange={(floor) => onChange({ floor })}
        />
      </div>
      <ChoiceChips
        label="Откуда узнал"
        value={draft.source}
        options={SOURCE_OPTIONS}
        onChange={(source) =>
          onChange({ source: source as MeasurementDraft['source'] })
        }
      />
      <Field label="Дата замера">
        <TextInput
          label="Дата замера"
          type="datetime-local"
          value={draft.measurementDate}
          onChange={(measurementDate) => onChange({ measurementDate })}
        />
      </Field>
      <TextArea
        label="Комментарий"
        value={draft.comment}
        onChange={(comment) => onChange({ comment })}
      />
    </Sheet>
  );
};
