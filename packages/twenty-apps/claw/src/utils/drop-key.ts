export const dropKey = <TValue>(
  current: Record<string, TValue>,
  key: string,
): Record<string, TValue> => {
  const { [key]: _dropped, ...rest } = current;

  return rest;
};
