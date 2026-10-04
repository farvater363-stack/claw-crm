import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.workshop,
  name: 'В работе',
  icon: 'IconHammer',
  position: 1,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: IDS.workshop.pageLayout,
  // The screen groups orders by master; the measurer, who cannot read workers, has no use for it.
  targetObjectUniversalIdentifier: IDS.master.object,
});
