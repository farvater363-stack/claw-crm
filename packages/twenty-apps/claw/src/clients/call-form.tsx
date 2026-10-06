import { useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';

import {
  buildCallInput,
  callBackAfterDraft,
  type CallDraft,
  checkCallDraft,
  EMPTY_CALL_DRAFT,
  NEXT_CALL_CHOICES,
  nextCallDay,
} from 'src/clients/call-draft';
import { type CallBack } from 'src/clients/client-summary';
import { recordCall } from 'src/clients/load-clients';
import {
  CALL_RESULT_OPTIONS,
  type CallResult,
} from 'src/constants/select-options';
import { todayInTashkent } from 'src/pricing/dates';
import {
  Button,
  ErrorNote,
  Field,
  Hint,
  Tabs,
  TextInput,
  Wrap,
} from 'src/ui/kit';
import { SPACE } from 'src/ui/tokens';
import { isAccessError } from 'src/utils/is-access-error';
import { randomUuid } from 'src/utils/random-uuid';

const SAVE_FAILED =
  'Не удалось сохранить звонок. Проверьте интернет и нажмите "Повторить"';
const NO_ACCESS = 'Нет прав записывать звонки';

type CallFormProps = {
  personId: string;
  orderId: string | null;
  onSaved: (callBack: CallBack) => void;
  onCancel: () => void;
};

export const CallForm = ({
  personId,
  orderId,
  onSaved,
  onCancel,
}: CallFormProps) => {
  const [draft, setDraft] = useState<CallDraft>(EMPTY_CALL_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // State read in a handler is the one of the render that made it; a second
  // tap in the same render would pass a check on it.
  const inFlight = useRef(false);
  const today = todayInTashkent();

  const save = async () => {
    if (inFlight.current) return;

    const problem = checkCallDraft(draft, today);

    setError(problem);

    if (problem !== null || draft.result === null) return;

    inFlight.current = true;
    setIsBusy(true);
    setFailure(null);

    try {
      await recordCall(
        new CoreApiClient(),
        buildCallInput({
          id: randomUuid(),
          personId,
          orderId,
          draft: { ...draft, result: draft.result },
          today,
        }),
      );
      setDraft(EMPTY_CALL_DRAFT);
      onSaved(callBackAfterDraft(draft));
    } catch (caught) {
      setFailure(isAccessError(caught) ? NO_ACCESS : SAVE_FAILED);
    } finally {
      inFlight.current = false;
      setIsBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: SPACE.md }}>
      <Field label="Чем закончился звонок" error={error}>
        <Tabs<CallResult | 'none'>
          value={draft.result ?? 'none'}
          options={CALL_RESULT_OPTIONS.map(({ value, label }) => ({
            value,
            label,
          }))}
          onChange={(result) =>
            setDraft((current) => ({
              ...current,
              result: result === 'none' ? null : result,
            }))
          }
        />
      </Field>
      <Field label="Заметка">
        <TextInput
          label="Заметка"
          value={draft.note}
          placeholder="Что сказал клиент"
          onChange={(note) => setDraft((current) => ({ ...current, note }))}
        />
      </Field>
      <Field label="Перезвонить">
        <Wrap>
          {NEXT_CALL_CHOICES.map((choice) => (
            <Button
              key={choice.days}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  nextCallAt: nextCallDay(today, choice.days),
                }))
              }
            >
              {choice.label}
            </Button>
          ))}
          <TextInput
            type="date"
            label="Дата следующего звонка"
            value={draft.nextCallAt}
            onChange={(nextCallAt) =>
              setDraft((current) => ({ ...current, nextCallAt }))
            }
          />
          {draft.nextCallAt !== '' ? (
            <Button
              variant="link"
              onClick={() =>
                setDraft((current) => ({ ...current, nextCallAt: '' }))
              }
            >
              Не перезванивать
            </Button>
          ) : null}
        </Wrap>
      </Field>
      {draft.nextCallAt === '' ? (
        <Hint text="Без даты клиент уйдёт из списка «Перезвонить»." />
      ) : null}
      {failure !== null ? (
        <ErrorNote text={failure} onRetry={() => void save()} />
      ) : null}
      <Wrap>
        <Button
          variant="primary"
          isWideOnPhone
          isBusy={isBusy}
          onClick={() => void save()}
        >
          Сохранить звонок
        </Button>
        <Button variant="link" onClick={onCancel}>
          Отмена
        </Button>
      </Wrap>
    </div>
  );
};
