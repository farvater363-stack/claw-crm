import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.clients,
  position: 7,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: IDS.view.clients,
  // A stand-in for "manager and owner": the measurer reads clients too, to
  // link them to orders, but works with no list of them.
  targetObjectUniversalIdentifier: IDS.clientCall.object,
});
