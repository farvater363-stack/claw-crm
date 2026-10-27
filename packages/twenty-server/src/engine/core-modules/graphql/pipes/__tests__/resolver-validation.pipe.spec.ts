import { IsString } from 'class-validator';

import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';

class NamedInput {
  @IsString()
  name: string;
}

const invalidValue = { name: 42 };

describe('ResolverValidationPipe', () => {
  const pipe = new ResolverValidationPipe();

  it('rejects invalid resolver args', async () => {
    await expect(
      pipe.transform(invalidValue, {
        type: 'body',
        metatype: NamedInput,
      }),
    ).rejects.toThrow(UserInputError);
  });

  it('passes parents and decorator values through without validating them', async () => {
    await expect(
      pipe.transform(invalidValue, { type: 'custom', metatype: NamedInput }),
    ).resolves.toBe(invalidValue);
  });
});
