import { defineFrontComponent } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { Screen, SkeletonRows } from 'src/ui/kit';

// Holds the definition while the screen is rebuilt on accrual lines.
const Payroll = () => (
  <Screen title="ЗП">
    <SkeletonRows count={5} />
  </Screen>
);

export default defineFrontComponent({
  universalIdentifier: IDS.payroll.frontComponent,
  name: 'payroll',
  description: 'ЗП работников за месяц: начисления, выплаты, остаток',
  component: Payroll,
});
