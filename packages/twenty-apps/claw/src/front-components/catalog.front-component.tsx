import { defineFrontComponent } from 'twenty-sdk/define';

import { Catalog } from 'src/catalog/catalog-screen';
import { IDS } from 'src/constants/universal-identifiers';

// The screen lives in its own module: the manifest reads this entry as plain
// TypeScript, and a large JSX body can hide the export from it.
export default defineFrontComponent({
  universalIdentifier: IDS.catalog.frontComponent,
  name: 'catalog',
  description: 'Каталог решёток и перилл с фото, чтобы показать клиенту',
  component: Catalog,
});
