import { describe, expect, it } from 'vitest';

import { applyPadKey, sanitizePadInput } from 'src/measurer-form/pad-input';

describe('applyPadKey', () => {
  it('types a size with one decimal comma', () => {
    const typed = ['1', '2', '3', ',', '5', ','].reduce(
      (value, key) => applyPadKey(value, key as never, 'decimal'),
      '',
    );

    expect(typed).toBe('123,5');
  });

  it('starts a fraction from 0 and drops a leading zero before a digit', () => {
    expect(applyPadKey('', ',', 'decimal')).toBe('0,');
    expect(applyPadKey('0', '5', 'decimal')).toBe('5');
  });

  it('erases the last digit', () => {
    expect(applyPadKey('123,5', 'BACKSPACE', 'decimal')).toBe('123,');
    expect(applyPadKey('', 'BACKSPACE', 'decimal')).toBe('');
  });

  it('groups a sum and adds three zeros at once', () => {
    expect(applyPadKey('3,772', '000', 'money')).toBe('3,772,000');
    expect(applyPadKey('99,999', '9', 'money')).toBe('999,999');
    expect(applyPadKey('1,000', 'BACKSPACE', 'money')).toBe('100');
  });

  it('refuses a comma and leading zeros in a sum', () => {
    expect(applyPadKey('500', ',', 'money')).toBe('500');
    expect(applyPadKey('', '000', 'money')).toBe('');
  });

  it('stops at twelve digits', () => {
    expect(applyPadKey('123456789012', '3', 'decimal')).toBe('123456789012');
  });
});

describe('sanitizePadInput', () => {
  it('keeps digits and the first comma of a size, reading a dot as a comma', () => {
    expect(sanitizePadInput('12.5см', 'decimal')).toBe('12,5');
    expect(sanitizePadInput('1,2,3', 'decimal')).toBe('1,23');
  });

  it('keeps the grouping of a sum', () => {
    expect(sanitizePadInput('1,250,000 сум', 'money')).toBe('1,250,000 ');
  });
});
