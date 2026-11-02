import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useReloadOnReturn } from 'src/dashboard/reload-on-return';
import { Segmented, TextArea } from 'src/measurer-form/measurer-form-ui';
import {
  addPhotos,
  deleteNote,
  type LoadedOrderMedia,
  loadOrderMedia,
  loadViewer,
  type PhotoTarget,
  restoreNote,
  roomForPhotos,
  saveNote,
  updateNoteText,
  type Viewer,
} from 'src/order-notes/order-media-store';
import {
  formatNoteTime,
  isNewToMe,
  type MediaNote,
  type MediaPhoto,
  type MediaTagKey,
  notesCountText,
  type OrderMedia,
  TAG_LABELS,
} from 'src/order-notes/order-notes';
import { markSeen, readSeenAt } from 'src/order-notes/seen-store';
import {
  Button,
  DeleteAction,
  ErrorNote,
  FilePicker,
  Hint,
  Sheet,
  Thumbnail,
  UndoBar,
  usePalette,
} from 'src/ui/kit';
import {
  type Palette,
  RADIUS,
  SPACE,
  TABULAR_NUMBERS,
  TYPE,
} from 'src/ui/tokens';
import { createThumbnailUrl } from 'src/utils/photo-thumbnail';

const RELOAD_MILLISECONDS = 30_000;
const UNDO_MILLISECONDS = 10_000;
const PHOTOS_SHOWN = 7;
const NOTES_SHOWN = 3;
const TILE_MIN_PX = 104;
const NOTE_THUMB_PX = 56;
const PICKED_THUMB_PX = 72;

type Filter = 'all' | MediaTagKey;

type Editor =
  | { mode: 'note'; tagKey: MediaTagKey }
  | { mode: 'photo'; tagKey: MediaTagKey }
  | { mode: 'edit'; note: MediaNote };

