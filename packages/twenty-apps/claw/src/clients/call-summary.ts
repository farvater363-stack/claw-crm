import { CALL_RESULT_OPTIONS } from 'src/constants/select-options';

// One line the client list can show: what came of the last call.
export const callSummary = ({
  result,
  note,
}: {
  result: string | null;
  note: string | null;
}): string | null => {
  const label =
    CALL_RESULT_OPTIONS.find((option) => option.value === result)?.label ??
    null;
  const text = note?.trim() ? note.trim() : null;

  if (label !== null && text !== null) return `${label}: ${text}`;

  return label ?? text;
};
