import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.stock,
  name: 'Склад',
  icon: 'IconBuildingWarehouse',
  position: 10,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: IDS.stock.pageLayout,
  // The screen records purchases and recounts; roles without stock movements cannot use it.
  targetObjectUniversalIdentifier: IDS.stockMovement.object,
});
