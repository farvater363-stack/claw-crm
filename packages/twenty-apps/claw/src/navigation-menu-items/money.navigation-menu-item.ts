import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.money,
  name: 'Деньги',
  icon: 'IconWallet',
  position: 10,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: IDS.money.pageLayout,
  // No role but the owner reads money entries, so only the owner gets the item.
  targetObjectUniversalIdentifier: IDS.moneyEntry.object,
});
