import { useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  useColorScheme,
  useSelectedRecordIds,
} from 'twenty-sdk/front-component';

import { IDS } from 'src/constants/universal-identifiers';

type OpeningNote = {
  id: string;
  openingNumber: number;
  label: string;
  notes: string;
};

const PALETTE = {
  light: { text: '#1f1f1f', muted: '#666666', border: '#ebebeb' },
  dark: { text: '#ebebeb', muted: '#a6a6a6', border: '#333333' },
} as const;

const PAGE_SIZE = 200;

const loadOpeningNotes = async (orderId: string): Promise<OpeningNote[]> => {
  const { orderItems } = await new CoreApiClient().query({
    orderItems: {
      __args: {
        filter: { orderId: { eq: orderId } },
        orderBy: [{ createdAt: 'AscNullsLast' }],
        first: PAGE_SIZE,
      },
      edges: {
        node: {
          id: true,
          widthCm: true,
          heightCm: true,
          notes: true,
          design: { name: true },
        },
      },
    },
  });

  // Numbered over all openings, so "Проём 3" matches the form and the table.
  return (orderItems?.edges ?? []).flatMap(({ node }, index) => {
    const notes = node.notes?.trim() ?? '';

    if (notes === '') return [];

    const size =
      node.widthCm !== null && node.heightCm !== null
        ? `${node.widthCm}×${node.heightCm}`
        : null;

    return [
      {
        id: node.id,
        openingNumber: index + 1,
        label: [node.design?.name, size].filter(Boolean).join(' · '),
        notes,
      },
    ];
  });
};

const MeasurementNotes = () => {
  const colors = PALETTE[useColorScheme()];
  const selectedRecordIds = useSelectedRecordIds();
  const orderId = selectedRecordIds.length === 1 ? selectedRecordIds[0] : null;
  const [openingNotes, setOpeningNotes] = useState<OpeningNote[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (orderId === null) return;

    loadOpeningNotes(orderId)
      .then(setOpeningNotes)
      .catch((error: unknown) =>
        setLoadError(error instanceof Error ? error.message : String(error)),
      );
  }, [orderId]);

  const text = {
    color: colors.text,
    fontFamily: 'inherit',
    fontSize: '13px',
    lineHeight: 1.5,
  } as const;

  if (loadError !== null) {
    return (
      <p role="alert" style={{ ...text, color: colors.muted, margin: 0 }}>
        Не удалось загрузить заметки замерщика: {loadError}
      </p>
    );
  }

  if (openingNotes === null) return null;

  if (openingNotes.length === 0) {
    return (
      <p style={{ ...text, color: colors.muted, margin: 0 }}>
        Замерщик не оставил заметок по проёмам
      </p>
    );
  }

  return (
    <div
      style={{
        ...text,
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
      }}
    >
      {openingNotes.map((openingNote, index) => (
        <div
          key={openingNote.id}
          style={{
            borderTop: index === 0 ? 'none' : `1px solid ${colors.border}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px 12px',
            padding: '8px 12px',
          }}
        >
          <span style={{ color: colors.muted, minWidth: '160px' }}>
            Проём {openingNote.openingNumber}
            {openingNote.label !== '' && ` · ${openingNote.label}`}
          </span>
          <span style={{ flex: '1 1 200px', whiteSpace: 'pre-line' }}>
            {openingNote.notes}
          </span>
        </div>
      ))}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: IDS.measurementNotes.frontComponent,
  name: 'measurement-notes',
  description: 'Заметки замерщика по проёмам на карточке заказа',
  component: MeasurementNotes,
});
