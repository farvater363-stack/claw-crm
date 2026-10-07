import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.callBacks,
  name: 'Перезвоны',
  icon: 'IconPhoneCall',
  position: 8,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: IDS.callBacks.pageLayout,
  targetObjectUniversalIdentifier: IDS.clientCall.object,
});
