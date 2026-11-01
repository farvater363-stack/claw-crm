import { useCallback } from 'react';

import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useDialog } from '@/ui/layout/dialog/hooks/useDialog';
import { getViewPickerDestroyConfirmationDialogId } from '@/views/view-picker/utils/getViewPickerDestroyConfirmationDialogId';

export const useOpenViewPickerDestroyConfirmation = () => {
  const { openDialog } = useDialog();
  const { recordIndexId } = useRecordIndexContextOrThrow();

  const openViewPickerDestroyConfirmation = useCallback(
    () => openDialog(getViewPickerDestroyConfirmationDialogId(recordIndexId)),
    [openDialog, recordIndexId],
  );

  return { openViewPickerDestroyConfirmation };
};
