import { useState } from 'react';

import { hasPoint, type LocationDraft } from 'src/location/location';
import { LocationSheet } from 'src/location/location-sheet';
import { Button, usePalette } from 'src/ui/kit';
import { SPACE, TYPE } from 'src/ui/tokens';

export const describeSavedLocation = (
  location: LocationDraft,
): string | null => {
  if (!hasPoint(location)) return null;

  const photoCount = location.savedPhotos.length + location.newPhotos.length;

  return [
    '✓ Точка сохранена',
    location.note.trim() === '' ? null : 'Как найти',
    photoCount === 0 ? null : `${photoCount} фото`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
};

// The замер saves with the rest of the form; the sheet only fills the draft.
export const LocationField = ({
  location,
  onChange,
}: {
  location: LocationDraft;
  onChange: (location: LocationDraft) => void;
}) => {
  const colors = usePalette();
  const [isOpen, setIsOpen] = useState(false);
  const summary = describeSavedLocation(location);

  return (
    <div style={{ display: 'grid', gap: SPACE.xs, justifyItems: 'start' }}>
      <span style={{ ...TYPE.label, color: colors.muted }}>Геолокация</span>
      {summary === null ? (
        <Button onClick={() => setIsOpen(true)}>📍 Указать на карте</Button>
      ) : (
        <Button variant="link" onClick={() => setIsOpen(true)}>
          {summary}
        </Button>
      )}
      {isOpen ? (
        <LocationSheet
          initial={location}
          onSave={(draft) => {
            onChange(draft);
            setIsOpen(false);
          }}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </div>
  );
};
