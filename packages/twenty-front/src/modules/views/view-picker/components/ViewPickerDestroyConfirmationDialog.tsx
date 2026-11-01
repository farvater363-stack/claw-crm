import { useContextStoreObjectMetadataItemOrThrow } from '@/context-store/hooks/useContextStoreObjectMetadataItemOrThrow';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { ConfirmationDialog } from '@/ui/layout/dialog/components/ConfirmationDialog';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { viewsFromObjectMetadataItemFamilySelector } from '@/views/states/selectors/viewsFromObjectMetadataItemFamilySelector';
import { useDestroyViewFromCurrentState } from '@/views/view-picker/hooks/useDestroyViewFromCurrentState';
import { viewPickerReferenceViewIdComponentState } from '@/views/view-picker/states/viewPickerReferenceViewIdComponentState';
import { getViewPickerDestroyConfirmationDialogId } from '@/views/view-picker/utils/getViewPickerDestroyConfirmationDialogId';
import { useLingui } from '@lingui/react/macro';

export const ViewPickerDestroyConfirmationDialog = () => {
  const { t } = useLingui();
  const { recordIndexId } = useRecordIndexContextOrThrow();
  const { objectMetadataItem } = useContextStoreObjectMetadataItemOrThrow();
  const { destroyViewFromCurrentState } = useDestroyViewFromCurrentState();

  const viewPickerReferenceViewId = useAtomComponentStateValue(
    viewPickerReferenceViewIdComponentState,
  );
  const viewsOnCurrentObject = useAtomFamilySelectorValue(
    viewsFromObjectMetadataItemFamilySelector,
    { objectMetadataItemId: objectMetadataItem.id },
  );
  const viewName =
    viewsOnCurrentObject.find((view) => view.id === viewPickerReferenceViewId)
      ?.name ?? '';

  return (
    <ConfirmationDialog
      dialogId={getViewPickerDestroyConfirmationDialogId(recordIndexId)}
      title={t`Delete view "${viewName}"?`}
      subtitle={t`It will disappear for everyone in the workspace, along with its menu item.`}
      onConfirmClick={destroyViewFromCurrentState}
      confirmButtonText={t`Delete`}
      confirmButtonColor="danger"
    />
  );
};