type PickedPhoto = { key: string; file: File; thumbnailUrl: string | null };

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const initialsOf = (name: string | null) =>
  (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('') || '?';

export const CameraIcon = ({ size = 18 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M5 7h1a2 2 0 0 0 2-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

export const NoteIcon = ({ size = 18 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M8 9h8M8 13h6M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-5l-5 3v-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" />
  </svg>
);

const CountPill = ({
  icon,
  count,
  label,
}: {
  icon: ReactNode;
  count: number;
  label: string;
}) => {
  const colors = usePalette();

  return (
    <span
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 10px',
        borderRadius: 999,
        background: colors.accentTint,
        color: colors.accent,
        fontSize: '14px',
        fontWeight: 600,
        ...TABULAR_NUMBERS,
      }}
    >
      {icon}
      {count}
    </span>
  );
};

const ActionButton = ({
  variant,
  icon,
  text,
  onClick,
}: {
  variant: 'primary' | 'quiet';
  icon: ReactNode;
  text: string;
  onClick: () => void;
}) => {
  const colors = usePalette();
  const isPrimary = variant === 'primary';

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: SPACE.xs + 2,
        minHeight: 44,
        padding: `0 ${SPACE.lg}px`,
        borderRadius: RADIUS.control,
        border: `1.5px solid ${isPrimary ? colors.accent : colors.border}`,
        background: isPrimary ? colors.accent : colors.surface,
        color: isPrimary ? colors.onAccent : colors.text,
        font: 'inherit',
        fontSize: '15px',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {text}
    </button>
  );
};

const FilterChip = ({
  text,
  isOn,
  onClick,
}: {
  text: string;
  isOn: boolean;
  onClick: () => void;
}) => {
  const colors = usePalette();

  return (
    <button
      type="button"
      aria-pressed={isOn}
      onClick={onClick}
      style={{
        flex: 'none',
        minHeight: 36,
        padding: `0 ${SPACE.md}px`,
        borderRadius: 999,
        border: `1px solid ${isOn ? colors.accent : colors.border}`,
        background: isOn ? colors.accent : colors.surface,
        color: isOn ? colors.onAccent : colors.muted,
        font: 'inherit',
        fontSize: '14px',
        fontWeight: isOn ? 600 : 400,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      }}
    >
      {text}
    </button>
  );
};

const PhotoTileButton = ({
  photo,
  isNew,
  label,
  onOpen,
}: {
  photo: MediaPhoto;
  isNew: boolean;
  label: string;
  onOpen: () => void;
}) => {
  const colors = usePalette();

  return (
    <button
      type="button"
      aria-label={photo.caption}
      onClick={onOpen}
      style={{
        position: 'relative',
        padding: 0,
        border: 'none',
        borderRadius: RADIUS.control,
        overflow: 'hidden',
        aspectRatio: '1',
        maxWidth: '100%',
        background: colors.panel,
        cursor: 'pointer',
      }}
    >
      <img
        src={photo.url}
        alt=""
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
      {isNew ? (
        <span
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            padding: '1px 6px',
            borderRadius: 999,
            background: colors.success,
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 700,
          }}
        >
          новое
        </span>
      ) : null}
      <span
        style={{
          position: 'absolute',
          left: 6,
          right: 6,
          bottom: 6,
          padding: '3px 6px',
          borderRadius: 6,
          background: 'rgba(0, 0, 0, 0.6)',
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: 600,
          lineHeight: 1.25,
          textAlign: 'left',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
    </button>
  );
};

// The big photo, in place above the grid: a record page widget cannot float
// a panel over the widgets below it.
const PhotoViewer = ({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: MediaPhoto[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) => {
  const colors = usePalette();
  const photo = photos[index];

  if (photo === undefined) return null;

  const step = (by: number) =>
    onIndex((index + by + photos.length) % photos.length);

  return (
    <div
      role="dialog"
      aria-label={photo.caption}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        if (event.key === 'ArrowLeft') step(-1);
        if (event.key === 'ArrowRight') step(1);
      }}
      style={{
        display: 'grid',
        gap: SPACE.sm,
        padding: SPACE.sm,
        borderRadius: RADIUS.card,
        background: colors.panel,
      }}
    >
      <img
        src={photo.url}
        alt={photo.caption}
        style={{
          display: 'block',
          width: '100%',
          maxWidth: '100%',
          maxHeight: '70vh',
          objectFit: 'contain',
          borderRadius: RADIUS.control,
          background: colors.surface,
        }}
      />
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: SPACE.sm,
        }}
      >
        {photos.length > 1 ? (
          <Button label="Предыдущее фото" onClick={() => step(-1)}>
            ←
          </Button>
        ) : null}
        <span
          style={{
            flex: '1 1 160px',
            minWidth: 0,
            ...TYPE.label,
            overflowWrap: 'anywhere',
          }}
        >
          <span style={{ ...TABULAR_NUMBERS, color: colors.muted }}>
            {index + 1} из {photos.length} ·{' '}
          </span>
          {photo.caption}
        </span>
        {photos.length > 1 ? (
          <Button label="Следующее фото" onClick={() => step(1)}>
            →
          </Button>
        ) : null}
        <a
          href={photo.url}
          target="_blank"
          rel="noreferrer"
          style={{ color: colors.accent, fontWeight: 600, ...TYPE.label }}
        >
          Открыть полностью
        </a>
        <Button label="Закрыть фото" onClick={onClose}>
          ×
        </Button>
      </div>
    </div>
  );
};

const tagPillStyle = (colors: Palette) => ({
  fontSize: '12px',
  fontWeight: 600,
  padding: '1px 8px',
  borderRadius: 999,
  background: colors.panel,
  color: colors.text,
});

