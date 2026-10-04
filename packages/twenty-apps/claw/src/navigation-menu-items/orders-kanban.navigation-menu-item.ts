import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.ordersKanban,
  // Below zero, as the dashboard item at -2 is: Twenty's standard items start
  // at 0, and the first readable item is where a role lands.
  position: -1,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: IDS.view.ordersKanban,
  // A stand-in for "manager and owner": the board itself needs only orders,
  // which every role reads.
  targetObjectUniversalIdentifier: IDS.stockMovement.object,
});
