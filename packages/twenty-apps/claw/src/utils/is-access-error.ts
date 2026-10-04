// A role that may not read a field gets a permission error (or an unknown
// field) for the whole query.
export const isAccessError = (error: unknown): boolean =>
  /permission|Cannot query field/i.test(
    error instanceof Error ? error.message : String(error),
  );
