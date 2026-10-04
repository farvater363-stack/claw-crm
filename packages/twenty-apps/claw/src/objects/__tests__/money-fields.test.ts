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

const moneyFieldsWithoutUzsDefault = async (): Promise<string[]> => {
  const names: string[] = [];
  const files = readdirSync(OBJECTS_DIRECTORY)
    .filter((file) => file.endsWith('.object.ts'))
    .sort();

  for (const file of files) {
    const definition: ObjectDefinition = await import(
      join(OBJECTS_DIRECTORY, file)
    );
    const { nameSingular, fields } = definition.default.config;

    for (const field of fields) {
      const defaultValue = field.defaultValue as
        | { currencyCode?: unknown }
        | null
        | undefined;

      if (field.type === 'CURRENCY' && defaultValue?.currencyCode !== "'UZS'") {
        names.push(`${nameSingular}.${field.name}`);
      }
    }
  }

  return names;
};

// Twenty's money input opens on the field's default currency and, with core
// change C7, offers nothing else. A money field without the default would
// open on USD.
describe('every money field of the app is in сум', () => {
  it('has the UZS default on every CURRENCY field of every object', async () => {
    expect(await moneyFieldsWithoutUzsDefault()).toEqual([]);
  });
});
