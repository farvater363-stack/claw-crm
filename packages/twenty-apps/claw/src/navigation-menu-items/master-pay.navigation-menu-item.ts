import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.masterPay,
  position: 4,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: IDS.view.masterPay,
});
