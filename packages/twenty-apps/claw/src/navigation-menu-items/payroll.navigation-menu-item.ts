import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

// Page items show for every role; the page itself refuses non-admins.
export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.payroll,
  name: 'ЗП за месяц',
  icon: 'IconCash',
  position: 4,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: IDS.payroll.pageLayout,
});
