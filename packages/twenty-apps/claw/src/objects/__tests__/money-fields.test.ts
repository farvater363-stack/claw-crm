import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

type ObjectDefinition = {
  default: {
    config: {
      nameSingular: string;
      fields: ReadonlyArray<{
        type: string;
        name: string;
        defaultValue?: unknown;
      }>;
    };
  };
};

const OBJECTS_DIRECTORY = join(__dirname, '..');

const scanMoneyFields = async () => {
  const withoutUzsDefault: string[] = [];
  let moneyFieldCount = 0;
  const files = readdirSync(OBJECTS_DIRECTORY)
    .filter((file) => file.endsWith('.object.ts'))
    .sort();

  for (const file of files) {
    const definition: ObjectDefinition = await import(
      join(OBJECTS_DIRECTORY, file)
    );
    const { nameSingular, fields } = definition.default.config;

    for (const field of fields) {
      if (field.type !== 'CURRENCY') continue;

      moneyFieldCount += 1;

      const defaultValue = field.defaultValue as
        | { currencyCode?: unknown }
        | null
        | undefined;

      if (defaultValue?.currencyCode !== "'UZS'") {
        withoutUzsDefault.push(`${nameSingular}.${field.name}`);
      }
    }
  }

  return { fileCount: files.length, moneyFieldCount, withoutUzsDefault };
};

// Twenty's money input offers only the field's default currency. A money field
// without the default would open on USD.
describe('every money field of the app is in сум', () => {
  it('has the UZS default on every CURRENCY field of every object', async () => {
    const { fileCount, moneyFieldCount, withoutUzsDefault } =
      await scanMoneyFields();

    // A moved directory or a renamed field type would leave nothing to check.
    expect(fileCount).toBeGreaterThan(0);
    expect(moneyFieldCount).toBeGreaterThan(0);
    expect(withoutUzsDefault).toEqual([]);
  });
});
