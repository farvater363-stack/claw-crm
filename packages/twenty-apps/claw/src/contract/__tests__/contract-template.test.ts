import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONTRACT_TEMPLATE,
  fillPlaceholders,
  findUnknownPlaceholders,
  missingCompanyDetails,
  parseSections,
  serializeSections,
  templateTexts,
} from 'src/contract/contract-template';
import { placeholderValues } from 'src/contract/contract-document';
import { SAMPLE_CONTRACT_DATA } from 'src/contract/__tests__/contract-fixtures';

describe('the built-in contract', () => {
  it('has the fourteen sections of the PROFMET contract', () => {
    expect(
      DEFAULT_CONTRACT_TEMPLATE.sections.map(({ title }) => title),
    ).toEqual([
      '1. ПРЕДМЕТ ДОГОВОРА',
      '2. СТОИМОСТЬ И ПОРЯДОК ОПЛАТЫ',
      '3. СРОКИ ИЗГОТОВЛЕНИЯ И МОНТАЖА',
      '4. ОБЯЗАННОСТИ ЗАКАЗЧИКА',
      '5. ОБЯЗАННОСТИ ИСПОЛНИТЕЛЯ',
      '6. ПОРЯДОК ПРИЁМКИ РАБОТ',
      '7. ИЗМЕНЕНИЯ ЗАКАЗА',
      '8. МАТЕРИАЛЫ И КАЧЕСТВО',
      '9. МОНТАЖ',
      '10. ОТВЕТСТВЕННОСТЬ СТОРОН',
      '11. ФОТОГРАФИИ И ПОДТВЕРЖДЕНИЕ РЕЗУЛЬТАТА РАБОТ',
      '12. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ',
      '13. ПРОЧИЕ УСЛОВИЯ',
      '14. ЭЛЕКТРОННОЕ ПОДПИСАНИЕ И ПОДТВЕРЖДЕНИЕ ЗАКАЗА',
    ]);
  });

  it('leaves no blank of the paper contract and no marker it cannot fill', () => {
    const texts = templateTexts(DEFAULT_CONTRACT_TEMPLATE);

    expect(texts.filter((text) => text.includes('___'))).toEqual([]);
    expect(texts.flatMap(findUnknownPlaceholders)).toEqual([]);
  });

  it('asks the owner for who signs for the company and on what basis', () => {
    expect(missingCompanyDetails(DEFAULT_CONTRACT_TEMPLATE)).toEqual([
      'В лице',
      'На основании',
    ]);
  });
});

describe('sections', () => {
  it('survive being stored and read back', () => {
    const sections = DEFAULT_CONTRACT_TEMPLATE.sections;

    expect(parseSections(serializeSections(sections))).toEqual(sections);
  });

  it('keep text typed before the first title out', () => {
    expect(parseSections('stray\n## 1. ОДИН\nтекст\n\n## 2. ДВА\n')).toEqual([
      { title: '1. ОДИН', body: 'текст' },
      { title: '2. ДВА', body: '' },
    ]);
  });
});

describe('placeholders', () => {
  it('name a misspelled marker once', () => {
    expect(findUnknownPlaceholders('{Итго} и {Итго} и {Итого}')).toEqual([
      'Итго',
    ]);
  });

  it('fill from the order and mark what was filled', () => {
    const values = placeholderValues(
      DEFAULT_CONTRACT_TEMPLATE,
      SAMPLE_CONTRACT_DATA,
    );

    expect(
      fillPlaceholders(
        '• предоплата: {Предоплата} сум / {Предоплата %} %;',
        values,
      ),
    ).toEqual([
      { text: '• предоплата: ', isFilled: false },
      { text: '2,430,000', isFilled: true },
      { text: ' сум / ', isFilled: false },
      { text: '50', isFilled: true },
      { text: ' %;', isFilled: false },
    ]);
  });

  it('leave a line to write on where the owner left a detail empty', () => {
    const values = placeholderValues(
      DEFAULT_CONTRACT_TEMPLATE,
      SAMPLE_CONTRACT_DATA,
    );

    expect(values['В лице']).toBe('____________');
    expect(values.Остаток).toBe('2,430,000');
    expect(values['Остаток %']).toBe('50');
    expect(values.Дата).toBe('9 октября 2026');
  });
});
