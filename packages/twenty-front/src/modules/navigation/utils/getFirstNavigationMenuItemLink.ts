import { isNavigationMenuItemReadable } from '@/navigation-menu-item/common/utils/isNavigationMenuItemReadable';
import { getObjectMetadataForNavigationMenuItem } from '@/navigation-menu-item/display/object/utils/getObjectMetadataForNavigationMenuItem';
import { getNavigationMenuItemComputedLink } from '@/navigation-menu-item/display/utils/getNavigationMenuItemComputedLink';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { type View } from '@/views/types/View';
import { isNonEmptyString } from '@sniptt/guards';
import { NavigationMenuItemType } from 'twenty-shared/types';
import { type NavigationMenuItem } from '~/generated-metadata/graphql';

type GetFirstNavigationMenuItemLinkArgs = {
  navigationMenuItemsInDisplayOrder: NavigationMenuItem[];
  objectMetadataItems: EnrichedObjectMetadataItem[];
  views: Pick<View, 'id' | 'objectMetadataId' | 'key' | 'type' | 'position'>[];
  objectPermissionsByObjectMetadataId: Parameters<
    typeof getObjectPermissionsForObject
  >[0];
  isInitialObjectViewEnabled?: boolean;
};

export const getFirstNavigationMenuItemLink = ({
  navigationMenuItemsInDisplayOrder,
  objectMetadataItems,
  views,
  objectPermissionsByObjectMetadataId,
  isInitialObjectViewEnabled = false,
}: GetFirstNavigationMenuItemLinkArgs): string | null => {
  for (const item of navigationMenuItemsInDisplayOrder) {
    if (
      item.type === NavigationMenuItemType.FOLDER ||
      item.type === NavigationMenuItemType.LINK ||
      !isNavigationMenuItemReadable({
        item,
        objectMetadataItems,
        views,
        objectPermissionsByObjectMetadataId,
      })
    ) {
      continue;
    }

    if (
      getObjectMetadataForNavigationMenuItem(item, objectMetadataItems, views)
        ?.isSystem === true
    ) {
      continue;
    }

    const link = getNavigationMenuItemComputedLink({
      item,
      objectMetadataItems,
      views,
      isInitialObjectViewEnabled,
    });

    if (isNonEmptyString(link)) {
      return link;
    }
  }

  return null;
};
