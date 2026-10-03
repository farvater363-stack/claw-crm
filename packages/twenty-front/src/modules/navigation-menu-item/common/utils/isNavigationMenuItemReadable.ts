import { NavigationMenuItemType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { type NavigationMenuItem } from '~/generated-metadata/graphql';

import { getObjectMetadataForNavigationMenuItem } from '@/navigation-menu-item/display/object/utils/getObjectMetadataForNavigationMenuItem';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { type View } from '@/views/types/View';

type IsNavigationMenuItemReadableArgs = {
  item: NavigationMenuItem;
  objectMetadataItems: EnrichedObjectMetadataItem[];
  views: Pick<View, 'id' | 'objectMetadataId'>[];
  objectPermissionsByObjectMetadataId: Parameters<
    typeof getObjectPermissionsForObject
  >[0];
};

export const isNavigationMenuItemReadable = ({
  item,
  objectMetadataItems,
  views,
  objectPermissionsByObjectMetadataId,
}: IsNavigationMenuItemReadableArgs): boolean => {
  const itemType = item.type;

  // A page (or view) can name an object it cannot work without; roles that
  // cannot read that object would only get an error from it.
  if (
    isDefined(item.targetObjectMetadataId) &&
    !getObjectPermissionsForObject(
      objectPermissionsByObjectMetadataId,
      item.targetObjectMetadataId,
    ).canReadObjectRecords
  ) {
    return false;
  }

  if (
    itemType === NavigationMenuItemType.FOLDER ||
    itemType === NavigationMenuItemType.LINK ||
    itemType === NavigationMenuItemType.PAGE_LAYOUT
  ) {
    return true;
  }

  if (
    itemType === NavigationMenuItemType.OBJECT ||
    itemType === NavigationMenuItemType.VIEW ||
    itemType === NavigationMenuItemType.RECORD
  ) {
    const objectMetadataItem = getObjectMetadataForNavigationMenuItem(
      item,
      objectMetadataItems,
      views,
    );

    return (
      isDefined(objectMetadataItem) &&
      getObjectPermissionsForObject(
        objectPermissionsByObjectMetadataId,
        objectMetadataItem.id,
      ).canReadObjectRecords
    );
  }

  return false;
};
