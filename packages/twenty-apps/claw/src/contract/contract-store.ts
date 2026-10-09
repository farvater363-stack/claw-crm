import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { uploadFile } from 'twenty-sdk/front-component';

import {
  buildContractDocument,
  type ContractData,
  contractTermsKey,
  documentText,
  formatPhone,
  formatSigningTime,
} from 'src/contract/contract-document';
import {
  renderContractPdf,
  type SignatureStroke,
  sha256Hex,
} from 'src/contract/contract-pdf';
import {
  type ContractTemplate,
  DEFAULT_CONTRACT_TEMPLATE,
  parseSections,
  serializeSections,
} from 'src/contract/contract-template';
import { IDS } from 'src/constants/universal-identifiers';
import { joinFullName } from 'src/utils/full-name';

const TEMPLATE_FIELDS = {
  id: true,
  version: true,
  title: true,
  subtitle: true,
  companyName: true,
  representative: true,
  basis: true,
  city: true,
  defaultTermDays: true,
  preamble: true,
  sections: true,
  sealImage: true,
} as const;

const textOr = (value: string | null | undefined, fallback: string) =>
  value === null || value === undefined ? fallback : value;

// The newest saved template, or the built-in PROFMET text before the first save.
export const loadContractTemplate = async (): Promise<ContractTemplate> => {
  const { contractTemplates } = await new CoreApiClient().query({
    contractTemplates: {
      __args: { first: 1, orderBy: [{ version: 'DescNullsLast' }] },
      edges: { node: TEMPLATE_FIELDS },
    },
  });
  const node = contractTemplates?.edges[0]?.node;

  if (node === undefined || node === null) return DEFAULT_CONTRACT_TEMPLATE;

  const sections = parseSections(node.sections ?? '');
  const fallback = DEFAULT_CONTRACT_TEMPLATE;

  return {
    id: node.id,
    version: node.version ?? fallback.version,
    title: textOr(node.title, fallback.title),
    subtitle: textOr(node.subtitle, fallback.subtitle),
    companyName: textOr(node.companyName, fallback.companyName),
    representative: textOr(node.representative, fallback.representative),
    basis: textOr(node.basis, fallback.basis),
    city: textOr(node.city, fallback.city),
    defaultTermDays: node.defaultTermDays ?? fallback.defaultTermDays,
    preamble: textOr(node.preamble, fallback.preamble),
    sections: sections.length > 0 ? sections : fallback.sections,
    sealImage:
      node.sealImage === null || node.sealImage === '' ? null : node.sealImage,
  };
};

// Saving makes the next version; the record is kept, its text replaced.
export const saveContractTemplate = async (
  template: ContractTemplate,
): Promise<ContractTemplate> => {
  const client = new CoreApiClient();
  const version = template.version + 1;
  const data = {
    name: 'Договор с клиентом',
    version,
    title: template.title,
    subtitle: template.subtitle,
    companyName: template.companyName,
    representative: template.representative,
    basis: template.basis,
    city: template.city,
    defaultTermDays: template.defaultTermDays,
    preamble: template.preamble,
    sections: serializeSections(template.sections),
    sealImage: template.sealImage ?? '',
  };

  if (template.id === null) {
    const { createContractTemplate } = await client.mutation({
      createContractTemplate: { __args: { data }, id: true },
    });

    if (!createContractTemplate?.id) throw new Error('empty response');

    return { ...template, id: createContractTemplate.id, version };
  }

  await client.mutation({
    updateContractTemplate: { __args: { id: template.id, data }, id: true },
  });

  return { ...template, version };
};

// uploadFile needs this workspace's id for signedContract.pdf, which differs
// from the universalIdentifier the app declares.
const fetchPdfFieldId = async (): Promise<string> => {
  const { objects } = await new MetadataApiClient().query({
    objects: {
      __args: {
        paging: { first: 1 },
        filter: { universalIdentifier: { eq: IDS.signedContract.object } },
      },
      edges: { node: { fieldsList: { id: true, universalIdentifier: true } } },
    },
  });
  const fieldMetadataId = objects.edges[0]?.node.fieldsList?.find(
    (field) => field.universalIdentifier === IDS.signedContract.pdf,
  )?.id;

  if (!fieldMetadataId) throw new Error('signedContract.pdf not found');

  return fieldMetadataId;
};

