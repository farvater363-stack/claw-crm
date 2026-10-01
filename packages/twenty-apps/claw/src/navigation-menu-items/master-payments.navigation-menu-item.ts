import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

// An OBJECT item: Twenty hides it from roles that cannot read payments.
export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.masterPayments,
  position: 9,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: IDS.masterPayment.object,
});
