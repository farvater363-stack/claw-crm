import { defineObject, FieldType } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';

const { contractTemplate } = IDS;

const text = (universalIdentifier: string, name: string, label: string) =>
  ({
    universalIdentifier,
    type: FieldType.TEXT,
    name,
    label,
    icon: 'IconAbc',
    isNullable: true,
  }) as const;

// The one contract the business signs with clients, edited on «Договор». Each
// save raises the version; a signed contract keeps its own PDF, so an edit
// never reaches it.
export default defineObject({
  universalIdentifier: contractTemplate.object,
  nameSingular: 'contractTemplate',
  namePlural: 'contractTemplates',
  labelSingular: 'Шаблон договора',
  labelPlural: 'Шаблоны договора',
  icon: 'IconFileText',
  labelIdentifierFieldMetadataUniversalIdentifier: contractTemplate.name,
  fields: [
    text(contractTemplate.name, 'name', 'Название'),
    {
      universalIdentifier: contractTemplate.version,
      type: FieldType.NUMBER,
      name: 'version',
      label: 'Версия',
      icon: 'IconVersions',
      isNullable: true,
    },
    text(contractTemplate.title, 'title', 'Заголовок'),
    text(contractTemplate.subtitle, 'subtitle', 'Подзаголовок'),
    text(contractTemplate.companyName, 'companyName', 'Исполнитель'),
    text(contractTemplate.representative, 'representative', 'В лице'),
    text(contractTemplate.basis, 'basis', 'На основании'),
    text(contractTemplate.city, 'city', 'Город'),
    {
      universalIdentifier: contractTemplate.defaultTermDays,
      type: FieldType.NUMBER,
      name: 'defaultTermDays',
      label: 'Срок по умолчанию, дней',
      icon: 'IconCalendarTime',
      isNullable: true,
    },
    text(contractTemplate.preamble, 'preamble', 'Стороны'),
    // Sections one after another, each opening with a «## Название» line.
    text(contractTemplate.sections, 'sections', 'Разделы'),
    // A small PNG as a data URL: the PDF is made in the browser sandbox, which
    // cannot read a stored file back as bytes.
    text(contractTemplate.sealImage, 'sealImage', 'Подпись и печать'),
  ],
});
