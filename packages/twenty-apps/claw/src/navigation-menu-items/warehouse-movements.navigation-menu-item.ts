import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.warehouseMovements,
  position: 2,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: IDS.view.warehouseMovements,
  folderUniversalIdentifier: IDS.navigation.warehouse,
});