export const loadSignerName = async (userId: string): Promise<string> => {
  const { workspaceMembers } = await new CoreApiClient().query({
    workspaceMembers: {
      __args: { filter: { userId: { eq: userId } }, first: 1 },
      edges: { node: { name: { firstName: true, lastName: true } } },
    },
  });

  return joinFullName(workspaceMembers?.edges[0]?.node?.name) ?? '—';
};

// «iPad, Safari» from the browser's own description of itself.
export const describeDevice = (userAgent: string): string => {
  const device =
    [
      ['iPad', 'iPad'],
      ['iPhone', 'iPhone'],
      ['Android', 'Android'],
      ['Macintosh', 'Mac'],
      ['Windows', 'Windows'],
      ['Linux', 'Linux'],
    ].find(([marker]) => userAgent.includes(marker))?.[1] ?? 'Устройство';
  const browser =
    [
      ['Edg/', 'Edge'],
      ['YaBrowser', 'Яндекс Браузер'],
      ['OPR/', 'Opera'],
      ['Firefox/', 'Firefox'],
      ['CriOS', 'Chrome'],
      ['Chrome/', 'Chrome'],
      ['Safari/', 'Safari'],
    ].find(([marker]) => userAgent.includes(marker))?.[1] ?? 'браузер';

  return `${device}, ${browser}`;
};

export type ContractSigning = {
  orderId: string;
  orderName: string;
  template: ContractTemplate;
  data: ContractData;
  signature: SignatureStroke[];
  signedBy: string;
};

const pdfFileName = (orderName: string, day: string) =>
  `Договор ${orderName} от ${day.split('-').reverse().join('.')}.pdf`;

// PDF first: a contract is recorded only once its file is safely stored.
export const signContract = async ({
  orderId,
  orderName,
  template,
  data,
  signature,
  signedBy,
}: ContractSigning): Promise<void> => {
  const signedAt = new Date();
  const document = buildContractDocument(template, data);
  const checkCode = await sha256Hex(
    `${documentText(document)}\n${JSON.stringify(signature)}\n${signedAt.toISOString()}`,
  );
  const userAgent =
    typeof navigator === 'undefined' ? '' : (navigator.userAgent ?? '');
  const device = describeDevice(userAgent);
  const bytes = await renderContractPdf({
    document,
    companyName: template.companyName,
    representative: template.representative,
    sealImage: template.sealImage,
    signature,
    signedAt,
    record: {
      orderName,
      clientName: data.clientName,
      clientPhone: formatPhone(data.clientPhone),
      signedAtText: formatSigningTime(signedAt),
      signedBy,
      device,
      templateVersion: template.version,
      checkCode,
    },
  });
  const fileName = pdfFileName(orderName, data.signedOn);
  const uploaded = await uploadFile(
    new File([bytes as BlobPart], fileName, { type: 'application/pdf' }),
    { fieldMetadataId: await fetchPdfFieldId(), fileName },
  );

  if (uploaded.status !== 'uploaded') throw new Error(uploaded.reason);

  const client = new CoreApiClient();
  const { createSignedContract } = await client.mutation({
    createSignedContract: {
      __args: {
        data: {
          name: fileName.replace(/\.pdf$/, ''),
          orderId,
          pdf: [{ fileId: uploaded.file.fileId, label: fileName }],
          signedAt: signedAt.toISOString(),
          clientName: data.clientName,
          clientPhone: data.clientPhone,
          total: {
            amountMicros: Math.round(data.total) * 1_000_000,
            currencyCode: 'UZS',
          },
          templateVersion: template.version,
          termsKey: contractTermsKey(data),
          checkCode,
          fileCode: await sha256Hex(bytes),
          signedBy,
          device: `${device} · ${userAgent}`,
        },
      },
      id: true,
    },
  });

  if (!createSignedContract?.id) throw new Error('empty response');

  await client.mutation({
    updateOrder: {
      __args: { id: orderId, data: { contractState: 'SIGNED' } },
      id: true,
    },
  });
};
