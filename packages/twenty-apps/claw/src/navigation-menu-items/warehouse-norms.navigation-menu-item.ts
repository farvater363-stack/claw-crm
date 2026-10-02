import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.warehouseNorms,
  position: 3,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: IDS.view.warehouseNorms,
  folderUniversalIdentifier: IDS.navigation.warehouse,
});
