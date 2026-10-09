import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.contract,
  name: 'Договор',
  icon: 'IconFileText',
  // Under «Цены», above «ЗП»
  position: 5.5,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: IDS.contract.pageLayout,
  // No role but the owner reads money entries, so only the owner gets the item.
  targetObjectUniversalIdentifier: IDS.moneyEntry.object,
});
