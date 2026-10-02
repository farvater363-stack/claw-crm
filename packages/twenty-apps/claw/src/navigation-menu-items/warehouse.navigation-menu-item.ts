import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.warehouse,
  name: 'Склад',
  icon: 'IconBuildingWarehouse',
  position: 10,
  type: NavigationMenuItemType.FOLDER,
});
