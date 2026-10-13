import { type CSSProperties, type ReactNode } from 'react';

import {
  type GrilleOption,
  type OpeningPhoto,
} from 'src/measurer-form/measurer-form';
import {
  FieldLabel,
  FilterChips,
  TileGrid,
} from 'src/measurer-form/measurer-form-ui';
import {
  matchesSearch,
  rankByUse,
  sortByName,
} from 'src/measurer-form/option-search';
import { formatMoney } from 'src/ui/format';
import { PhotoTile, TextInput, usePalette } from 'src/ui/kit';
import {
  CONTROL_HEIGHT,
  RADIUS,
  SPACE,
  TABULAR_NUMBERS,
  TYPE,
} from 'src/ui/tokens';

export type Step = 'client' | 'openings' | 'payment' | 'contract';

export const STEPS: { key: Step; label: string }[] = [
  { key: 'client', label: 'Клиент' },
  { key: 'openings', label: 'Проёмы' },
  { key: 'payment', label: 'Оплата' },
  { key: 'contract', label: 'Договор' },
];

// The search of the catalogue open in place of the chosen проём
export type Picker = { query: string; grilleKind: string };

export const ALL_KINDS = '';
const PICKER_POPULAR_COUNT = 6;

// Long names (a district, a grille) break inside a word rather than push the
// column wider than the tablet.
export const WRAP: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere' };

export const thumbnailBox: CSSProperties = {
  boxSizing: 'border-box',
  position: 'relative',
  width: 92,
  height: 92,
  borderRadius: RADIUS.control,
  overflow: 'hidden',
};

export const PhotoThumbnail = ({
  photo,
  alt,
  removeLabel,
  onRemove,
}: {
  photo: OpeningPhoto;
  alt: string;
  removeLabel?: string;
  onRemove?: () => void;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        ...thumbnailBox,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.panel,
        border: `1px solid ${colors.border}`,
      }}
    >
      {photo.thumbnailUrl === null ? (
        <span style={{ fontSize: '12px', padding: SPACE.xs, ...WRAP }}>
          {photo.file.name}
        </span>
      ) : (
        <img
          src={photo.thumbnailUrl}
          alt={alt}
          style={{ height: '100%', objectFit: 'cover', width: '100%' }}
        />
      )}
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          style={{
            position: 'absolute',
            top: SPACE.xs,
            right: SPACE.xs,
            width: 32,
            height: 32,
            padding: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            border: 'none',
            borderRadius: '50%',
            color: '#ffffff',
            fontSize: '18px',
            lineHeight: '32px',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
};

export const PhotoRow = ({
  photos,
  openingNumber,
}: {
  photos: OpeningPhoto[];
  openingNumber: number;
}) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
    {photos.map(
      (photo, index) =>
        photo.thumbnailUrl !== null && (
          <PhotoThumbnail
            key={photo.key}
            photo={photo}
            alt={`Фото ${index + 1}, проём ${openingNumber}`}
          />
        ),
    )}
  </div>
);

