import { NavigationMenuItemType } from 'twenty-shared/types';

import { isNavigationMenuItemReadable } from '@/navigation-menu-item/common/utils/isNavigationMenuItemReadable';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { type ViewWithRelations } from '@/views/types/ViewWithRelations';
import { type NavigationMenuItem } from '~/generated-metadata/graphql';
import { mockedViews } from '~/testing/mock-data/generated/metadata/views/mock-views-data';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const readableObjectMetadataItem = getMockObjectMetadataItemOrThrow('person');
const hiddenObjectMetadataItem = getMockObjectMetadataItemOrThrow('company');

const READABLE_OBJECT_ID = readableObjectMetadataItem.id;
const HIDDEN_OBJECT_ID = hiddenObjectMetadataItem.id;
const VIEW_ID = 'view-of-readable-object';

const viewOfReadableObject: ViewWithRelations = {
  ...mockedViews[0],
  id: VIEW_ID,
  objectMetadataId: READABLE_OBJECT_ID,
};

const objectPermissionsByObjectMetadataId = {
  [READABLE_OBJECT_ID]: {
    ...getObjectPermissionsForObject({}, READABLE_OBJECT_ID),
    canReadObjectRecords: true,
  },
  [HIDDEN_OBJECT_ID]: {
    ...getObjectPermissionsForObject({}, HIDDEN_OBJECT_ID),
    canReadObjectRecords: false,
  },
};

const readable = (
  item: Pick<NavigationMenuItem, 'type'> & Partial<NavigationMenuItem>,
) =>
  isNavigationMenuItemReadable({
    item: {
      id: 'item-id',
      position: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...item,
    },
    objectMetadataItems: [readableObjectMetadataItem, hiddenObjectMetadataItem],
    views: [viewOfReadableObject],
    objectPermissionsByObjectMetadataId,
  });

describe('isNavigationMenuItemReadable', () => {
  it('shows a page item with no target object', () => {
    expect(
      readable({ type: NavigationMenuItemType.PAGE_LAYOUT, pageLayoutId: 'p' }),
    ).toBe(true);
  });

  it('shows a page item whose target object the role can read', () => {
    expect(
      readable({
        type: NavigationMenuItemType.PAGE_LAYOUT,
        pageLayoutId: 'p',
        targetObjectMetadataId: READABLE_OBJECT_ID,
      }),
    ).toBe(true);
  });

  it('hides a page item whose target object the role cannot read', () => {
    expect(
      readable({
        type: NavigationMenuItemType.PAGE_LAYOUT,
        pageLayoutId: 'p',
        targetObjectMetadataId: HIDDEN_OBJECT_ID,
      }),
    ).toBe(false);
  });

  it('fails open: shows a page item whose target object has no entry in the permissions map', () => {
    expect(
      readable({
        type: NavigationMenuItemType.PAGE_LAYOUT,
        pageLayoutId: 'p',
        targetObjectMetadataId: 'object-without-permissions-entry',
      }),
    ).toBe(true);
  });

  it('still shows a folder', () => {
    expect(readable({ type: NavigationMenuItemType.FOLDER })).toBe(true);
  });

  it('shows a view item whose view object and target object the role can read', () => {
    expect(
      readable({
        type: NavigationMenuItemType.VIEW,
        viewId: VIEW_ID,
        targetObjectMetadataId: READABLE_OBJECT_ID,
      }),
    ).toBe(true);
  });

  it('hides a view item whose view object is readable but whose target object is not', () => {
    expect(
      readable({
        type: NavigationMenuItemType.VIEW,
        viewId: VIEW_ID,
        targetObjectMetadataId: HIDDEN_OBJECT_ID,
      }),
    ).toBe(false);
  });

  it('shows an object item whose object the role can read', () => {
    expect(
      readable({
        type: NavigationMenuItemType.OBJECT,
        targetObjectMetadataId: READABLE_OBJECT_ID,
      }),
    ).toBe(true);
  });

  it('hides an object item whose object the role cannot read', () => {
    expect(
      readable({
        type: NavigationMenuItemType.OBJECT,
        targetObjectMetadataId: HIDDEN_OBJECT_ID,
      }),
    ).toBe(false);
  });
});
