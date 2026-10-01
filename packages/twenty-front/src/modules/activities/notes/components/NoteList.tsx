import { styled } from '@linaria/react';

import { type Note } from '@/activities/types/Note';
import { FieldDescriptionTooltipProvider } from '@/object-record/record-field/ui/components/FieldDescriptionTooltipProvider';
import { themeCssVariables } from 'twenty-ui/theme';

import { NoteTile } from './NoteTile';

type NoteListProps = {
  notes: Note[];
};

const StyledNoteContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  // An open side panel can squeeze this column to a few pixels; scroll
  // instead of wrapping the note text one letter per line.
  min-width: 240px;
  width: 100%;
`;

export const NoteList = ({ notes }: NoteListProps) => {
  return (
    <>
      {notes.length > 0 && (
        <FieldDescriptionTooltipProvider>
          <StyledNoteContainer>
            {notes.map((note) => (
              <NoteTile key={note.id} note={note} />
            ))}
          </StyledNoteContainer>
        </FieldDescriptionTooltipProvider>
      )}
    </>
  );
};
