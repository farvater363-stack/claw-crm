import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isArray, isNonEmptyString } from '@sniptt/guards';

import { useActivityFieldComponentInstanceId } from '@/activities/hooks/useActivityFieldComponentInstanceId';
import { type Note } from '@/activities/types/Note';
import { getActivityPreview } from '@/activities/utils/getActivityPreview';
import { type FieldActorValue } from '@/object-record/record-field/ui/types/FieldMetadata';
import { useObjectMorphJunctionConfigOrThrow } from '@/object-record/record-field/ui/hooks/useObjectMorphJunctionConfigOrThrow';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { RecordFieldsScopeContextProvider } from '@/object-record/record-field-list/contexts/RecordFieldsScopeContext';
import { FieldContextProvider } from '@/object-record/record-field/ui/components/FieldContextProvider';
import { RecordFieldComponentInstanceContext } from '@/object-record/record-field/ui/states/contexts/RecordFieldComponentInstanceContext';
import { RecordInlineCell } from '@/object-record/record-inline-cell/components/RecordInlineCell';
import { getRecordFieldInputInstanceId } from '@/object-record/utils/getRecordFieldInputId';
import { dateLocaleState } from '~/localization/states/dateLocaleState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledCard = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;

  &:hover {
    border-color: ${themeCssVariables.border.color.strong};
  }
`;

const StyledCardDetailsContainer = styled.div`
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledNoteTitle = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow-wrap: anywhere;
`;

const StyledCardContent = styled.div`
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  color: ${themeCssVariables.font.color.secondary};
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  white-space: pre-line;
`;

const StyledMeta = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin-top: ${themeCssVariables.spacing[1]};
`;

const StyledFooter = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

type NoteTileProps = {
  note: Note & { createdBy?: FieldActorValue };
};

export const NoteTile = ({ note }: NoteTileProps) => {
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const { localeCatalog } = useAtomStateValue(dateLocaleState);

  const title = note.title?.trim();
  const body = getActivityPreview(note?.bodyV2?.blocknote ?? null).trim();

  const junctionFieldName = useObjectMorphJunctionConfigOrThrow({
    objectNameSingular: CoreObjectNameSingular.Note,
  }).junctionField.name;

  const instanceIdPrefix =
    useActivityFieldComponentInstanceId('note-card-targets');
  const componentInstanceId = getRecordFieldInputInstanceId({
    recordId: note.id,
    fieldName: junctionFieldName,
    prefix: instanceIdPrefix,
  });

  const noteTargets = (note as Record<string, unknown>)[junctionFieldName];
  // The card already sits on its one target's page; only list relations
  // when the note is also attached elsewhere.
  const isLinkedToOtherRecords = isArray(noteTargets) && noteTargets.length > 1;

  const authorName = note.createdBy?.name;
  const createdAt = beautifyPastDateRelativeToNow(
    note.createdAt,
    localeCatalog,
  );

  return (
    <StyledCard>
      <StyledCardDetailsContainer
        onClick={() =>
          openRecordInSidePanel({
            recordId: note.id,
            objectNameSingular: CoreObjectNameSingular.Note,
          })
        }
      >
        <StyledNoteTitle>
          {isNonEmptyString(title) ? title : t`Untitled`}
        </StyledNoteTitle>
        {isNonEmptyString(body) && body !== title && (
          <StyledCardContent>{body}</StyledCardContent>
        )}
        <StyledMeta>
          {isNonEmptyString(authorName)
            ? `${authorName} · ${createdAt}`
            : createdAt}
        </StyledMeta>
      </StyledCardDetailsContainer>
      {isLinkedToOtherRecords && (
        <StyledFooter>
          <FieldContextProvider
            objectNameSingular={CoreObjectNameSingular.Note}
            objectRecordId={note.id}
            fieldMetadataName={junctionFieldName}
            fieldPosition={0}
            isDisplayModeFixHeight
          >
            <RecordFieldsScopeContextProvider
              value={{
                scopeInstanceId: note.id,
              }}
            >
              <RecordFieldComponentInstanceContext.Provider
                value={{ instanceId: componentInstanceId }}
              >
                <RecordInlineCell instanceIdPrefix={instanceIdPrefix} />
              </RecordFieldComponentInstanceContext.Provider>
            </RecordFieldsScopeContextProvider>
          </FieldContextProvider>
        </StyledFooter>
      )}
    </StyledCard>
  );
};
