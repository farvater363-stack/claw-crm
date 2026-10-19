import { CoreApiClient } from 'twenty-client-sdk/core';
import { uploadFile } from 'twenty-sdk/front-component';

import { IDS } from 'src/constants/universal-identifiers';
import { type SchemeOpening } from 'src/order-sketch/order-sketch';
import { renderSchemePdf } from 'src/order-sketch/scheme-pdf';
import { fetchFieldMetadataId } from 'src/utils/fetch-field-metadata-id';

export type Scheme = {
  orderName: string;
  clientName: string | null;
  address: string;
  openings: SchemeOpening[];
};

export const printScheme = async (
  orderId: string,
  scheme: Scheme,
): Promise<string> => {
  const fileName = `Схема ${scheme.orderName}.pdf`.replace(/\s+/g, ' ');
  const bytes = await renderSchemePdf({
    title: `Схема ${scheme.orderName}`.trim(),
    subtitle: [scheme.clientName, scheme.address]
      .filter((part) => part !== null && part !== '')
      .join(' · '),
    openings: scheme.openings,
    printedAt: new Date(),
  });
  const fieldMetadataId = await fetchFieldMetadataId(
    IDS.order.object,
    IDS.order.schemePdf,
  );

  if (fieldMetadataId === null) throw new Error('order.schemePdf not found');

  const uploaded = await uploadFile(
    new File([bytes as BlobPart], fileName, { type: 'application/pdf' }),
    { fieldMetadataId, fileName },
  );

  if (uploaded.status !== 'uploaded') throw new Error(uploaded.reason);

  // Kept on the order, so the sheet opens again without printing anew.
  await new CoreApiClient().mutation({
    updateOrder: {
      __args: {
        id: orderId,
        data: {
          schemePdf: [{ fileId: uploaded.file.fileId, label: fileName }],
        },
      },
      id: true,
    },
  });

  return uploaded.file.url;
};
