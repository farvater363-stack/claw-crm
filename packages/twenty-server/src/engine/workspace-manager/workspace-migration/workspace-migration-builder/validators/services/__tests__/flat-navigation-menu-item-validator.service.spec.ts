import { NavigationMenuItemType } from 'twenty-shared/types';

import { FlatNavigationMenuItemValidatorService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/services/flat-navigation-menu-item-validator.service';

type UpdateArgs = Parameters<
  FlatNavigationMenuItemValidatorService['validateFlatNavigationMenuItemUpdate']
>[0];

const NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER =
  '11111111-1111-4111-8111-111111111111';
const OBJECT_UNIVERSAL_IDENTIFIER = '22222222-2222-4222-8222-222222222222';

const NAVIGATION_MENU_ITEM = {
  universalIdentifier: NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  name: 'App page',
  position: 0,
  pageLayoutUniversalIdentifier: '33333333-3333-4333-8333-333333333333',
  targetObjectMetadataUniversalIdentifier: null,
  viewUniversalIdentifier: null,
  folderUniversalIdentifier: null,
};

const buildTargetObjectUpdateArgs = (
  flatObjectMetadataByUniversalIdentifier: Record<string, unknown>,
) =>
  ({
    universalIdentifier: NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
    flatEntityUpdate: {
      targetObjectMetadataUniversalIdentifier: OBJECT_UNIVERSAL_IDENTIFIER,
    },
    optimisticFlatEntityMapsAndRelatedFlatEntityMaps: {
      flatNavigationMenuItemMaps: {
        byUniversalIdentifier: {
          [NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER]: NAVIGATION_MENU_ITEM,
        },
      },
      flatObjectMetadataMaps: {
        byUniversalIdentifier: flatObjectMetadataByUniversalIdentifier,
      },
      flatViewMaps: { byUniversalIdentifier: {} },
    },
  }) as unknown as UpdateArgs;

describe('navigation menu item target object update validation', () => {
  const service = new FlatNavigationMenuItemValidatorService();

  it('accepts a target object that exists', () => {
    expect(
      service.validateFlatNavigationMenuItemUpdate(
        buildTargetObjectUpdateArgs({
          [OBJECT_UNIVERSAL_IDENTIFIER]: {
            universalIdentifier: OBJECT_UNIVERSAL_IDENTIFIER,
          },
        }),
      ).errors,
    ).toEqual([]);
  });

  it('rejects a target object that does not exist', () => {
    expect(
      service.validateFlatNavigationMenuItemUpdate(
        buildTargetObjectUpdateArgs({}),
      ).errors,
    ).toEqual([
      expect.objectContaining({ message: 'Target object metadata not found' }),
    ]);
  });
});
