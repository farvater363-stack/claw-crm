import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.marketing,
  name: 'Маркетинг',
  icon: 'IconSpeakerphone',
  position: 9,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: IDS.marketing.pageLayout,
  // Built from orders and clients; only roles that work with clients see it.
  targetObjectUniversalIdentifier: IDS.clientCall.object,
});
