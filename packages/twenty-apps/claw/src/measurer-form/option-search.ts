type Option = { id: string; name: string };

const normalize = (text: string) =>
  text.toLowerCase().replace(/ё/g, 'е').trim();

// Every typed word must appear somewhere, in any order: «ромб проф» finds
// «Ромб» of the kind «Профиль».
export const matchesSearch = (
  query: string,
  fields: (string | null)[],
): boolean => {
  const words = normalize(query)
    .split(/\s+/)
    .filter((word) => word !== '');
  const text = normalize(fields.filter((field) => field !== null).join(' '));

  return words.every((word) => text.includes(word));
};

export const countUses = (ids: (string | null)[]): Map<string, number> => {
  const uses = new Map<string, number>();

  for (const id of ids) {
    if (id !== null) uses.set(id, (uses.get(id) ?? 0) + 1);
  }

  return uses;
};

export const sortByName = <TOption extends Option>(
  options: TOption[],
): TOption[] =>
  [...options].sort((left, right) =>
    left.name.localeCompare(right.name, 'ru', { numeric: true }),
  );

// The most ordered first; options never ordered are left out.
export const rankByUse = <TOption extends Option>(
  options: TOption[],
  uses: Map<string, number>,
): TOption[] =>
  sortByName(options.filter((option) => (uses.get(option.id) ?? 0) > 0)).sort(
    (left, right) => (uses.get(right.id) ?? 0) - (uses.get(left.id) ?? 0),
  );
