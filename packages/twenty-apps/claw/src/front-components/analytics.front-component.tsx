import { defineFrontComponent } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { AnalyticsScreen } from 'src/dashboard/analytics-screen';

// The screen lives in its own module: the manifest reads this entry as plain
// TypeScript, and a large JSX body can hide the export from it.
export default defineFrontComponent({
  universalIdentifier: IDS.ownerDashboard.analyticsFrontComponent,
  name: 'analytics',
  description:
    'Аналитика: продажи, деньги, воронка, источники и сроки за период',
  component: AnalyticsScreen,
});
