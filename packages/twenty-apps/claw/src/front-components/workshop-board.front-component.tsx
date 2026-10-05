import { useCallback, useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';

import { isInProduction } from 'src/constants/order-status-sets';
import { IDS } from 'src/constants/universal-identifiers';
import { todayInTashkent } from 'src/pricing/dates';
import {
  Button,
  ErrorNote,
  Hint,
  InlineConfirm,
  Screen,
  SkeletonRows,
  usePalette,
} from 'src/ui/kit';
import { RADIUS, SPACE, TABULAR_NUMBERS, TYPE } from 'src/ui/tokens';
import { formatQuantity } from 'src/ui/format';
import { isAccessError } from 'src/utils/is-access-error';
import {
  loadWorkshopOrders,
  markReady,
  setStage,
} from 'src/workshop/load-workshop-board';
import {
  type BoardColumn,
  buildWorkshopBoard,
  type ColumnKey,
  columnKeyOf,
  masterKeyOf,
  NEXT_STEP_LABEL,
  nextStageOf,
  SENT_KEY,
  STAGE_COLUMNS,
  stageOfColumn,
  type WorkshopCard,
  type WorkshopOrder,
} from 'src/workshop/workshop-board';
import {
  Avatar,
  Badge,
  Chip,
  CommentNote,
  ELLIPSIS,
  Photo,
  SectionCard,
  Segmented,
  SmallButton,
  Stat,
  TimeBar,
  UrgentTag,
} from 'src/workshop/workshop-ui';

const RELOAD_MILLISECONDS = 60_000;
// One stage column is never narrower than this; five of them fit a laptop,
// and a phone swipes from one to the next.
const COLUMN_MIN_WIDTH = 248;
const LANE_TITLE_WIDTH = 124;
const CARD_ITEMS_SHOWN = 3;
const ALL_MASTERS = 'all';
const LOAD_ERROR =
  'Не удалось загрузить заказы. Проверьте интернет и нажмите "Повторить"';
const SAVE_ERROR =
  'Не удалось сохранить. Проверьте интернет и нажмите "Повторить"';
const NO_RIGHTS = 'Нет прав на этот шаг';

type WriteError = { orderId: string; text: string; retry?: () => void };
type Layout = 'stages' | 'masters';

const coverOf = (order: WorkshopOrder): string | null =>
  order.items.find((item) => item.designPhotoUrl !== null)?.designPhotoUrl ??
  order.items.flatMap((item) => item.openingPhotoUrls)[0] ??
  order.finishedPhotoUrls[0] ??
  null;

type GalleryPhoto = { url: string; caption: string };

const galleryOf = (order: WorkshopOrder): GalleryPhoto[] => {
  const seen = new Set<string>();
  const photos: GalleryPhoto[] = [];
  const add = (url: string | null, caption: string) => {
    if (url === null || seen.has(url)) return;

    seen.add(url);
    photos.push({ url, caption });
  };

  for (const item of order.items) {
    for (const url of item.openingPhotoUrls) add(url, `Проём ${item.size}`);
    add(item.designPhotoUrl, item.designName ?? 'Решётка');
  }

  for (const url of order.finishedPhotoUrls) add(url, 'Фото работы');

  return photos;
};

const clientLine = (order: WorkshopOrder): string =>
  [
    order.districtLabel?.replace(/ский$/, ''),
    order.floor === null ? null : `${order.floor} эт.`,
  ]
    .filter(Boolean)
    .join(', ');

const serviceText = (service: { name: string; quantity: number }) =>
  service.quantity === 1
    ? service.name
    : `${service.name} · ${formatQuantity(service.quantity, '')}`.trim();

const KanbanCard = ({
  card,
  isBusy,
  isConfirming,
  error,
  isDragging,
  onOpen,
  onNext,
  onConfirm,
  onCancel,
  onDragStart,
  onDragEnd,
}: {
  card: WorkshopCard;
  isBusy: boolean;
  isConfirming: boolean;
  error: WriteError | null;
  isDragging: boolean;
  onOpen: () => void;
  onNext: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) => {
  const colors = usePalette();
  const inProduction = isInProduction(card.status);
  const stripe =
    card.tone === 'danger'
      ? colors.danger
      : card.tone === 'warning'
        ? colors.warning
        : card.tone === 'success'
          ? colors.success
          : colors.border;
  const photoCount = galleryOf(card).length;
  const shortMaterials = card.materials.filter((material) => material.isShort);
  const hiddenItems = card.items.length - CARD_ITEMS_SHOWN;

  return (
    <article
      aria-label={`Заказ ${card.name}`}
      draggable={inProduction ? 'true' : undefined}
      onDragStart={inProduction ? onDragStart : undefined}
      onDragEnd={inProduction ? onDragEnd : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: SPACE.sm,
        padding: `${SPACE.md}px ${SPACE.md}px ${SPACE.md}px ${SPACE.md + 4}px`,
        borderRadius: RADIUS.card,
        background: colors.surface,
        border: `1px solid ${card.isUrgent ? colors.urgent : colors.border}`,
        boxShadow: `inset 4px 0 0 ${stripe}`,
        opacity: isDragging ? 0.45 : 1,
        cursor: inProduction ? 'grab' : 'default',
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Открыть заказ ${card.name}`}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onOpen();
        }}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: SPACE.sm,
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', gap: SPACE.md, alignItems: 'start' }}>
          <Photo
            url={coverOf(card)}
            alt={card.items[0]?.designName ?? card.name}
            size={60}
            caption={photoCount > 0 ? `${photoCount} фото` : undefined}
          />
          <div style={{ display: 'grid', gap: 2, minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: SPACE.xs + 2,
              }}
            >
              <span style={{ ...TYPE.rowTitle, ...TABULAR_NUMBERS }}>
                {card.name}
              </span>
              {card.isUrgent ? <UrgentTag /> : null}
            </div>
            <span style={{ ...ELLIPSIS, ...TYPE.label, color: colors.muted }}>
              <strong style={{ color: colors.text, fontWeight: 600 }}>
                {card.clientName ?? 'Клиент не указан'}
              </strong>
              {clientLine(card) === '' ? '' : ` · ${clientLine(card)}`}
            </span>
          </div>
          <div style={{ display: 'grid', justifyItems: 'end', gap: 2 }}>
            <Badge tone={card.tone}>{card.badge}</Badge>
          </div>
        </div>

        {card.items.length > 0 ? (
          <div style={{ display: 'grid' }}>
            {card.items.slice(0, CARD_ITEMS_SHOWN).map((item, index) => (
              <div
                key={item.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: SPACE.sm,
                  padding: `${SPACE.xs}px 0`,
                  borderTop:
                    index === 0 ? 'none' : `1px solid ${colors.border}`,
                }}
              >
                <Photo
                  url={item.designPhotoUrl}
                  alt=""
                  size={28}
                  radius={5}
                />
                <span style={{ ...ELLIPSIS, fontWeight: 600, fontSize: '14px' }}>
                  {item.designName ?? 'Позиция'}
                  {item.metalLabel ? (
                    <span
                      style={{
                        marginLeft: SPACE.xs + 2,
                        fontWeight: 400,
                        fontSize: '12px',
                        color: colors.muted,
                      }}
                    >
                      {item.metalLabel}
                    </span>
                  ) : null}
                </span>
                <span
                  style={{
                    ...TABULAR_NUMBERS,
                    fontSize: '14px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <strong>{item.size}</strong>
                  <span style={{ color: colors.muted }}> ×{item.quantity}</span>
                </span>
              </div>
            ))}
            {hiddenItems > 0 ? (
              <span style={{ fontSize: '12px', color: colors.muted }}>
                ещё {hiddenItems}
              </span>
            ) : null}
          </div>
        ) : null}

        {shortMaterials.length > 0 ||
        card.services.length > 0 ||
        card.paintColor !== null ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.xs + 1 }}>
            {shortMaterials.length > 0 ? (
              <Chip tone="danger">
                Нет на складе:{' '}
                {shortMaterials.map((material) => material.name).join(', ')}
              </Chip>
            ) : null}
            {card.services.map((service) => (
              <Chip key={service.id}>{serviceText(service)}</Chip>
            ))}
            {card.paintColor !== null ? (
              <Chip>Цвет: {card.paintColor}</Chip>
            ) : null}
          </div>
        ) : null}

        {card.comment !== null ? (
          <CommentNote text={card.comment} lines={2} />
        ) : null}
      </div>

      {!inProduction ? (
        <span
          style={{
            ...TYPE.label,
            color: card.installerName === null ? colors.warning : colors.muted,
            fontWeight: card.installerName === null ? 600 : 400,
          }}
        >
          {card.installerName === null
            ? 'Установщик не выбран'
            : `Установщик: ${card.installerName}`}
        </span>
      ) : null}

      {error !== null ? (
        <ErrorNote text={error.text} onRetry={error.retry} />
      ) : null}

      {isConfirming ? (
        <InlineConfirm
          question={`Готов заказ ${card.name}?`}
          confirmText="Да, готов"
          cancelText="Нет"
          confirmVariant="primary"
          isBusy={isBusy}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <Avatar name={card.masterId === null ? null : card.masterName} />
          <TimeBar
            percent={inProduction ? card.timeUsedPercent : null}
            tone={card.tone}
            text={card.daysLeftText}
          />
          {inProduction ? (
            <SmallButton
              isBusy={isBusy}
              variant={nextStageOf(card.stage) === 'READY' ? 'primary' : 'quiet'}
              onClick={onNext}
            >
              {NEXT_STEP_LABEL[nextStageOf(card.stage)]}
            </SmallButton>
          ) : null}
        </div>
      )}
    </article>
  );
};

const ColumnHeader = ({
  column,
  maxArea,
}: {
  column: BoardColumn;
  maxArea: number;
}) => {
  const colors = usePalette();

  return (
    <div style={{ display: 'grid', gap: SPACE.xs + 2, padding: '0 2px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
          {column.title}
        </h3>
        <span
          style={{
            ...TABULAR_NUMBERS,
            padding: '1px 7px',
            borderRadius: 6,
            background: colors.panel,
            fontSize: '13px',
            fontWeight: 700,
            color: colors.muted,
          }}
        >
          {column.cards.length}
        </span>
        <span
          style={{
            ...TABULAR_NUMBERS,
            marginLeft: 'auto',
            fontSize: '12px',
            color: colors.muted,
          }}
        >
          {formatQuantity(column.areaSquareMeters, 'м²')}
        </span>
      </div>
      <div
        aria-hidden
        style={{
          height: 3,
          borderRadius: 2,
          background: colors.border,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${maxArea > 0 ? Math.round((column.areaSquareMeters / maxArea) * 100) : 0}%`,
            height: '100%',
            background: colors.accent,
          }}
        />
      </div>
    </div>
  );
};

const OrderView = ({
  order,
  today,
  isBusy,
  isConfirming,
  error,
  onBack,
  onStage,
  onAskReady,
  onConfirm,
  onCancel,
}: {
  order: WorkshopOrder;
  today: string;
  isBusy: boolean;
  isConfirming: boolean;
  error: WriteError | null;
  onBack: () => void;
  onStage: (key: ColumnKey) => void;
  onAskReady: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  const colors = usePalette();
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = galleryOf(order);
  const shown = photos[Math.min(photoIndex, photos.length - 1)] ?? null;
  const deadline = buildWorkshopBoard([order], today).columns.flatMap(
    (column) => column.cards,
  )[0];
  const inProduction = isInProduction(order.status);
  const currentKey = columnKeyOf(order);
  const currentIndex = STAGE_COLUMNS.findIndex(
    (column) => column.key === currentKey,
  );
  const totalArea = order.items.reduce(
    (sum, item) => sum + (item.areaSquareMeters ?? 0),
    0,
  );

  return (
    <div style={{ display: 'grid', gap: SPACE.lg }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: SPACE.md,
        }}
      >
        <Button onClick={onBack}>← Все заказы</Button>
        <span style={{ ...TYPE.title, ...TABULAR_NUMBERS }}>{order.name}</span>
        {order.isUrgent ? <UrgentTag /> : null}
        {deadline ? (
          <Badge tone={deadline.tone} size="large">
            {deadline.daysLeftText}
          </Badge>
        ) : null}
        <span style={{ marginLeft: 'auto', color: colors.muted }}>
          Мастер:{' '}
          <strong style={{ color: colors.text }}>
            {order.masterId === null
              ? 'не назначен'
              : (order.masterName ?? 'без имени')}
          </strong>
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))',
          gap: SPACE.lg,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: SPACE.lg, minWidth: 0 }}>
          <SectionCard title="Фото">
            {shown === null ? (
              <Hint text="У заказа пока нет фото: ни проёмов с замера, ни решёток в «Ценах»." />
            ) : (
              <>
                <img
                  src={shown.url}
                  alt={shown.caption}
                  style={{
                    display: 'block',
                    width: '100%',
                    maxWidth: '100%',
                    aspectRatio: '4 / 3',
                    objectFit: 'contain',
                    borderRadius: RADIUS.control,
                    background: colors.panel,
                  }}
                />
                <span style={{ ...TYPE.label, color: colors.muted }}>
                  {shown.caption}
                </span>
                {photos.length > 1 ? (
                  <div
                    style={{ display: 'flex', gap: SPACE.sm, overflowX: 'auto' }}
                  >
                    {photos.map((photo, index) => (
                      <button
                        key={photo.url}
                        type="button"
                        aria-label={photo.caption}
                        aria-pressed={photo.url === shown.url}
                        onClick={() => setPhotoIndex(index)}
                        style={{
                          flex: 'none',
                          padding: 0,
                          borderRadius: RADIUS.control,
                          border: `2px solid ${photo.url === shown.url ? colors.accent : 'transparent'}`,
                          background: 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <Photo url={photo.url} alt="" size={64} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </SectionCard>

          <SectionCard
            title={`Что делаем · ${formatQuantity(Math.round(totalArea * 10) / 10, 'м²')}`}
          >
            {order.items.length === 0 ? (
              <Hint text="Позиций нет." />
            ) : (
              order.items.map((item, index) => (
                <div
                  key={item.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '44px minmax(0, 1fr) auto',
                    gap: SPACE.md,
                    alignItems: 'start',
                    paddingTop: index === 0 ? 0 : SPACE.sm,
                    borderTop:
                      index === 0 ? 'none' : `1px solid ${colors.border}`,
                  }}
                >
                  <Photo url={item.designPhotoUrl} alt="" size={44} />
                  <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>
                      {item.designName ?? 'Позиция'}
                      {item.metalLabel ? (
                        <span
                          style={{
                            marginLeft: SPACE.sm,
                            fontWeight: 400,
                            color: colors.muted,
                          }}
                        >
                          {item.metalLabel}
                        </span>
                      ) : null}
                    </span>
                    {item.notes !== null ? (
                      <span
                        style={{
                          ...TYPE.label,
                          color: colors.muted,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {item.notes}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ display: 'grid', justifyItems: 'end' }}>
                    <strong style={{ ...TABULAR_NUMBERS, fontSize: '17px' }}>
                      {item.size}
                    </strong>
                    <span
                      style={{
                        ...TABULAR_NUMBERS,
                        fontSize: '13px',
                        color: colors.muted,
                      }}
                    >
                      {item.quantity} шт
                      {item.areaSquareMeters !== null
                        ? ` · ${formatQuantity(item.areaSquareMeters, 'м²')}`
                        : ''}
                    </span>
                  </div>
                </div>
              ))
            )}
            {order.services.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.xs + 1 }}>
                {order.services.map((service) => (
                  <Chip key={service.id}>{serviceText(service)}</Chip>
                ))}
              </div>
            ) : null}
            {order.comment !== null ? <CommentNote text={order.comment} /> : null}
          </SectionCard>
        </div>

        <div style={{ display: 'grid', gap: SPACE.lg, minWidth: 0 }}>
          {inProduction ? (
            <SectionCard title="Этап в цеху">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${STAGE_COLUMNS.length}, minmax(0, 1fr))`,
                  gap: SPACE.xs + 2,
                }}
              >
                {STAGE_COLUMNS.map((column, index) => {
                  const isCurrent = index === currentIndex;
                  const isDone = index < currentIndex;

                  return (
                    <button
                      key={column.key}
                      type="button"
                      aria-pressed={isCurrent}
                      disabled={isBusy}
                      onClick={() => onStage(column.key)}
                      style={{
                        minHeight: 48,
                        padding: `0 ${SPACE.xs}px`,
                        borderRadius: RADIUS.control,
                        border: `1.5px solid ${isCurrent ? colors.accent : isDone ? 'transparent' : colors.border}`,
                        background: isDone ? colors.panel : colors.surface,
                        color: isCurrent
                          ? colors.accent
                          : isDone
                            ? colors.text
                            : colors.muted,
                        font: 'inherit',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {isDone ? `✓ ${column.title}` : column.title}
                    </button>
                  );
                })}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="Для кого">
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto minmax(0, 1fr)',
                gap: `${SPACE.xs + 2}px ${SPACE.lg}px`,
                margin: 0,
              }}
            >
              {[
                ['Клиент', order.clientName],
                [
                  'Адрес',
                  [order.districtLabel, order.addressLine]
                    .filter(Boolean)
                    .join(', ') || null,
                ],
                ['Этаж', order.floor === null ? null : String(order.floor)],
                [
                  'Установщик',
                  order.installerName ?? 'не выбран',
                ],
              ].map(([term, value]) => (
                <div key={term} style={{ display: 'contents' }}>
                  <dt style={{ color: colors.muted }}>{term}</dt>
                  <dd style={{ margin: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>
                    {value ?? '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </SectionCard>

          {order.paintColor !== null ? (
            <SectionCard title="Покраска">
              <span style={{ ...TYPE.rowTitle }}>{order.paintColor}</span>
            </SectionCard>
          ) : null}

          {order.materials.length > 0 ? (
            <SectionCard title="Материал на заказ">
              <div style={{ display: 'grid' }}>
                {order.materials.map((material, index) => (
                  <div
                    key={material.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto auto',
                      gap: SPACE.md,
                      alignItems: 'baseline',
                      padding: `${SPACE.xs + 2}px 0`,
                      borderTop:
                        index === 0 ? 'none' : `1px solid ${colors.border}`,
                    }}
                  >
                    <span style={{ overflowWrap: 'anywhere' }}>
                      {material.name}
                    </span>
                    <span style={{ ...TABULAR_NUMBERS }}>
                      {material.plannedQuantity === null
                        ? '—'
                        : formatQuantity(
                            material.plannedQuantity,
                            material.unitLabel,
                          )}
                    </span>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: material.isShort ? colors.danger : colors.success,
                      }}
                    >
                      {material.isShort ? 'нет на складе' : 'есть'}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}

          {error !== null ? (
            <ErrorNote text={error.text} onRetry={error.retry} />
          ) : null}

          {inProduction ? (
            isConfirming ? (
              <InlineConfirm
                question={`Готов заказ ${order.name}?`}
                confirmText="Да, готов"
                cancelText="Нет"
                confirmVariant="primary"
                isBusy={isBusy}
                onConfirm={onConfirm}
                onCancel={onCancel}
              />
            ) : (
              <Button
                variant="primary"
                isBusy={isBusy}
                isWideOnPhone
                onClick={onAskReady}
              >
                Готово
              </Button>
            )
          ) : (
            <Hint text="Заказ отправлен на установку." />
          )}
        </div>
      </div>
    </div>
  );
};

const WorkshopBoard = () => {
  const colors = usePalette();
  const [orders, setOrders] = useState<WorkshopOrder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [masterKey, setMasterKey] = useState<string>(ALL_MASTERS);
  const [layout, setLayout] = useState<Layout>('stages');
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<WriteError | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  // The timer, a write and «Повторить» all read, and a slow answer may come
  // after a newer one. Only the read that started last is shown.
  const latestRead = useRef(0);
  // State read inside a handler is the one of the render that made the
  // handler; a second tap in the same render would pass a check on it. A ref
  // is current.
  const isWriting = useRef(false);

  const load = useCallback(async () => {
    latestRead.current += 1;

    const read = latestRead.current;

    try {
      const loaded = await loadWorkshopOrders(new CoreApiClient());

      if (read !== latestRead.current) return;

      const isInProductionNow = (orderId: string) =>
        loaded.some(
          (order) => order.id === orderId && isInProduction(order.status),
        );

      setOrders(loaded);
      setLoadError(null);
      // A question and a note stay through a reload while their order is
      // still being built; once it has left production they are about nothing.
      setConfirmingId((current) =>
        current !== null && isInProductionNow(current) ? current : null,
      );
      setWriteError((current) =>
        current !== null && isInProductionNow(current.orderId) ? current : null,
      );
      setOpenId((current) =>
        current !== null && loaded.some((order) => order.id === current)
          ? current
          : null,
      );
    } catch {
      // The last board that was read stays under the note
      if (read === latestRead.current) setLoadError(LOAD_ERROR);
    }
  }, []);

  useEffect(() => {
    void load();

    const timer = setInterval(() => void load(), RELOAD_MILLISECONDS);

    return () => {
      clearInterval(timer);
      // An answer that comes after the screen is gone is dropped
      latestRead.current += 1;
    };
  }, [load]);

  const write = async (
    orderId: string,
    send: () => Promise<'saved' | 'moved'>,
    showAhead?: (order: WorkshopOrder) => WorkshopOrder,
  ) => {
    if (isWriting.current) return;

    isWriting.current = true;
    setBusyId(orderId);
    setWriteError(null);

    if (showAhead) {
      setOrders((current) =>
        current === null
          ? current
          : current.map((order) =>
              order.id === orderId ? showAhead(order) : order,
            ),
      );
    }

    const retry = () => void write(orderId, send, showAhead);

    try {
      await send();
      setConfirmingId((current) => (current === orderId ? null : current));
    } catch (error) {
      const isDenied = isAccessError(error);

      setWriteError({
        orderId,
        text: isDenied ? NO_RIGHTS : SAVE_ERROR,
        // Trying again cannot help a login that may not make the change.
        retry: isDenied ? undefined : retry,
      });
    }

    // After a failure too: a write whose answer was lost may be stored, and
    // the read shows where the order really is. An order a manager moved on
    // meanwhile leaves the board here.
    isWriting.current = false;
    setBusyId(null);
    await load();
  };

  const moveTo = (order: WorkshopOrder, key: ColumnKey) => {
    if (!isInProduction(order.status) || columnKeyOf(order) === key) return;

    if (key === SENT_KEY) {
      setConfirmingId(order.id);

      return;
    }

    const stage = stageOfColumn(key);

    void write(
      order.id,
      () => setStage(new CoreApiClient(), order.id, stage),
      (current) => ({ ...current, stage }),
    );
  };

  const moveNext = (order: WorkshopOrder) => {
    const next = nextStageOf(order.stage);

    moveTo(order, next === 'READY' ? SENT_KEY : next);
  };

  const confirmReady = (orderId: string) =>
    void write(orderId, () => markReady(new CoreApiClient(), orderId));

  const today = todayInTashkent();
  const allOrders = orders ?? [];
  const board = buildWorkshopBoard(
    allOrders,
    today,
    masterKey === ALL_MASTERS ? null : masterKey,
  );
  const lanes = buildWorkshopBoard(allOrders, today).lanes;
  const maxArea = Math.max(
    ...board.columns.map((column) => column.areaSquareMeters),
    0,
  );
  const openOrder = allOrders.find((order) => order.id === openId) ?? null;
  const draggingOrder =
    allOrders.find((order) => order.id === draggingId) ?? null;

  const cardOf = (card: WorkshopCard) => (
    <KanbanCard
      key={card.id}
      card={card}
      isBusy={busyId === card.id}
      isConfirming={confirmingId === card.id}
      error={writeError?.orderId === card.id ? writeError : null}
      isDragging={draggingId === card.id}
      onOpen={() => setOpenId(card.id)}
      onNext={() => moveNext(card)}
      onConfirm={() => confirmReady(card.id)}
      onCancel={() => {
        setConfirmingId(null);
        setWriteError(null);
      }}
      onDragStart={() => setDraggingId(card.id)}
      onDragEnd={() => {
        setDraggingId(null);
        setOverKey(null);
      }}
    />
  );

  // A drop zone for one stage, and in the masters layout for one master's
  // row of it; an order keeps its master when it changes stage.
  const dropZone = (
    column: BoardColumn,
    cards: WorkshopCard[],
    laneKey: string | null,
  ) => {
    const zoneKey = `${laneKey ?? ''}:${column.key}`;
    const accepts =
      draggingOrder !== null &&
      (laneKey === null || masterKeyOf(draggingOrder) === laneKey) &&
      columnKeyOf(draggingOrder) !== column.key;
    const isOver = accepts && overKey === zoneKey;

    return (
      <div
        onDragOver={() => {
          if (accepts && overKey !== zoneKey) setOverKey(zoneKey);
        }}
        onDrop={() => {
          if (accepts && draggingOrder !== null) moveTo(draggingOrder, column.key);

          setDraggingId(null);
          setOverKey(null);
        }}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          alignContent: 'start',
          gap: SPACE.sm + 2,
          minHeight: 96,
          padding: SPACE.xs,
          margin: -SPACE.xs,
          borderRadius: RADIUS.card + 2,
          background: isOver ? colors.panel : 'transparent',
          outline: isOver ? `2px dashed ${colors.accent}` : 'none',
        }}
      >
        {cards.map(cardOf)}
        {cards.length === 0 && laneKey === null ? (
          <div
            style={{
              padding: `${SPACE.lg}px ${SPACE.sm}px`,
              borderRadius: RADIUS.card,
              border: `1.5px dashed ${colors.border}`,
              color: colors.muted,
              textAlign: 'center',
              ...TYPE.label,
            }}
          >
            {column.key === SENT_KEY ? 'Пока ничего' : 'Пусто'}
          </div>
        ) : null}
      </div>
    );
  };

  const stagesBoard = (
    <div
      style={{
        display: 'grid',
        gridAutoFlow: 'column',
        gridAutoColumns: `minmax(${COLUMN_MIN_WIDTH}px, 1fr)`,
        gap: SPACE.md,
        alignItems: 'start',
        overflowX: 'auto',
        scrollSnapType: 'x proximity',
        paddingBottom: SPACE.sm,
      }}
    >
      {board.columns.map((column) => (
        <section
          key={column.key}
          aria-label={column.title}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            gap: SPACE.md,
            scrollSnapAlign: 'start',
            minWidth: 0,
          }}
        >
          <ColumnHeader column={column} maxArea={maxArea} />
          {dropZone(column, column.cards, null)}
        </section>
      ))}
    </div>
  );

  const shownLanes = lanes.filter(
    (lane) => masterKey === ALL_MASTERS || lane.key === masterKey,
  );

  const mastersBoard = (
    <div style={{ overflowX: 'auto', paddingBottom: SPACE.sm }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${LANE_TITLE_WIDTH}px repeat(${board.columns.length}, minmax(${COLUMN_MIN_WIDTH}px, 1fr))`,
          columnGap: SPACE.md,
          alignItems: 'start',
        }}
      >
        <div />
        {board.columns.map((column) => (
          <div key={column.key} style={{ paddingBottom: SPACE.md }}>
            <ColumnHeader column={column} maxArea={maxArea} />
          </div>
        ))}
        {shownLanes.map((lane) => (
          <div key={lane.key} style={{ display: 'contents' }}>
            <div
              style={{
                display: 'grid',
                gap: 2,
                padding: `${SPACE.md}px ${SPACE.sm}px ${SPACE.md}px 0`,
                borderTop: `1px solid ${colors.border}`,
                alignSelf: 'stretch',
              }}
            >
              <strong style={{ fontSize: '15px' }}>{lane.title}</strong>
              <span style={{ fontSize: '12px', color: colors.muted }}>
                в работе: {lane.inWorkCount}
              </span>
            </div>
            {board.columns.map((column) => (
              <div
                key={column.key}
                style={{
                  padding: `${SPACE.md}px 0`,
                  borderTop: `1px solid ${colors.border}`,
                  alignSelf: 'stretch',
                  minWidth: 0,
                }}
              >
                {dropZone(
                  column,
                  column.cards.filter((card) => masterKeyOf(card) === lane.key),
                  lane.key,
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  const hasOrders = board.columns.some((column) => column.cards.length > 0);

  return (
    <Screen
      title="В работе"
      isWide
      action={
        orders !== null && openOrder === null ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: SPACE.sm,
            }}
          >
            <Segmented
              label="Мастер"
              value={masterKey}
              options={[
                { value: ALL_MASTERS, label: 'Все' },
                ...lanes.map((lane) => ({ value: lane.key, label: lane.title })),
              ]}
              onChange={setMasterKey}
            />
            <Segmented<Layout>
              label="Вид"
              value={layout}
              options={[
                { value: 'stages', label: 'По этапам' },
                { value: 'masters', label: 'По мастерам' },
              ]}
              onChange={setLayout}
            />
          </div>
        ) : undefined
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: SPACE.lg,
        }}
      >
        {orders === null && loadError === null ? (
          <SkeletonRows count={4} />
        ) : null}
        {loadError !== null ? (
          <ErrorNote text={loadError} onRetry={() => void load()} />
        ) : null}

        {openOrder !== null ? (
          <OrderView
            key={openOrder.id}
            order={openOrder}
            today={today}
            isBusy={busyId === openOrder.id}
            isConfirming={confirmingId === openOrder.id}
            error={writeError?.orderId === openOrder.id ? writeError : null}
            onBack={() => setOpenId(null)}
            onStage={(key) => moveTo(openOrder, key)}
            onAskReady={() => setConfirmingId(openOrder.id)}
            onConfirm={() => confirmReady(openOrder.id)}
            onCancel={() => {
              setConfirmingId(null);
              setWriteError(null);
            }}
          />
        ) : orders !== null ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
              <Stat value={String(board.summary.inWork)} label="в цеху" />
              <Stat
                value={String(board.summary.overdue)}
                label="просрочено"
                tone={board.summary.overdue > 0 ? 'danger' : null}
              />
              <Stat
                value={String(board.summary.dueToday)}
                label="сдать сегодня"
                tone={board.summary.dueToday > 0 ? 'warning' : null}
              />
              <Stat
                value={String(board.summary.shortOfMaterial)}
                label="нет материала"
                tone={board.summary.shortOfMaterial > 0 ? 'danger' : null}
              />
              <Stat
                value={formatQuantity(board.summary.areaSquareMeters, '')}
                label="м² в работе"
              />
            </div>
            {hasOrders ? (
              layout === 'stages' ? (
                stagesBoard
              ) : (
                mastersBoard
              )
            ) : (
              <Hint text="Сейчас в производстве нет заказов." />
            )}
          </>
        ) : null}
      </div>
    </Screen>
  );
};

export default defineFrontComponent({
  universalIdentifier: IDS.workshop.frontComponent,
  name: 'workshop-board',
  description: 'В работе: что делает цех, на каком этапе и к какому сроку',
  component: WorkshopBoard,
});
