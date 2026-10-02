import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.warehousePurchasePlan,
  position: 1,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: IDS.view.warehousePurchasePlan,
  folderUniversalIdentifier: IDS.navigation.warehouse,
});
