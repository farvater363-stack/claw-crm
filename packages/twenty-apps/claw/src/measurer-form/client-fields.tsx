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
import { ChoiceChips, TextArea } from 'src/measurer-form/measurer-form-ui';
import { Button, Field, TextInput, usePalette } from 'src/ui/kit';
import { RADIUS, SPACE } from 'src/ui/tokens';

// The client's details, phone first: it is the one thing the order cannot be
// saved without, and it finds a client the CRM already knows.
export const ClientFields = ({
  draft,
  match,
  phoneError,
  onChange,
  onTakeMatch,
}: {
  draft: MeasurementDraft;
  match: ClientMatch | null;
  phoneError: string | null;
  onChange: (changes: Partial<MeasurementDraft>) => void;
  onTakeMatch: () => void;
}) => {
  const colors = usePalette();
  const pair: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
    gap: SPACE.md,
    alignItems: 'end',
  };

  return (
    <>
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
          <Button onClick={onTakeMatch}>Взять его данные</Button>
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
        <Field label="Этаж">
          <TextInput
            label="Этаж"
            inputMode="numeric"
            value={draft.floor}
            onChange={(floor) => onChange({ floor })}
          />
        </Field>
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
    </>
  );
};
