import { type CSSProperties, type ReactNode } from 'react';

import {
  type GrilleOption,
  type OpeningPhoto,
  type VisorOption,
} from 'src/measurer-form/measurer-form';
import {
  FilterChips,
  ListRow,
  PickerGroup,
  PickerPanel,
  TileGrid,
} from 'src/measurer-form/measurer-form-ui';
import {
  matchesSearch,
  rankByUse,
  sortByName,
} from 'src/measurer-form/option-search';
import { formatMoney } from 'src/ui/format';
import { PhotoTile, usePalette } from 'src/ui/kit';
import {
  CONTROL_HEIGHT,
  RADIUS,
  SPACE,
  TABULAR_NUMBERS,
  TYPE,
} from 'src/ui/tokens';

export type Step = 'measurement' | 'payment' | 'contract';

export type Picker = {
  openingKey: string;
  kind: 'grille' | 'visor';
  query: string;
  grilleKind: string;
};

export const ALL_KINDS = '';
const PICKER_POPULAR_COUNT = 6;
export const QUICK_VISOR_COUNT = 3;

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

const STEPS: { key: Step; label: string }[] = [
  { key: 'measurement', label: 'Замер' },
  { key: 'payment', label: 'Оплата' },
  { key: 'contract', label: 'Договор' },
];

