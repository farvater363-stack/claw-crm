export type FullName = { firstName: string; lastName: string };

export type StoredFullName =
  | { firstName?: string | null; lastName?: string | null }
  | null
  | undefined;

export const EMPTY_FULL_NAME: FullName = { firstName: '', lastName: '' };

export const joinFullName = (name: StoredFullName): string | null => {
  const joined = [name?.firstName, name?.lastName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' ');

  return joined === '' ? null : joined;
};

export const trimFullName = (name: StoredFullName): FullName => ({
  firstName: name?.firstName?.trim() ?? '',
  lastName: name?.lastName?.trim() ?? '',
});

// Names written as one line before the split: the first word is the first
// name, everything after it the last name.
export const splitFullName = (text: string | null | undefined): FullName => {
  const words = (text ?? '').trim().split(/\s+/).filter((word) => word !== '');

  return { firstName: words[0] ?? '', lastName: words.slice(1).join(' ') };
};