export const ReceiptLine = ({
  title,
  detail,
  amount,
}: {
  title: string;
  detail: string;
  amount: string;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: `${SPACE.xs}px ${SPACE.md}px`,
        padding: `${SPACE.md}px 0`,
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <span
        style={{
          display: 'grid',
          flex: '1 1 160px',
          minWidth: 0,
          overflowWrap: 'break-word',
        }}
      >
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span
          style={{ ...TYPE.label, ...TABULAR_NUMBERS, color: colors.muted }}
        >
          {detail}
        </span>
      </span>
      <span
        style={{
          marginLeft: 'auto',
          ...TABULAR_NUMBERS,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {amount}
      </span>
    </div>
  );
};

export const QuickButton = ({
  label,
  isChosen = false,
  onClick,
}: {
  label: string;
  isChosen?: boolean;
  onClick: () => void;
}) => {
  const colors = usePalette();

  return (
    <button
      type="button"
      aria-pressed={isChosen}
      onClick={onClick}
      style={{
        minHeight: CONTROL_HEIGHT - SPACE.sm,
        minWidth: 0,
        padding: `${SPACE.xs}px ${SPACE.md}px`,
        background: isChosen ? colors.panel : colors.surface,
        border: `1px solid ${isChosen ? colors.text : colors.border}`,
        borderRadius: CONTROL_HEIGHT,
        color: colors.text,
        font: 'inherit',
        ...TYPE.label,
        fontWeight: isChosen ? 600 : 400,
        cursor: 'pointer',
        ...WRAP,
      }}
    >
      {label}
    </button>
  );
};

// The whole catalogue in the pane of its проём: grilles are chosen by their
// look, so every one is a picture.
export const GrillePicker = ({
  heading,
  stickyTop,
  grilles,
  uses,
  chosenId,
  picker,
  onPickerChange,
  onPick,
}: {
  // The way back and the search stay in view over the tiles: the catalogue
  // opens wherever the проём was scrolled to, and the page cannot be scrolled
  // from here.
  heading: ReactNode;
  stickyTop: number;
  grilles: GrilleOption[];
  uses: Map<string, number>;
  chosenId: string;
  picker: Picker;
  onPickerChange: (picker: Picker | null) => void;
  onPick: (designId: string) => void;
}) => {
  const kinds = [
    ...new Set(
      grilles
        .map((grille) => grille.kindName)
        .filter((kind): kind is string => kind !== null),
    ),
  ].sort((left, right) => left.localeCompare(right, 'ru'));
  const found = sortByName(
    grilles.filter(
      (grille) =>
        (picker.grilleKind === ALL_KINDS ||
          grille.kindName === picker.grilleKind) &&
        matchesSearch(picker.query, [grille.name, grille.kindName]),
    ),
  );
  const isBrowsing =
    picker.query.trim() === '' && picker.grilleKind === ALL_KINDS;
  const popular = isBrowsing
    ? rankByUse(grilles, uses).slice(0, PICKER_POPULAR_COUNT)
    : [];
  const colors = usePalette();
  const group: CSSProperties = { display: 'grid', gap: SPACE.sm };
  const tile = (grille: GrilleOption) => (
    <PhotoTile
      key={grille.id}
      name={grille.name}
      photoUrl={grille.photoUrl}
      isSelected={grille.id === chosenId}
      onSelect={() => onPick(grille.id)}
      caption={[
        grille.kindName,
        grille.pricePerSquareMeter === null
          ? 'без цены'
          : `${formatMoney(grille.pricePerSquareMeter)} за ${grille.product === 'RAILING' ? 'п.м.' : 'м²'}`,
      ]
        .filter((part) => part !== null)
        .join(' · ')}
    />
  );

  return (
    <>
      <div
        style={{
          position: 'sticky',
          top: stickyTop,
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: SPACE.md,
          padding: `${SPACE.sm}px 0`,
          background: colors.surface,
        }}
      >
        {heading}
        <TextInput
          label="Поиск"
          placeholder="Название или вид, например «ромб»"
          value={picker.query}
          onChange={(query) => onPickerChange({ ...picker, query })}
          onCancel={() => onPickerChange(null)}
        />
        {kinds.length > 0 && (
          <FilterChips
            value={picker.grilleKind}
            options={[
              { value: ALL_KINDS, label: `Все ${grilles.length}` },
              ...kinds.map((kind) => ({
                value: kind,
                label: `${kind} ${grilles.filter((grille) => grille.kindName === kind).length}`,
              })),
            ]}
            onChange={(grilleKind) => onPickerChange({ ...picker, grilleKind })}
          />
        )}
      </div>
      {popular.length > 0 && (
        <div style={group}>
          <FieldLabel>Часто берут</FieldLabel>
          <TileGrid>{popular.map(tile)}</TileGrid>
        </div>
      )}
      <div style={group}>
        <FieldLabel>
          {isBrowsing ? 'Все' : 'Найдено'} · {found.length}
        </FieldLabel>
        {found.length === 0 && (
          <span>
            Ничего не нашлось. Проверьте название или выберите «Другая», цену
            назовёт менеджер.
          </span>
        )}
        <TileGrid>
          {found.map(tile)}
          <PhotoTile
            name="Другая"
            photoUrl={null}
            isSelected={chosenId === ''}
            onSelect={() => onPick('')}
            caption="цену назовёт менеджер"
          />
        </TileGrid>
      </div>
    </>
  );
};
