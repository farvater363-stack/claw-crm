import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.prices,
  name: 'Цены',
  icon: 'IconReceipt2',
  position: 11,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: IDS.prices.pageLayout,
  // The screen edits composition; roles that cannot read it get nothing useful here.
  targetObjectUniversalIdentifier: IDS.materialNorm.object,
});
