import { defineFrontComponent } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { NewMeasurement } from 'src/measurer-form/new-measurement-screen';

// The form lives in its own module: the manifest reads this entry as plain
// TypeScript, and a large JSX body can hide the export from it.
export default defineFrontComponent({
  universalIdentifier: IDS.measurerForm.frontComponent,
  name: 'new-measurement',
  description: 'Форма замерщика: заказ и проёмы с планшета',
  component: NewMeasurement,
});
