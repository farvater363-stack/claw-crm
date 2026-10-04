import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.payroll,
  name: 'ЗП',
  icon: 'IconCash',
  position: 6,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: IDS.payroll.pageLayout,
  // Payroll is built from payments, so only roles that read them get the item.
  targetObjectUniversalIdentifier: IDS.masterPayment.object,
});
