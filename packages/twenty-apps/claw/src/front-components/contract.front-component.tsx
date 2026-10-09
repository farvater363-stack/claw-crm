import { defineFrontComponent } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { ContractTemplateScreen } from 'src/contract/contract-template-screen';

export default defineFrontComponent({
  universalIdentifier: IDS.contract.frontComponent,
  name: 'contract',
  description: 'Договор: текст, реквизиты исполнителя и версии',
  component: ContractTemplateScreen,
});