// A step already passed is a button back to it; the next ones open through
// the «Далее» button, which checks what they need.
export const StepTabs = ({
  step,
  onBack,
}: {
  step: Step;
  onBack: (step: Step) => void;
}) => {
  const colors = usePalette();
  const currentIndex = STEPS.findIndex((item) => item.key === step);

  return (
    <ol
      aria-label="Шаги"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: SPACE.xs,
        margin: 0,
        padding: 0,
        listStyle: 'none',
      }}
    >
      {STEPS.map((item, index) => {
        const isCurrent = index === currentIndex;
        const isPassed = index < currentIndex;
        const look: CSSProperties = {
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: CONTROL_HEIGHT - SPACE.sm,
          padding: `0 ${SPACE.md}px`,
          borderRadius: CONTROL_HEIGHT,
          background: isCurrent ? colors.accent : 'transparent',
          border: 'none',
          color: isCurrent
            ? colors.onAccent
            : isPassed
              ? colors.accent
              : colors.muted,
          font: 'inherit',
          ...TYPE.label,
          fontWeight: isCurrent || isPassed ? 600 : 400,
        };

        return (
          <li
            key={item.key}
            aria-current={isCurrent ? 'step' : undefined}
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            {index > 0 ? (
              <span
                aria-hidden
                style={{ color: colors.muted, padding: '0 2px' }}
              >
                ›
              </span>
            ) : null}
            {isPassed ? (
              <button
                type="button"
                style={{
                  ...look,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
                onClick={() => onBack(item.key)}
              >
                {item.label}
              </button>
            ) : (
              <span style={look}>{item.label}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
};

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
        borderBottom: `1px dashed ${colors.border}`,
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
        minHeight: CONTROL_HEIGHT,
        minWidth: 0,
        padding: `${SPACE.xs}px ${SPACE.sm}px`,
        background: isChosen ? colors.accent : colors.surface,
        border: `1px solid ${isChosen ? colors.accent : colors.border}`,
        borderRadius: RADIUS.control,
        color: isChosen ? colors.onAccent : colors.text,
        font: 'inherit',
        ...TYPE.label,
        fontWeight: 600,
        cursor: 'pointer',
        ...WRAP,
      }}
    >
      {label}
    </button>
  );
};

// A choice drawn as a tile: a visor, «Не нужен», «Все решётки».
export const OptionTile = ({
  title,
  subtitle,
  isSelected = false,
  isLink = false,
  onClick,
}: {
  title: string;
  subtitle?: string;
  isSelected?: boolean;
  // Opens the full list rather than choosing
  isLink?: boolean;
  onClick: () => void;
}) => {
  const colors = usePalette();

  return (
    <button
      type="button"
      aria-pressed={isLink ? undefined : isSelected}
      onClick={onClick}
      style={{
        display: 'grid',
        alignContent: 'center',
        justifyItems: isLink ? 'center' : 'start',
        gap: SPACE.xs,
        minHeight: 80,
        padding: SPACE.md,
        background: isSelected ? colors.accentTint : colors.surface,
        border: `2px ${isLink ? 'dashed' : 'solid'} ${isSelected ? colors.accent : colors.border}`,
        borderRadius: RADIUS.card,
        color: isLink ? colors.accent : colors.text,
        font: 'inherit',
        textAlign: isLink ? 'center' : 'left',
        cursor: 'pointer',
        ...WRAP,
      }}
    >
      <span style={{ fontWeight: 600 }}>
        {isSelected ? `✓ ${title}` : title}
      </span>
      {subtitle ? (
        <span
          style={{ ...TYPE.label, ...TABULAR_NUMBERS, color: colors.muted }}
        >
          {subtitle}
        </span>
      ) : null}
    </button>
  );
};

// A проём or «Услуги» in the list beside the editor, or in the strip above it
// on a narrower screen.
export const ListItem = ({
  badge,
  title,
  detail,
  amount,
  problem,
  isSelected,
  isCard,
  onClick,
}: {
  badge: string;
  title: string;
  detail: string;
  amount: string;
  problem: string | null;
  isSelected: boolean;
  // A card of fixed width in the strip; a full-width row in the list
  isCard: boolean;
  onClick: () => void;
}) => {
  const colors = usePalette();

  return (
    <button
      type="button"
      aria-current={isSelected ? 'true' : undefined}
      onClick={onClick}
      style={{
        flex: isCard ? '0 0 230px' : undefined,
        display: 'grid',
        gridTemplateColumns: '36px minmax(0, 1fr)',
        alignItems: 'start',
        gap: SPACE.md,
        width: isCard ? undefined : '100%',
        padding: `${SPACE.md}px ${SPACE.md}px`,
        background: isSelected ? colors.accentTint : colors.surface,
        border: isCard
          ? `2px solid ${isSelected ? colors.accent : colors.border}`
          : 'none',
        borderLeft: isCard
          ? undefined
          : `4px solid ${isSelected ? colors.accent : 'transparent'}`,
        borderBottom: isCard ? undefined : `1px solid ${colors.border}`,
        borderRadius: isCard ? RADIUS.card : 0,
        color: colors.text,
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 36,
          height: 36,
          borderRadius: RADIUS.control,
          background: problem === null ? colors.panel : colors.dangerTint,
          color: problem === null ? colors.accent : colors.danger,
          fontWeight: 700,
        }}
      >
        {badge}
      </span>
      <span style={{ display: 'grid', gap: 2, ...WRAP }}>
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span
          style={{ ...TYPE.label, ...TABULAR_NUMBERS, color: colors.muted }}
        >
          {detail}
        </span>
        <span style={{ ...TYPE.label, ...TABULAR_NUMBERS }}>{amount}</span>
        {problem === null ? null : (
          <span
            style={{
              justifySelf: 'start',
              padding: `0 ${SPACE.sm}px`,
              borderRadius: SPACE.sm,
              background: colors.dangerTint,
              color: colors.danger,
              ...TYPE.label,
              fontWeight: 600,
            }}
          >
            {problem}
          </span>
        )}
      </span>
    </button>
  );
};

// A titled block of the editor
export const EditorCard = ({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <section
      aria-label={title}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: SPACE.lg,
        padding: SPACE.lg,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.card,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: SPACE.sm,
        }}
      >
        <span
          style={{
            ...TYPE.label,
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: colors.muted,
          }}
        >
          {title}
        </span>
        {aside ? (
          <span style={{ ...TABULAR_NUMBERS, fontWeight: 600 }}>{aside}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
};

export const GrillePicker = ({
  grilles,
  uses,
  chosenId,
  picker,
  onPickerChange,
  onPick,
}: {
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
  const otherTile = (
    <PhotoTile
      name="Другая"
      photoUrl={null}
      isSelected={chosenId === ''}
      onSelect={() => onPick('')}
      caption="цену назовёт менеджер"
    />
  );

  return (
    <PickerPanel
      title="Решётка"
      query={picker.query}
      placeholder="Название или вид, например «ромб»"
      onQueryChange={(query) => onPickerChange({ ...picker, query })}
      onClose={() => onPickerChange(null)}
      filters={
        kinds.length > 0 ? (
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
        ) : undefined
      }
    >
      {popular.length > 0 && (
        <PickerGroup title="Часто берут">
          <TileGrid>{popular.map(tile)}</TileGrid>
        </PickerGroup>
      )}
      <PickerGroup
        title={`${isBrowsing ? 'Все решётки' : 'Найдено'} · ${found.length}`}
      >
        {found.length === 0 && (
          <span>
            Ничего не нашлось. Проверьте название или выберите «Другая», цену
            назовёт менеджер.
          </span>
        )}
        <TileGrid>
          {found.map(tile)}
          {otherTile}
        </TileGrid>
      </PickerGroup>
    </PickerPanel>
  );
};

export const VisorPicker = ({
  visors,
  uses,
  chosenId,
  picker,
  onPickerChange,
  onPick,
}: {
  visors: VisorOption[];
  uses: Map<string, number>;
  chosenId: string;
  picker: Picker;
  onPickerChange: (picker: Picker | null) => void;
  onPick: (visorServiceId: string) => void;
}) => {
  const found = visors.filter((visor) =>
    matchesSearch(picker.query, [visor.name]),
  );
  const isBrowsing = picker.query.trim() === '';
  const popular = isBrowsing
    ? rankByUse(visors, uses).slice(0, QUICK_VISOR_COUNT)
    : [];
  const row = (visor: VisorOption) => (
    <ListRow
      key={visor.id}
      title={visor.name}
      value={
        visor.price === null
          ? 'без цены'
          : `${formatMoney(visor.price)} за п.м.`
      }
      isSelected={visor.id === chosenId}
      onSelect={() => onPick(visor.id)}
    />
  );

  return (
    <PickerPanel
      title="Козырёк"
      query={picker.query}
      placeholder="Название, например «поликарбонат»"
      onQueryChange={(query) => onPickerChange({ ...picker, query })}
      onClose={() => onPickerChange(null)}
    >
      {popular.length > 0 && (
        <PickerGroup title="Часто берут">{popular.map(row)}</PickerGroup>
      )}
      <PickerGroup
        title={`${isBrowsing ? 'Все козырьки' : 'Найдено'} · ${found.length}`}
      >
        {found.length === 0 && (
          <span>Ничего не нашлось. Проверьте название.</span>
        )}
        {found.map(row)}
      </PickerGroup>
    </PickerPanel>
  );
};
