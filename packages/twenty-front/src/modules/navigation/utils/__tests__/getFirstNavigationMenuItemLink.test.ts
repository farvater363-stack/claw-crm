import { NavigationMenuItemType } from 'twenty-shared/types';

import { getFirstNavigationMenuItemLink } from '@/navigation/utils/getFirstNavigationMenuItemLink';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { type NavigationMenuItem } from '~/generated-metadata/graphql';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const hiddenObjectMetadataItem = getMockObjectMetadataItemOrThrow('company');

const HIDDEN_OBJECT_ID = hiddenObjectMetadataItem.id;

const buildPageLayoutNavigationMenuItem = (
  pageLayoutId: string,
  position: number,
  targetObjectMetadataId?: string,
): NavigationMenuItem => ({
  id: `navigation-menu-item-page-layout-${pageLayoutId}`,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutId,
  targetObjectMetadataId,
  position,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('getFirstNavigationMenuItemLink', () => {
  it('skips a page item whose target object the role cannot read and links to the next readable item', () => {
    expect(
      getFirstNavigationMenuItemLink({
        navigationMenuItemsInDisplayOrder: [
          buildPageLayoutNavigationMenuItem(
            'hidden-page',
            -1,
            HIDDEN_OBJECT_ID,
          ),
          buildPageLayoutNavigationMenuItem('readable-page', 0),
        ],
        objectMetadataItems: [hiddenObjectMetadataItem],
        views: [],
        objectPermissionsByObjectMetadataId: {
          [HIDDEN_OBJECT_ID]: {
            ...getObjectPermissionsForObject({}, HIDDEN_OBJECT_ID),
            canReadObjectRecords: false,
          },
        },
      }),
    ).toBe('/page/readable-page');
  });
});
