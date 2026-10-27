import { useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { useSelectedRecordIds } from 'twenty-sdk/front-component';

import {
  loadOrderLocation,
  type OrderLocation,
} from 'src/location/load-order-location';
import { hasPoint, type LocationDraft } from 'src/location/location';
import { LocationMap } from 'src/location/location-map';
import { LocationEditor } from 'src/location/location-sheet';
import { saveOrderLocation } from 'src/location/save-order-location';
import { DEFAULT_ZOOM } from 'src/location/map-tiles';
import { Button, ErrorNote, Hint, Thumbnail, usePalette } from 'src/ui/kit';
import { SPACE, TYPE } from 'src/ui/tokens';
import { askFunction } from 'src/utils/ask-function';

const PREVIEW_HEIGHT_PX = 200;
const THUMBNAIL_SIZE_PX = 64;

type SendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent' }
  | { status: 'not-linked'; code: string; isBotConfigured: boolean }
  | { status: 'failed'; text: string };

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const problemText = (problem: unknown, detail: unknown): string =>
  problem === 'no-token'
    ? 'Бот не настроен на сервере'
    : problem === 'webhook'
      ? 'Бот подключён к другому сервису; привязка не работает'
      : `Telegram не принял сообщение${typeof detail === 'string' && detail !== '' ? `: ${detail}` : ''}`;

const OrderLocationOf = ({ orderId }: { orderId: string }) => {
  const colors = usePalette();
  const [location, setLocation] = useState<OrderLocation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [send, setSend] = useState<SendState>({ status: 'idle' });
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    loadOrderLocation(new CoreApiClient(), orderId)
      .then(setLocation)
      .catch((error: unknown) => setLoadError(errorText(error)));
  }, [orderId, savedCount]);

  if (loadError !== null) {
    return <ErrorNote text={`Не удалось загрузить точку: ${loadError}`} />;
  }

  if (location === null) return null;

  const save = async (draft: LocationDraft) => {
    setIsSaving(true);
    setSaveError(null);

    try {
      await saveOrderLocation(orderId, draft);
      setIsEditing(false);
      setSavedCount((count) => count + 1);
    } catch (error) {
      setSaveError(errorText(error));
    } finally {
      setIsSaving(false);
    }
  };

  const sendToTelegram = async () => {
    setSend({ status: 'sending' });
    setCheckNote(null);

    try {
      const answer = await askFunction('telegram-send', {
        method: 'POST',
        body: { orderId },
      });

      if (answer.sent === true) {
        setSend({ status: 'sent' });

        return;
      }

      if (answer.problem === 'not-linked') {
        const link = await askFunction('telegram-link');

        setSend({
          status: 'not-linked',
          code: String(link.code ?? ''),
          isBotConfigured: link.isBotConfigured === true,
        });

        return;
      }

      setSend({
        status: 'failed',
        text: problemText(answer.problem, answer.detail),
      });
    } catch (error) {
      setSend({ status: 'failed', text: errorText(error) });
    }
  };

  const checkLink = async () => {
    setCheckNote('Проверяем…');

    try {
      const answer = await askFunction('telegram-link-check', {
        method: 'POST',
      });

      if (answer.problem === null || answer.problem === undefined) {
        setCheckNote(null);
        await sendToTelegram();

        return;
      }

      setCheckNote(
        answer.problem === 'not-found'
          ? 'Код в группе не найден. Отправьте его ещё раз и нажмите «Проверить»'
          : problemText(answer.problem, null),
      );
    } catch (error) {
      setCheckNote(errorText(error));
    }
  };

  if (isEditing) {
    return (
      <div style={{ display: 'grid', gap: SPACE.md }}>
        {saveError !== null ? (
          <ErrorNote text={`Не удалось сохранить точку: ${saveError}`} />
        ) : null}
        <LocationEditor
          initial={location}
          isBusy={isSaving}
          onSave={(draft) => {
            void save(draft);
          }}
          onClose={() => setIsEditing(false)}
        />
      </div>
    );
  }

  const photos = location.savedPhotos;

  return (
    <div style={{ display: 'grid', gap: SPACE.md, ...TYPE.body }}>
      {location.addressText ? (
        <span style={{ color: colors.muted }}>{location.addressText}</span>
      ) : null}
      {hasPoint(location) ? (
        <LocationMap
          view={{
            lat: location.lat ?? 0,
            lng: location.lng ?? 0,
            zoom: DEFAULT_ZOOM,
          }}
          heightPx={PREVIEW_HEIGHT_PX}
        />
      ) : (
        <Hint text="Точка не указана" tone="warning" />
      )}
      {location.note.trim() !== '' ? (
        <span style={{ whiteSpace: 'pre-line' }}>
          <span style={{ color: colors.muted }}>Как найти: </span>
          {location.note}
        </span>
      ) : null}
      {photos.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
          {photos.map((photo) => (
            <a
              key={photo.fileId}
              href={photo.url}
              target="_blank"
              rel="noreferrer"
            >
              <Thumbnail
                photoUrl={photo.url}
                alt={photo.label}
                size={THUMBNAIL_SIZE_PX}
              />
            </a>
          ))}
        </div>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
        <Button onClick={() => setIsEditing(true)}>
          {hasPoint(location) ? 'Изменить' : '📍 Указать на карте'}
        </Button>
        <Button
          variant="primary"
          isBusy={send.status === 'sending'}
          busyText="Отправляем…"
          onClick={() => {
            void sendToTelegram();
          }}
        >
          Отправить в Telegram
        </Button>
      </div>
      {saveError !== null ? (
        <ErrorNote text={`Не удалось сохранить точку: ${saveError}`} />
      ) : null}
      {send.status === 'sent' ? (
        <Hint text="Отправлено в группу" tone="success" />
      ) : null}
      {send.status === 'failed' ? <ErrorNote text={send.text} /> : null}
      {send.status === 'not-linked' ? (
        send.isBotConfigured ? (
          <div style={{ display: 'grid', gap: SPACE.sm }}>
            <Hint
              text={`Группа ещё не привязана. Добавьте бота в группу монтажа и отправьте там: /link ${send.code}`}
            />
            <div>
              <Button
                onClick={() => {
                  void checkLink();
                }}
              >
                Проверить
              </Button>
            </div>
            {checkNote !== null ? <Hint text={checkNote} isSmall /> : null}
          </div>
        ) : (
          <ErrorNote text="Бот не настроен на сервере" />
        )
      ) : null}
    </div>
  );
};

export const OrderLocationBlock = () => {
  const selectedRecordIds = useSelectedRecordIds();

  if (selectedRecordIds.length !== 1) return null;

  return (
    <OrderLocationOf
      key={selectedRecordIds[0]}
      orderId={selectedRecordIds[0]}
    />
  );
};
