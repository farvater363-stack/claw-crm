import { IsString } from 'class-validator';

import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';

class NamedInput {
  @IsString()
  name: string;
}

// The numeric param types @nestjs/graphql hands to pipes
const GQL_PARENT_PARAM_TYPE = 0;
const GQL_ARGS_PARAM_TYPE = 3;

const invalidValue = { name: 42 };

describe('ResolverValidationPipe', () => {
  const pipe = new ResolverValidationPipe();

  it('rejects invalid resolver args', async () => {
    await expect(
      pipe.transform(invalidValue, {
        type: GQL_ARGS_PARAM_TYPE as never,
        metatype: NamedInput,
      }),
    ).rejects.toThrow(UserInputError);
  });

  it('passes a parent through without validating it', async () => {
    await expect(
      pipe.transform(invalidValue, {
        type: GQL_PARENT_PARAM_TYPE as never,
        metatype: NamedInput,
      }),
    ).resolves.toBe(invalidValue);
  });

  it('passes custom decorator values through without validating them', async () => {
    await expect(
      pipe.transform(invalidValue, { type: 'custom', metatype: NamedInput }),
    ).resolves.toBe(invalidValue);
  });
});
