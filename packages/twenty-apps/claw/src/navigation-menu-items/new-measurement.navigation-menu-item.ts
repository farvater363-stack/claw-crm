import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDS.navigation.newMeasurement,
  name: 'Новый замер',
  icon: 'IconRulerMeasure',
  position: 2,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: IDS.measurerForm.pageLayout,
  // The form cannot be filled in without reading extra services.
  targetObjectUniversalIdentifier: IDS.extraService.object,
});
