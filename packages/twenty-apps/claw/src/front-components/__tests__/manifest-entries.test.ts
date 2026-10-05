import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const FRONT_COMPONENTS_DIRECTORY = join(__dirname, '..');

// The SDK finds a front component by parsing its entry file as plain
// TypeScript, not TSX. JSX it cannot read can swallow the default export, and
// the component is then left out of the manifest with no error, so the next
// apply deletes it from the workspace.
const findsDefaultExport = (source: string) => {
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  let found = false;

  ts.forEachChild(sourceFile, (node) => {
    if (
      ts.isExportAssignment(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'defineFrontComponent'
    ) {
      found = true;
    }
  });

  return found;
};

describe('front component entries', () => {
  const files = readdirSync(FRONT_COMPONENTS_DIRECTORY).filter((file) =>
    file.endsWith('.front-component.tsx'),
  );

  it.each(files)('%s is found by the manifest build', (file) => {
    expect(
      findsDefaultExport(
        readFileSync(join(FRONT_COMPONENTS_DIRECTORY, file), 'utf8'),
      ),
    ).toBe(true);
  });
});
