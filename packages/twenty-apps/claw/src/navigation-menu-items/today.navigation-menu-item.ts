import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.today,
  name: 'Сегодня',
  icon: 'IconLayoutDashboard',
  position: -2,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: IDS.ownerDashboard.pageLayout,
  // Money and profit for the owner only; no other role reads worker payments.
  targetObjectUniversalIdentifier: IDS.masterPayment.object,
});