const NoteRow = ({
  note,
  isNew,
  isFirst,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onOpenPhoto,
}: {
  note: MediaNote;
  isNew: boolean;
  isFirst: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenPhoto: (url: string) => void;
}) => {
  const colors = usePalette();
  const isFromElsewhere = note.noteId === null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '36px minmax(0, 1fr)',
        gap: SPACE.md - 2,
        padding: SPACE.md,
        borderTop: isFirst ? 'none' : `1px solid ${colors.border}`,
        background: isNew ? colors.note : 'transparent',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          fontSize: '13px',
          fontWeight: 700,
          background: isFromElsewhere ? colors.panel : colors.accentTint,
          color: isFromElsewhere ? colors.muted : colors.accent,
        }}
      >
        {isFromElsewhere ? '✎' : initialsOf(note.authorName)}
      </span>
      <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            gap: `2px ${SPACE.sm}px`,
            fontSize: '13px',
            color: colors.muted,
          }}
        >
          <strong style={{ color: colors.text, fontSize: '14px' }}>
            {note.authorName ?? 'Без имени'}
          </strong>
          {note.createdAt !== null ? (
            <span>{formatNoteTime(note.createdAt)}</span>
          ) : null}
          <span style={tagPillStyle(colors)}>{note.tagLabel}</span>
          {note.isEdited ? <span>изменено</span> : null}
          {isNew ? (
            <span style={{ color: colors.success, fontWeight: 700 }}>
              новое
            </span>
          ) : null}
        </div>
        <div
          style={{
            ...TYPE.body,
            whiteSpace: 'pre-line',
            overflowWrap: 'anywhere',
          }}
        >
          {note.text}
        </div>
        {note.photoUrls.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: SPACE.xs + 2,
              paddingTop: SPACE.xs,
            }}
          >
            {note.photoUrls.map((url, index) => (
              <button
                key={url}
                type="button"
                aria-label={`Фото ${index + 1} к заметке`}
                onClick={() => onOpenPhoto(url)}
                style={{
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                <Thumbnail photoUrl={url} size={NOTE_THUMB_PX} />
              </button>
            ))}
          </div>
        ) : null}
        {canEdit || canDelete ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.md }}>
            {canEdit ? (
              <Button variant="link" onClick={onEdit}>
                Изменить
              </Button>
            ) : null}
            {canDelete ? (
              <DeleteAction
                text="Удалить"
                question="Удалить заметку?"
                onConfirm={onDelete}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const targetOptions = (
  media: OrderMedia,
  withOrderFields: boolean,
): { value: MediaTagKey; label: string }[] => [
  { value: 'order', label: TAG_LABELS.order },
  ...media.openings.map((opening) => ({
    value: `opening:${opening.id}` as MediaTagKey,
    label: opening.label,
  })),
  ...(withOrderFields
    ? [
        { value: 'address' as const, label: TAG_LABELS.address },
        { value: 'finished' as const, label: TAG_LABELS.finished },
      ]
    : []),
];

const toPhotoTarget = (tagKey: MediaTagKey): PhotoTarget =>
  tagKey === 'order' || tagKey === 'address' || tagKey === 'finished'
    ? { kind: tagKey }
    : { kind: 'opening', orderItemId: tagKey.slice('opening:'.length) };

const orderItemIdOf = (tagKey: MediaTagKey): string | null =>
  tagKey.startsWith('opening:') ? tagKey.slice('opening:'.length) : null;

const EditorForm = ({
  editor,
  media,
  isBusy,
  error,
  onSave,
  onClose,
}: {
  editor: Editor;
  media: OrderMedia;
  isBusy: boolean;
  error: string | null;
  onSave: (draft: { tagKey: MediaTagKey; text: string; files: File[] }) => void;
  onClose: () => void;
}) => {
  const colors = usePalette();
  const [tagKey, setTagKey] = useState<MediaTagKey>(
    editor.mode === 'edit' ? editor.note.tagKey : editor.tagKey,
  );
  const [text, setText] = useState(
    editor.mode === 'edit' ? editor.note.text : '',
  );
  const [picked, setPicked] = useState<PickedPhoto[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const isPhotoMode = editor.mode === 'photo';
  const room = isPhotoMode
    ? roomForPhotos(toPhotoTarget(tagKey), media)
    : roomForPhotos({ kind: 'order' }, media);

  const pick = async (files: File[]) => {
    const added = await Promise.all(
      files.map(async (file) => ({
        key: `${file.name}-${file.size}-${Math.random()}`,
        file,
        thumbnailUrl: await createThumbnailUrl(file),
      })),
    );

    setPicked((current) => [...current, ...added]);
    setProblem(null);
  };

  const save = () => {
    if (isPhotoMode && picked.length === 0) {
      setProblem('Выберите хотя бы одно фото');

      return;
    }

    if (!isPhotoMode && text.trim() === '' && picked.length === 0) {
      setProblem('Напишите заметку');

      return;
    }

    if (picked.length > room) {
      setProblem(
        room <= 0
          ? 'Сюда больше фото не помещается'
          : `Сюда помещается ещё ${room} фото`,
      );

      return;
    }

    onSave({ tagKey, text, files: picked.map((photo) => photo.file) });
  };

  return (
    <div style={{ display: 'grid', gap: SPACE.md }}>
      {editor.mode !== 'edit' ? (
        <div style={{ display: 'grid', gap: SPACE.xs }}>
          <span style={{ ...TYPE.label, fontWeight: 600, color: colors.muted }}>
            К чему
          </span>
          <Segmented
            label="К чему"
            value={tagKey}
            options={targetOptions(media, isPhotoMode)}
            onChange={(value) => {
              setTagKey(value);
              setProblem(null);
            }}
          />
        </div>
      ) : null}
      {!isPhotoMode ? (
        <TextArea
          label={editor.mode === 'edit' ? 'Текст заметки' : 'Заметка'}
          value={text}
          placeholder="Что важно знать по заказу"
          onChange={(value) => {
            setText(value);
            setProblem(null);
          }}
        />
      ) : null}
      {editor.mode !== 'edit' ? (
        <div style={{ display: 'grid', gap: SPACE.sm }}>
          {!isPhotoMode ? (
            <span
              style={{ ...TYPE.label, fontWeight: 600, color: colors.muted }}
            >
              Фото к заметке (по желанию)
            </span>
          ) : null}
          {picked.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
              {picked.map((photo) => (
                <span
                  key={photo.key}
                  style={{
                    display: 'grid',
                    gap: SPACE.xs,
                    justifyItems: 'center',
                  }}
                >
                  <Thumbnail
                    photoUrl={photo.thumbnailUrl}
                    size={PICKED_THUMB_PX}
                  />
                  <Button
                    variant="link"
                    onClick={() =>
                      setPicked((current) =>
                        current.filter(
                          (candidate) => candidate.key !== photo.key,
                        ),
                      )
                    }
                  >
                    Убрать
                  </Button>
                </span>
              ))}
            </div>
          ) : null}
          {/* No `capture`: a tablet then offers both the camera and the gallery */}
          <FilePicker
            text={picked.length > 0 ? 'Ещё фото' : 'Снять или выбрать фото'}
            accept="image/*"
            onPick={(files) => {
              void pick(files);
            }}
          />
        </div>
      ) : null}
      {problem !== null ? <Hint text={problem} tone="danger" /> : null}
      {error !== null ? <ErrorNote text={error} /> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
        <Button variant="primary" isBusy={isBusy} isWideOnPhone onClick={save}>
          {isPhotoMode
            ? picked.length > 0
              ? `Загрузить ${picked.length} фото`
              : 'Загрузить'
            : 'Сохранить'}
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

const editorTitle = (editor: Editor) =>
  editor.mode === 'photo'
    ? 'Добавить фото'
    : editor.mode === 'edit'
      ? 'Изменить заметку'
      : 'Новая заметка';

// One block for everything written or photographed about an order, the same
// on the order page and in «В работе». It reads the order again after every
// change, when the screen comes back into view and every half minute, so what
// the workshop adds shows up in the office without a reload, and back.
export const OrderMediaBlock = ({
  orderId,
  canFloat,
  onChanged,
}: {
  orderId: string;
  // A whole-page screen can cover itself with a panel; a record page widget
  // cannot cover the widgets below it and shows the form in place.
  canFloat: boolean;
  onChanged?: () => void;
}) => {
  const colors = usePalette();
  const [loaded, setLoaded] = useState<LoadedOrderMedia | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Viewer>({
    memberId: null,
    isOwner: false,
  });
  const [seenAtOnOpen] = useState(() => readSeenAt(orderId));
  const [filter, setFilter] = useState<Filter>('all');
  const [viewing, setViewing] = useState<number | null>(null);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ noteId: string } | null>(null);
  const latestRead = useRef(0);

  const load = useCallback(async () => {
    const read = ++latestRead.current;

    try {
      const next = await loadOrderMedia(orderId);

      if (read !== latestRead.current) return;

      setLoaded(next);
      setLoadError(null);
      markSeen(orderId);
    } catch (error) {
      if (read === latestRead.current) setLoadError(errorText(error));
    }
  }, [orderId]);

  useEffect(() => {
    void load();
    void loadViewer().then(setViewer);

    const timer = setInterval(() => void load(), RELOAD_MILLISECONDS);

    return () => {
      clearInterval(timer);
      // An answer that comes after the block is gone is dropped
      latestRead.current += 1;
    };
  }, [load]);

  useReloadOnReturn(useCallback(() => void load(), [load]));

  useEffect(() => {
    if (undo === null) return;

    const timer = setTimeout(() => setUndo(null), UNDO_MILLISECONDS);

    return () => clearTimeout(timer);
  }, [undo]);

  if (loadError !== null && loaded === null) {
    return (
      <ErrorNote
        text={`Не удалось загрузить фото и заметки: ${loadError}`}
        onRetry={() => void load()}
      />
    );
  }

  if (loaded === null) return null;

  const { media, orderName } = loaded;
  const seen = {
    seenAt: seenAtOnOpen,
    myMemberId: viewer.memberId,
    now: Date.now(),
  };
  const shownPhotos =
    filter === 'all'
      ? media.photos
      : media.photos.filter((photo) => photo.tagKey === filter);
  const shownNotes =
    filter === 'all'
      ? media.notes
      : media.notes.filter((note) => note.tagKey === filter);
  const visiblePhotos =
    showAllPhotos || shownPhotos.length <= PHOTOS_SHOWN + 1
      ? shownPhotos
      : shownPhotos.slice(0, PHOTOS_SHOWN);
  const visibleNotes = showAllNotes
    ? shownNotes
    : shownNotes.slice(0, NOTES_SHOWN);
  const defaultTag: MediaTagKey = filter === 'all' ? 'order' : filter;

  const afterWrite = async (failedCount: number) => {
    setNotice(
      failedCount > 0
        ? `${failedCount} фото не загрузились. Добавьте их ещё раз.`
        : null,
    );
    setEditor(null);
    await load();
    onChanged?.();
  };

  const save = async (draft: {
    tagKey: MediaTagKey;
    text: string;
    files: File[];
  }) => {
    if (editor === null) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      if (editor.mode === 'edit' && editor.note.noteId !== null) {
        await updateNoteText(editor.note.noteId, draft.text);
        await afterWrite(0);
      } else if (editor.mode === 'photo') {
        await afterWrite(
          await addPhotos(
            orderId,
            orderName,
            toPhotoTarget(draft.tagKey),
            draft.files,
          ),
        );
      } else {
        await afterWrite(
          await saveNote({
            orderId,
            orderItemId: orderItemIdOf(draft.tagKey),
            text: draft.text,
            files: draft.files,
          }),
        );
      }
    } catch (error) {
      setSaveError(`Не сохранилось, попробуйте ещё раз. (${errorText(error)})`);
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (noteId: string) => {
    try {
      await deleteNote(noteId);
      setUndo({ noteId });
      await load();
      onChanged?.();
    } catch (error) {
      setNotice(`Заметка не удалена: ${errorText(error)}`);
    }
  };

  const bringBack = async (noteId: string) => {
    setUndo(null);

    try {
      await restoreNote(noteId);
      await load();
      onChanged?.();
    } catch (error) {
      setNotice(`Не удалось вернуть заметку: ${errorText(error)}`);
    }
  };

  const openPhotoByUrl = (url: string) => {
    const index = shownPhotos.findIndex((photo) => photo.url === url);

    if (index >= 0) {
      setViewing(index);

      return;
    }

    setFilter('all');
    setViewing(
      Math.max(
        0,
        media.photos.findIndex((photo) => photo.url === url),
      ),
    );
  };

  const openEditor = (next: Editor) => {
    setSaveError(null);
    setEditor(next);
  };

  const form =
    editor === null ? null : (
      <EditorForm
        key={editor.mode === 'edit' ? editor.note.key : editor.mode}
        editor={editor}
        media={media}
        isBusy={isSaving}
        error={saveError}
        onSave={(draft) => {
          void save(draft);
        }}
        onClose={() => setEditor(null)}
      />
    );

  if (form !== null && !canFloat) {
    return (
      <div style={{ display: 'grid', gap: SPACE.md, ...TYPE.body }}>
        <span style={{ ...TYPE.rowTitle }}>
          {editor ? editorTitle(editor) : ''}
        </span>
        {form}
      </div>
    );
  }

  const isEmpty = media.photos.length === 0 && media.notes.length === 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: SPACE.md,
        color: colors.text,
        ...TYPE.body,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: `${SPACE.sm}px ${SPACE.sm + 2}px`,
        }}
      >
        {/* The record page draws the widget's own title above the block */}
        {canFloat ? (
          <span style={{ ...TYPE.rowTitle }}>Фото и заметки</span>
        ) : null}
        <CountPill
          icon={<CameraIcon size={16} />}
          count={media.photos.length}
          label={`${media.photos.length} фото`}
        />
        <CountPill
          icon={<NoteIcon size={16} />}
          count={media.notes.length}
          label={notesCountText(media.notes.length)}
        />
        <span style={{ flex: 1 }} />
        <ActionButton
          variant="quiet"
          icon={<CameraIcon />}
          text="Фото"
          onClick={() => openEditor({ mode: 'photo', tagKey: defaultTag })}
        />
        <ActionButton
          variant="primary"
          icon={<span aria-hidden>+</span>}
          text="Заметка"
          onClick={() => openEditor({ mode: 'note', tagKey: defaultTag })}
        />
      </div>

      {notice !== null ? <Hint text={notice} tone="warning" /> : null}
      {loadError !== null ? (
        <Hint
          text="Не удалось обновить, показано то, что было загружено раньше."
          tone="warning"
          isSmall
        />
      ) : null}

      {isEmpty ? (
        <Hint text="Пока ни фото, ни заметок. Добавьте первое кнопками выше." />
      ) : null}

      {media.tags.length > 1 ? (
        <div style={{ display: 'flex', gap: SPACE.xs + 2, overflowX: 'auto' }}>
          <FilterChip
            text={`Все ${media.photos.length}`}
            isOn={filter === 'all'}
            onClick={() => {
              setFilter('all');
              setViewing(null);
            }}
          />
          {media.tags.map((tag) => (
            <FilterChip
              key={tag.key}
              text={`${tag.label} · ${tag.count}`}
              isOn={filter === tag.key}
              onClick={() => {
                setFilter(tag.key);
                setViewing(null);
              }}
            />
          ))}
        </div>
      ) : null}

      {viewing !== null ? (
        <PhotoViewer
          photos={shownPhotos}
          index={Math.min(viewing, shownPhotos.length - 1)}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      ) : null}

      {shownPhotos.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_MIN_PX}px, 1fr))`,
            gap: SPACE.sm,
          }}
        >
          {visiblePhotos.map((photo, index) => (
            <PhotoTileButton
              key={photo.key}
              photo={photo}
              label={photo.caption.split(',')[0] ?? photo.caption}
              isNew={isNewToMe(photo, seen)}
              onOpen={() => setViewing(index)}
            />
          ))}
          {visiblePhotos.length < shownPhotos.length ? (
            <button
              type="button"
              onClick={() => setShowAllPhotos(true)}
              style={{
                display: 'grid',
                placeItems: 'center',
                aspectRatio: '1',
                maxWidth: '100%',
                borderRadius: RADIUS.control,
                border: `1px dashed ${colors.border}`,
                background: colors.panel,
                color: colors.accent,
                font: 'inherit',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ещё {shownPhotos.length - visiblePhotos.length}
            </button>
          ) : null}
        </div>
      ) : null}

      {shownNotes.length > 0 ? (
        <div
          style={{
            display: 'grid',
            border: `1px solid ${colors.border}`,
            borderRadius: RADIUS.control + 2,
            overflow: 'hidden',
          }}
        >
          {visibleNotes.map((note, index) => {
            const isMine =
              viewer.memberId !== null &&
              note.authorMemberId === viewer.memberId;

            return (
              <NoteRow
                key={note.key}
                note={note}
                isFirst={index === 0}
                isNew={isNewToMe(note, seen)}
                canEdit={note.noteId !== null && isMine}
                canDelete={note.noteId !== null && (isMine || viewer.isOwner)}
                onEdit={() => openEditor({ mode: 'edit', note })}
                onDelete={() => {
                  if (note.noteId !== null) void remove(note.noteId);
                }}
                onOpenPhoto={openPhotoByUrl}
              />
            );
          })}
        </div>
      ) : null}

      {visibleNotes.length < shownNotes.length ? (
        <div>
          <Button variant="link" onClick={() => setShowAllNotes(true)}>
            Показать все {notesCountText(shownNotes.length)}
          </Button>
        </div>
      ) : null}

      {undo !== null ? (
        <UndoBar
          text="Заметка удалена"
          onUndo={() => void bringBack(undo.noteId)}
        />
      ) : null}

      {form !== null && editor !== null ? (
        <Sheet
          title={editorTitle(editor)}
          isBusy={isSaving}
          onClose={() => setEditor(null)}
        >
          {form}
        </Sheet>
      ) : null}
    </div>
  );
};
