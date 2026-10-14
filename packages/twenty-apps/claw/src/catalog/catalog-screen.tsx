import { useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';

import {
  ALL_KINDS,
  type CatalogDesign,
  filterCatalog,
  kindsOf,
  priceText,
} from 'src/catalog/catalog-filter';
import { type Product, toProduct } from 'src/constants/select-options';
import { FilterChips } from 'src/measurer-form/measurer-form-ui';
import { fromCurrency } from 'src/recalc/money';
import {
  Button,
  Checkbox,
  ErrorNote,
  PhotoTile,
  Screen,
  SkeletonRows,
  Tabs,
  TextInput,
  usePalette,
} from 'src/ui/kit';
import { RADIUS, SPACE, TYPE } from 'src/ui/tokens';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';
import { isAccessError } from 'src/utils/is-access-error';

const PAGE_SIZE = 200;
const SWIPE_MIN_DISTANCE = 50;

const PRODUCT_TABS: { value: Product; label: string }[] = [
  { value: 'GRILLE', label: 'Решётки' },
  { value: 'RAILING', label: 'Перилла' },
];

type CatalogData = {
  designs: CatalogDesign[];
  // null when this role may not read prices
  prices: Map<string, number | null> | null;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: CatalogData };

const loadDesigns = (client: CoreApiClient) =>
  fetchAllPages(async (after) => {
    const { designs } = await client.query({
      designs: {
        __args: { first: PAGE_SIZE, after },
        edges: {
          node: {
            id: true,
            name: true,
            product: true,
            photos: { url: true },
            grilleKind: { name: true },
          },
        },
        pageInfo: PAGE_INFO,
      },
    });

    return designs;
  });

// Asked apart from the designs: the workshop may see the catalogue but not
// the price, and a field it cannot read fails the whole query.
const loadPrices = async (client: CoreApiClient) => {
  try {
    const nodes = await fetchAllPages(async (after) => {
      const { designs } = await client.query({
        designs: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              id: true,
              pricePerSquareMeter: { amountMicros: true, currencyCode: true },
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return designs;
    });

    return new Map(
      nodes.map((node) => [node.id, fromCurrency(node.pricePerSquareMeter)]),
    );
  } catch (error) {
    if (!isAccessError(error)) throw error;

    return null;
  }
};

const loadState = async (): Promise<LoadState> => {
  try {
    const client = new CoreApiClient();
    const [nodes, prices] = await Promise.all([
      loadDesigns(client),
      loadPrices(client),
    ]);

    return {
      status: 'ready',
      data: {
        designs: nodes.map((node) => ({
          id: node.id,
          name: node.name ?? '',
          product: toProduct(node.product),
          kindName: node.grilleKind?.name ?? null,
          photoUrls: (node.photos ?? []).flatMap((photo) =>
            photo?.url ? [photo.url] : [],
          ),
        })),
        prices,
      },
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Не удалось загрузить каталог: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

// Over the whole visible page, wherever the grid was scrolled to. The widget
// wrapper traps a fixed overlay, so this is the Sheet's sticky 100cqh panel.
const PhotoViewer = ({
  design,
  caption,
  onClose,
}: {
  design: CatalogDesign;
  caption: string | null;
  onClose: () => void;
}) => {
  const [index, setIndex] = useState(0);
  const swipeStartX = useRef<number | null>(null);
  const count = design.photoUrls.length;

  // One photo at a time: the sandbox cannot scroll a strip from code, so the
  // arrows and dots could not move a swipeable one.
  const show = (next: number) => {
    if (next >= 0 && next < count) setIndex(next);
  };

  const arrow = (direction: -1 | 1) => (
    <button
      type="button"
      aria-label={direction === -1 ? 'Предыдущее фото' : 'Следующее фото'}
      disabled={index + direction < 0 || index + direction >= count}
      onClick={() => show(index + direction)}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        border: 'none',
        background: 'rgba(255, 255, 255, 0.15)',
        color: '#fff',
        font: 'inherit',
        fontSize: 24,
        cursor: 'pointer',
        opacity: index + direction < 0 || index + direction >= count ? 0.3 : 1,
      }}
    >
      {direction === -1 ? '‹' : '›'}
    </button>
  );

  return (
    <div
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        if (event.key === 'ArrowLeft') show(index - 1);
        if (event.key === 'ArrowRight') show(index + 1);
      }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '100%',
        minHeight: '100cqh',
        zIndex: 1000,
        background: '#000',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={design.name}
        style={{
          position: 'sticky',
          top: 0,
          height: '100cqh',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
          color: '#fff',
          ...TYPE.body,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: SPACE.md,
            padding: SPACE.lg,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={TYPE.title}>{design.name}</div>
            {caption ? (
              <div style={{ ...TYPE.label, opacity: 0.75 }}>{caption}</div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            style={{
              flex: 'none',
              width: 44,
              height: 44,
              borderRadius: 22,
              border: 'none',
              background: 'rgba(255, 255, 255, 0.15)',
              color: '#fff',
              font: 'inherit',
              fontSize: 24,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
        {count === 0 ? (
          <div style={{ display: 'grid', placeItems: 'center', opacity: 0.75 }}>
            Фото пока нет
          </div>
        ) : (
          <div
            onPointerDown={(event) => {
              swipeStartX.current = event.clientX;
            }}
            onPointerUp={(event) => {
              const start = swipeStartX.current;

              swipeStartX.current = null;
              if (start === null) return;

              const distance = event.clientX - start;

              if (Math.abs(distance) > SWIPE_MIN_DISTANCE) {
                show(index + (distance < 0 ? 1 : -1));
              }
            }}
            onPointerCancel={() => {
              swipeStartX.current = null;
            }}
            style={{
              display: 'grid',
              touchAction: 'pan-y pinch-zoom',
              userSelect: 'none',
            }}
          >
            <img
              key={design.photoUrls[index]}
              src={design.photoUrls[index]}
              alt={`${design.name}, фото ${index + 1} из ${count}`}
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                minHeight: 0,
                objectFit: 'contain',
              }}
            />
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: SPACE.lg,
            padding: SPACE.lg,
            minHeight: 44,
          }}
        >
          {count > 1 ? (
            <>
              {arrow(-1)}
              <div style={{ display: 'flex', gap: SPACE.sm }}>
                {design.photoUrls.map((_, photoIndex) => (
                  <button
                    key={photoIndex}
                    type="button"
                    aria-label={`Фото ${photoIndex + 1}`}
                    aria-pressed={photoIndex === index}
                    onClick={() => show(photoIndex)}
                    style={{
                      width: 10,
                      height: 10,
                      padding: 0,
                      borderRadius: 5,
                      border: 'none',
                      background:
                        photoIndex === index
                          ? '#fff'
                          : 'rgba(255, 255, 255, 0.35)',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
              {arrow(1)}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const Catalog = () => {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [product, setProduct] = useState<Product>('GRILLE');
  const [kind, setKind] = useState(ALL_KINDS);
  const [query, setQuery] = useState('');
  const [arePricesShown, setArePricesShown] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const colors = usePalette();

  useEffect(() => {
    void loadState().then(setLoad);
  }, []);

  if (load.status === 'loading') {
    return (
      <Screen title="Каталог">
        <SkeletonRows count={6} />
      </Screen>
    );
  }

  if (load.status === 'error') {
    return (
      <Screen title="Каталог">
        <ErrorNote
          text={load.message}
          onRetry={() => {
            setLoad({ status: 'loading' });
            void loadState().then(setLoad);
          }}
        />
      </Screen>
    );
  }

  const { designs, prices } = load.data;
  const kinds = kindsOf(designs, product);
  const found = filterCatalog(designs, { product, kind, query });
  const openDesign = designs.find((design) => design.id === openId) ?? null;
  const captionOf = (design: CatalogDesign) =>
    [
      design.kindName,
      arePricesShown && prices !== null
        ? priceText(prices.get(design.id) ?? null, design.product)
        : null,
    ]
      .filter((part) => part !== null)
      .join(' · ') || null;

  return (
    <Screen
      title="Каталог"
      maxWidth={1100}
      action={
        prices === null ? null : (
          <Checkbox
            label="Показать цены"
            isChecked={arePricesShown}
            onChange={setArePricesShown}
          />
        )
      }
    >
      <div style={{ display: 'grid', gap: SPACE.lg }}>
        <Tabs
          value={product}
          options={PRODUCT_TABS}
          onChange={(next) => {
            setProduct(next);
            setKind(ALL_KINDS);
          }}
        />
        <TextInput
          label="Поиск"
          placeholder="Название или вид"
          value={query}
          onChange={setQuery}
          onCancel={() => setQuery('')}
        />
        {kinds.length > 0 ? (
          <FilterChips
            value={kind}
            options={[
              {
                value: ALL_KINDS,
                label: `Все ${designs.filter((design) => design.product === product).length}`,
              },
              ...kinds.map((entry) => ({
                value: entry.kind,
                label: `${entry.kind} ${entry.count}`,
              })),
            ]}
            onChange={setKind}
          />
        ) : null}
        {found.length === 0 ? (
          <div
            style={{
              padding: SPACE.xl,
              background: colors.panel,
              borderRadius: RADIUS.card,
            }}
          >
            {query.trim() === '' && kind === ALL_KINDS
              ? 'Здесь пока пусто.'
              : 'Ничего не нашлось.'}
            {query.trim() === '' && kind === ALL_KINDS ? null : (
              <>
                {' '}
                <Button
                  variant="link"
                  onClick={() => {
                    setQuery('');
                    setKind(ALL_KINDS);
                  }}
                >
                  Показать все
                </Button>
              </>
            )}
          </div>
        ) : (
          // Two columns on a phone, tiles about 220 px wide above that
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(min(220px, calc(50% - ${SPACE.md / 2}px)), 1fr))`,
              gap: SPACE.md,
            }}
          >
            {found.map((design) => (
              <PhotoTile
                key={design.id}
                name={design.name}
                photoUrl={design.photoUrls[0] ?? null}
                onSelect={() => setOpenId(design.id)}
                caption={
                  [
                    captionOf(design),
                    design.photoUrls.length > 1
                      ? `${design.photoUrls.length} фото`
                      : null,
                  ]
                    .filter((part) => part !== null)
                    .join(' · ') || undefined
                }
              />
            ))}
          </div>
        )}
      </div>
      {openDesign ? (
        <PhotoViewer
          key={openDesign.id}
          design={openDesign}
          caption={captionOf(openDesign)}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </Screen>
  );
};
