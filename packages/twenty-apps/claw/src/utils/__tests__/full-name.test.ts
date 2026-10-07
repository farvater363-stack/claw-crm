import { describe, expect, it } from 'vitest';

import {
  joinFullName,
  splitFullName,
  trimFullName,
} from 'src/utils/full-name';

describe('joinFullName', () => {
  it('reads first name then last name', () => {
    expect(joinFullName({ firstName: 'Бахтиёр', lastName: 'Каримов' })).toBe(
      'Бахтиёр Каримов',
    );
  });

  it('leaves out an empty part', () => {
    expect(joinFullName({ firstName: ' Бахтиёр ', lastName: '' })).toBe(
      'Бахтиёр',
    );
    expect(joinFullName({ firstName: null, lastName: 'Каримов' })).toBe(
      'Каримов',
    );
  });

  it('is null without a name', () => {
    expect(joinFullName(null)).toBeNull();
    expect(joinFullName({ firstName: ' ', lastName: '' })).toBeNull();
  });
});

describe('trimFullName', () => {
  it('trims both parts and fills a missing one with empty text', () => {
    expect(trimFullName({ firstName: ' Али ', lastName: null })).toEqual({
      firstName: 'Али',
      lastName: '',
    });
  });
});

describe('splitFullName', () => {
  it('takes the first word as the first name and the rest as the last name', () => {
    expect(splitFullName('Бахтиёр Каримов')).toEqual({
      firstName: 'Бахтиёр',
      lastName: 'Каримов',
    });
    expect(splitFullName('  Анна   Мария  Петрова ')).toEqual({
      firstName: 'Анна',
      lastName: 'Мария Петрова',
    });
  });

  it('keeps a single word as the first name', () => {
    expect(splitFullName('Бахтиёр')).toEqual({
      firstName: 'Бахтиёр',
      lastName: '',
    });
  });

  it('gives an empty name for empty text', () => {
    expect(splitFullName(null)).toEqual({ firstName: '', lastName: '' });
    expect(splitFullName('  ')).toEqual({ firstName: '', lastName: '' });
  });
});
