import { useEffect, useRef, useState } from 'react';

import { getDevicePosition } from 'src/location/current-position';
import {
  hasPoint,
  type LocationDraft,
  pickMapCenter,
} from 'src/location/location';
import { LocationMap } from 'src/location/location-map';
import { canAddPhotos, removeSavedPhoto } from 'src/location/location-photos';
import { DEFAULT_ZOOM, type MapView } from 'src/location/map-tiles';
import { TextArea } from 'src/measurer-form/measurer-form-ui';
import {
  Button,
  FilePicker,
  Hint,
  Sheet,
  Thumbnail,
  usePalette,
} from 'src/ui/kit';
import { SPACE, TYPE } from 'src/ui/tokens';
import { createThumbnailUrl } from 'src/utils/photo-thumbnail';
import { randomUuid } from 'src/utils/random-uuid';

const MAP_HEIGHT_PX = 320;
const THUMBNAIL_SIZE_PX = 72;

export type LocationSheetProps = {
  initial: LocationDraft;
  isBusy?: boolean;
  onSave: (draft: LocationDraft) => void;
  onClose: () => void;
};

const PhotoWithRemove = ({
  photoUrl,
  onRemove,
}: {
  photoUrl: string | null;
  onRemove: () => void;
}) => (
  <span style={{ display: 'grid', gap: SPACE.xs, justifyItems: 'center' }}>
    <Thumbnail photoUrl={photoUrl} size={THUMBNAIL_SIZE_PX} />
    <Button variant="link" onClick={onRemove}>
      Убрать
    </Button>
  </span>
);

export const LocationEditor = ({
  initial,
  isBusy = false,
  onSave,
  onClose,
}: LocationSheetProps) => {
  const colors = usePalette();
  const [draft, setDraft] = useState(initial);
  const [view, setView] = useState<MapView>(() => ({
    ...pickMapCenter(initial, null),
    zoom: DEFAULT_ZOOM,
  }));
  const hasUserMovedMap = useRef(false);
  const [opensWithoutPoint] = useState(() => !hasPoint(initial));

  useEffect(() => {
    if (!opensWithoutPoint) return;

    let isMounted = true;

    void getDevicePosition().then((devicePosition) => {
      // GPS can take seconds; never pull the map from where the user put it.
      if (!isMounted || hasUserMovedMap.current || devicePosition === null) {
        return;
      }

      setView((current) => ({ ...current, ...devicePosition }));
    });

    return () => {
      isMounted = false;
    };
  }, [opensWithoutPoint]);

  const moveMap = (nextView: MapView) => {
    hasUserMovedMap.current = true;
    setView(nextView);
  };

  const addPhotos = async (files: File[]) => {
    const added = files
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, canAddPhotos(draft))
      .map((file) => ({ key: randomUuid(), file, thumbnailUrl: null }));

    setDraft((current) => ({
      ...current,
      newPhotos: [...current.newPhotos, ...added],
    }));

    // One at a time: decoding several camera photos at once can exhaust a
    // tablet's memory.
    for (const photo of added) {
      const thumbnailUrl = await createThumbnailUrl(photo.file);

      setDraft((current) => ({
        ...current,
        newPhotos: current.newPhotos.map((candidate) =>
          candidate.key === photo.key
            ? { ...candidate, thumbnailUrl }
            : candidate,
        ),
      }));
    }
  };

  const photoCount = draft.savedPhotos.length + draft.newPhotos.length;

  return (
    <div style={{ display: 'grid', gap: SPACE.md }}>
      <LocationMap
        view={view}
        heightPx={MAP_HEIGHT_PX}
        onViewChange={moveMap}
      />
      <Hint text="Двигайте карту, точка остаётся в центре" isSmall />
      <TextArea
        label="Как найти"
        value={draft.note}
        placeholder="Вход со двора, домофон, цвет ворот"
        onChange={(note) => setDraft((current) => ({ ...current, note }))}
      />
      <div style={{ display: 'grid', gap: SPACE.sm, justifyItems: 'start' }}>
        <span style={{ ...TYPE.label, color: colors.muted }}>
          Фото входа / дома
        </span>
        {photoCount > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
            {draft.savedPhotos.map((photo) => (
              <PhotoWithRemove
                key={photo.fileId}
                photoUrl={photo.url}
                onRemove={() =>
                  setDraft((current) => removeSavedPhoto(current, photo.fileId))
                }
              />
            ))}
            {draft.newPhotos.map((photo) => (
              <PhotoWithRemove
                key={photo.key}
                photoUrl={photo.thumbnailUrl}
                onRemove={() =>
                  setDraft((current) => ({
                    ...current,
                    newPhotos: current.newPhotos.filter(
                      (candidate) => candidate.key !== photo.key,
                    ),
                  }))
                }
              />
            ))}
          </div>
        ) : null}
        {canAddPhotos(draft) > 0 ? (
          // No `capture`: a tablet then offers both the camera and the gallery.
          <FilePicker
            text="Добавить фото"
            accept="image/*"
            onPick={(files) => {
              void addPhotos(files);
            }}
          />
        ) : (
          <Hint text="Больше 10 фото не помещается" isSmall />
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
        <Button
          variant="primary"
          isBusy={isBusy}
          isWideOnPhone
          onClick={() => onSave({ ...draft, lat: view.lat, lng: view.lng })}
        >
          Сохранить точку
        </Button>
        <Button
          onClick={() => {
            if (!isBusy) onClose();
          }}
        >
          Отмена
        </Button>
      </div>
    </div>
  );
};

// Новый замер is a whole page, where a sheet can cover it; a record page
// widget cannot cover the widgets below it and shows the editor inline.
export const LocationSheet = (props: LocationSheetProps) => (
  <Sheet title="Точка на карте" isBusy={props.isBusy} onClose={props.onClose}>
    <LocationEditor {...props} />
  </Sheet>
);
