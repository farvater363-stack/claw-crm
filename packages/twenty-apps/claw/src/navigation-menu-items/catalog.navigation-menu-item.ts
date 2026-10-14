import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.catalog,
  name: 'Каталог',
  icon: 'IconPhoto',
  position: 2.5,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: IDS.catalog.pageLayout,
  // Whoever can read the designs can show them to a client.
  targetObjectUniversalIdentifier: IDS.design.object,
});
