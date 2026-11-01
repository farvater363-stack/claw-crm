import { getViewPickerDropdownId } from '@/views/view-picker/utils/getViewPickerDropdownId';

export const getViewPickerDestroyConfirmationDialogId = (viewBarId: string) =>
  `${getViewPickerDropdownId(viewBarId)}-destroy-confirmation`;
