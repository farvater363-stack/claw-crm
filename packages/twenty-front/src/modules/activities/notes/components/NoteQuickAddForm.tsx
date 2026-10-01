import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { type FormEvent, useState } from 'react';

import { TextInput } from '@/ui/input/components/TextInput';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledForm = styled.form`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  margin-bottom: ${themeCssVariables.spacing[3]};
  width: 100%;
`;

type NoteQuickAddFormProps = {
  onAddNote: (title: string) => Promise<void>;
};

export const NoteQuickAddForm = ({ onAddNote }: NoteQuickAddFormProps) => {
  const { t } = useLingui();
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedTitle = title.trim();

    if (!isNonEmptyString(trimmedTitle) || isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      await onAddNote(trimmedTitle);
      setTitle('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <StyledForm onSubmit={handleSubmit}>
      <TextInput
        value={title}
        onChange={setTitle}
        fullWidth
        placeholder={t`Write a note…`}
        aria-label={t`Write a note`}
      />
      <Button type="submit" variant="outline" disabled={isSaving}>
        {t`Add`}
      </Button>
    </StyledForm>
  );
};
