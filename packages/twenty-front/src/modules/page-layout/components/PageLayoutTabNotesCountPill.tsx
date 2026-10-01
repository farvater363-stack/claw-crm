import { styled } from '@linaria/react';

import { useNotes } from '@/activities/notes/hooks/useNotes';
import { type TargetRecordIdentifier } from '@/ui/layout/contexts/TargetRecordIdentifier';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledCount = styled.span`
  align-items: center;
  background: ${themeCssVariables.color.red};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.font.color.inverted};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.xs};
  font-variant-numeric: tabular-nums;
  font-weight: ${themeCssVariables.font.weight.medium};
  height: ${themeCssVariables.spacing[4]};
  justify-content: center;
  min-width: ${themeCssVariables.spacing[4]};
  padding: 0 ${themeCssVariables.spacing[1]};
`;

type PageLayoutTabNotesCountPillProps = {
  targetRecord: TargetRecordIdentifier;
};

// Same query as the notes widget, so the tab and the widget share one request.
export const PageLayoutTabNotesCountPill = ({
  targetRecord,
}: PageLayoutTabNotesCountPillProps) => {
  const { totalCountNotes } = useNotes(targetRecord);

  if (totalCountNotes === 0) {
    return null;
  }

  return <StyledCount>{totalCountNotes}</StyledCount>;
};
