import { describe, expect, it } from 'vitest';

import {
  countUses,
  matchesSearch,
  pickQuickOptions,
  rankByUse,
} from 'src/measurer-form/option-search';

const options = [
  { id: 'wave', name: 'Волна' },
  { id: 'rhomb', name: 'Ромб' },
  { id: 'rod', name: 'Прут' },
  { id: 'tree', name: 'Ёлочка' },
];

describe('matchesSearch', () => {
  it('finds every typed word in any field, in any order', () => {
    expect(matchesSearch('проф ромб', ['Ромб', 'Профиль'])).toBe(true);
    expect(matchesSearch('ромб прут', ['Ромб', 'Профиль'])).toBe(false);
  });

  it('ignores case and treats ё as е', () => {
    expect(matchesSearch('ЕЛОЧ', ['Ёлочка', null])).toBe(true);
  });

  it('matches everything while nothing is typed', () => {
    expect(matchesSearch('  ', ['Волна'])).toBe(true);
  });
});

describe('rankByUse', () => {
  it('puts the most used first and leaves out the never used', () => {
    const uses = countUses([
      'wave',
      'rhomb',
      'rod',
      null,
      'rhomb',
      'rod',
      'rod',
    ]);

    expect(rankByUse(options, uses).map((option) => option.id)).toEqual([
      'rod',
      'rhomb',
      'wave',
    ]);
  });
});

describe('pickQuickOptions', () => {
  it('starts with what this замер already uses, skips the chosen one and repeats nothing', () => {
    const quick = pickQuickOptions({
      options,
      uses: countUses(['rod', 'rod', 'wave', 'tree']),
      usedHereIds: ['tree', 'rhomb'],
      chosenId: 'rhomb',
      limit: 3,
    });

    expect(quick.map((option) => option.id)).toEqual(['tree', 'rod', 'wave']);
  });
});
