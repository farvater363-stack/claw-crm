import { defineFrontComponent } from 'twenty-sdk/define';

import { MarketingScreen } from 'src/clients/marketing-screen';
import { IDS } from 'src/constants/universal-identifiers';

// The screen lives in its own module: the manifest reads this entry as plain
// TypeScript, and a large JSX body can hide the export from it.
export default defineFrontComponent({
  universalIdentifier: IDS.marketing.frontComponent,
  name: 'marketing',
  description: 'Маркетинг: источники клиентов, продажи и списки для рассылки',
  component: MarketingScreen,
});
