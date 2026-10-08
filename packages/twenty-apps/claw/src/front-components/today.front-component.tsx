import { defineFrontComponent } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { TodayScreen } from 'src/dashboard/today-screen';

// The screen lives in its own module: the manifest reads this entry as plain
// TypeScript, and a large JSX body can hide the export from it.
export default defineFrontComponent({
  universalIdentifier: IDS.ownerDashboard.todayFrontComponent,
  name: 'today',
  description: 'Сегодня: замеры, звонки, долги, просрочки и цех на один взгляд',
  component: TodayScreen,
});
