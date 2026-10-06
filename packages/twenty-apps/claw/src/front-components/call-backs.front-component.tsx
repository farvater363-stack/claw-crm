import { defineFrontComponent } from 'twenty-sdk/define';

import { CallBacksScreen } from 'src/clients/call-backs-screen';
import { IDS } from 'src/constants/universal-identifiers';

// The screen lives in its own module: the manifest reads this entry as plain
// TypeScript, and a large JSX body can hide the export from it.
export default defineFrontComponent({
  universalIdentifier: IDS.callBacks.frontComponent,
  name: 'call-backs',
  description: 'Перезвоны: кому позвонить сегодня, кто думает и кто отказал',
  component: CallBacksScreen,
});
