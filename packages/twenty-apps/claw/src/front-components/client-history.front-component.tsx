import { defineFrontComponent } from 'twenty-sdk/define';

import { ClientHistory } from 'src/clients/client-history-screen';
import { IDS } from 'src/constants/universal-identifiers';

// The screen lives in its own module: the manifest reads this entry as plain
// TypeScript, and a large JSX body can hide the export from it.
export default defineFrontComponent({
  universalIdentifier: IDS.clientPage.frontComponent,
  name: 'client-history',
  description: 'Карточка клиента: заказы, суммы, долг и запись звонка',
  component: ClientHistory,
});
