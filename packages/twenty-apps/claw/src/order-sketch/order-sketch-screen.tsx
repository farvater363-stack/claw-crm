import { useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { useSelectedRecordIds } from 'twenty-sdk/front-component';

import { describeAddress } from 'src/contract/contract-data';
import { SketchDrawing } from 'src/measurer-form/measurer-form-ui';
import { ShapeFields } from 'src/measurer-form/shape-fields';
import {
  buildShapeOutline,
  createShapeDraft,
  outlineHeightCm,
  type ShapeDraft,
  shapeDraftFromStored,
  type StoredShape,
  toStoredShape,
} from 'src/opening-shape/opening-shape';
import {
  type SchemeOpening,
  schemeProductName,
  schemeSketchLayout,
  toSchemeOpenings,
} from 'src/order-sketch/order-sketch';
import { printScheme, type Scheme } from 'src/order-sketch/print-scheme';
import { Button, Field, Hint, TextInput, usePalette } from 'src/ui/kit';
import { RADIUS, SPACE, TABULAR_NUMBERS, TYPE } from 'src/ui/tokens';
import { joinFullName } from 'src/utils/full-name';
import { isAccessError } from 'src/utils/is-access-error';
import { parseDecimalInput } from 'src/utils/parse-decimal-input';

const PAGE_SIZE = 200;
const CARD_MIN_WIDTH_PX = 220;
// A single column on a phone would draw each проём a full screen tall.
const SKETCH_MAX_WIDTH_PX = 280;

const loadScheme = async (orderId: string): Promise<Scheme> => {
  const { orders, orderItems } = await new CoreApiClient().query({
    orders: {
      __args: { filter: { id: { eq: orderId } }, first: 1 },
      edges: {
        node: {
          name: true,
          clientFullName: { firstName: true, lastName: true },
          district: true,
          addressLine: true,
          floor: true,
        },
      },
    },
    orderItems: {
      __args: {
        filter: { orderId: { eq: orderId } },
        first: PAGE_SIZE,
        orderBy: [{ createdAt: 'AscNullsLast' }],
      },
      edges: {
        node: {
          id: true,
          product: true,
          shape: true,
          widthCm: true,
          heightCm: true,
          projectionCm: true,
          projectionKind: true,
          projectionSide: true,
          quantity: true,
          openingNumber: true,
          notes: true,
          design: { name: true },
        },
      },
    },
  });
  const order = orders?.edges[0]?.node;

  return {
    orderName: order?.name ?? '',
    clientName: joinFullName(order?.clientFullName ?? null),
    address: describeAddress({
      district: order?.district ?? null,
      addressLine: order?.addressLine ?? null,
      floor: order?.floor ?? null,
    }),
    openings: toSchemeOpenings(
      (orderItems?.edges ?? []).map(({ node }) => ({
        id: node.id,
        product: node.product ?? null,
        shape: node.shape ?? null,
        widthCm: node.widthCm,
        heightCm: node.heightCm,
        projectionCm: node.projectionCm,
        projectionKind: node.projectionKind ?? null,
        projectionSide: node.projectionSide ?? null,
        quantity: node.quantity,
        designName: node.design?.name ?? null,
        notes: node.notes ?? null,
        openingNumber: node.openingNumber ?? null,
      })),
    ),
  };
};

let editKeySequence = 0;
const nextEditKey = () => `scheme-point-${editKeySequence++}`;

type EditDraft = { widthCm: string; heightCm: string; shape: ShapeDraft };

const editDraftOf = (opening: SchemeOpening): EditDraft => ({
  widthCm: opening.sketch === null ? '' : String(opening.sketch.widthCm),
  heightCm: opening.sketch === null ? '' : String(opening.sketch.heightCm),
  shape:
    opening.shape === null
      ? createShapeDraft(nextEditKey)
      : shapeDraftFromStored(opening.shape, nextEditKey),
});

// What «Сохранить» writes on the item; the recalc then re-prices the order
// from the new width and height.
const toItemUpdate = (
  opening: SchemeOpening,
  draft: EditDraft,
):
  | {
      update: {
        widthCm: number;
        heightCm: number;
        shape?: StoredShape | null;
      };
    }
  | { errors: string[] } => {
  if (opening.isRailing) {
    const widthCm = parseDecimalInput(draft.widthCm);
    const heightCm = parseDecimalInput(draft.heightCm);

    if (
      widthCm === null ||
      heightCm === null ||
      widthCm <= 0 ||
      heightCm <= 0
    ) {
      return { errors: ['Укажите длину и высоту перилл больше 0'] };
    }

    return { update: { widthCm, heightCm } };
  }

  const result = buildShapeOutline(draft.shape, draft.widthCm, draft.heightCm);

  if (!result.isValid) return { errors: result.errors };

  return {
    update: {
      widthCm: result.outline.widthCm,
      heightCm: outlineHeightCm(result.outline),
      shape: toStoredShape(draft.shape, result.outline),
    },
  };
};

const OpeningEditor = ({
  opening,
  onSaved,
  onCancel,
}: {
  opening: SchemeOpening;
  onSaved: () => void;
  onCancel: () => void;
}) => {
  const [draft, setDraft] = useState<EditDraft>(() => editDraftOf(opening));
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const cmField = (label: string, key: 'widthCm' | 'heightCm') => (
    <Field label={label}>
      <TextInput
        label={`${label}, см`}
        inputMode="decimal"
        suffix="см"
        value={draft[key]}
        onChange={(value) => setDraft({ ...draft, [key]: value })}
      />
    </Field>
  );

  const save = async () => {
    const result = toItemUpdate(opening, draft);

    if ('errors' in result) {
      setErrors(result.errors);

      return;
    }

    setIsSaving(true);
    setErrors([]);

    try {
      await new CoreApiClient().mutation({
        updateOrderItem: {
          __args: { id: opening.id, data: result.update },
          id: true,
        },
      });
      onSaved();
    } catch (error) {
      setErrors([
        isAccessError(error)
          ? 'У этого входа нет прав менять размеры. Их меняет менеджер или замерщик.'
          : `Не сохранилось: ${error instanceof Error ? error.message : String(error)}`,
      ]);
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: SPACE.md }}>
      {opening.isRailing ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: SPACE.md,
          }}
        >
          {cmField('Длина', 'widthCm')}
          {cmField('Высота', 'heightCm')}
        </div>
      ) : (
        <ShapeFields
          shape={draft.shape}
          widthCm={draft.widthCm}
          heightCm={draft.heightCm}
          nextKey={nextEditKey}
          liveErrors={[]}
          onShapeChange={(shape) => setDraft({ ...draft, shape })}
          onWidthChange={(widthCm) => setDraft({ ...draft, widthCm })}
          onHeightChange={(heightCm) => setDraft({ ...draft, heightCm })}
        />
      )}
      {errors.map((error) => (
        <Hint key={error} tone="danger" text={error} />
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
        <Button variant="primary" isBusy={isSaving} onClick={() => void save()}>
          Сохранить
        </Button>
        <Button onClick={onCancel}>Отмена</Button>
      </div>
    </div>
  );
};

const OpeningCard = ({
  opening,
  isEditing,
  onEdit,
  onSaved,
  onCancel,
}: {
  opening: SchemeOpening;
  isEditing: boolean;
  onEdit: () => void;
  onSaved: () => void;
  onCancel: () => void;
}) => {
  const colors = usePalette();
  const { sketch } = opening;

  return (
    <div
      style={{
        display: 'grid',
        gap: SPACE.sm,
        gridColumn: isEditing ? '1 / -1' : undefined,
        padding: SPACE.md,
        background: colors.surface,
        border: `1px solid ${isEditing ? colors.accent : colors.border}`,
        borderRadius: RADIUS.card,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: SPACE.sm,
          ...TYPE.label,
          fontWeight: 600,
        }}
      >
        <span>
          {opening.title}
          {opening.quantity > 1 ? (
            <span style={TABULAR_NUMBERS}>{` × ${opening.quantity}`}</span>
          ) : null}
        </span>
        {isEditing ? null : (
          <Button variant="link" onClick={onEdit}>
            Изменить
          </Button>
        )}
      </div>
      <div
        style={{
          width: '100%',
          maxWidth: SKETCH_MAX_WIDTH_PX,
          margin: '0 auto',
        }}
      >
        <SketchDrawing layout={schemeSketchLayout(opening)} />
      </div>
      <div style={{ display: 'grid', gap: 2 }}>
        <span style={{ ...TYPE.label, fontWeight: 600 }}>
          {schemeProductName(opening)}
        </span>
        <span
          style={{ ...TYPE.label, color: colors.muted, ...TABULAR_NUMBERS }}
        >
          {sketch === null
            ? 'Размеры не указаны'
            : [`${sketch.sizeText} см`, sketch.sideText, sketch.unitsText]
                .filter(Boolean)
                .join(' · ')}
        </span>
        {opening.notes !== null ? (
          <span
            style={{
              ...TYPE.label,
              color: colors.muted,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {`Заметка: ${opening.notes}`}
          </span>
        ) : null}
      </div>
      {isEditing ? (
        <OpeningEditor
          opening={opening}
          onSaved={onSaved}
          onCancel={onCancel}
        />
      ) : null}
    </div>
  );
};

type PrintState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'ready'; url: string }
  | { status: 'failed'; text: string };

const OrderSketchOf = ({ orderId }: { orderId: string }) => {
  const colors = usePalette();
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [print, setPrint] = useState<PrintState>({ status: 'idle' });
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    loadScheme(orderId)
      .then(setScheme)
      .catch((error: unknown) =>
        setLoadError(error instanceof Error ? error.message : String(error)),
      );
  }, [orderId, savedCount]);

  const note = { ...TYPE.label, color: colors.muted, margin: 0 };

  if (loadError !== null) {
    return (
      <p role="alert" style={note}>
        Не удалось загрузить схему: {loadError}
      </p>
    );
  }

  if (scheme === null) return null;

  if (scheme.openings.length === 0) {
    return <p style={note}>В заказе пока нет проёмов</p>;
  }

  const startPrint = () => {
    setPrint({ status: 'busy' });
    printScheme(orderId, scheme)
      .then((url) => setPrint({ status: 'ready', url }))
      .catch((error: unknown) =>
        setPrint({
          status: 'failed',
          text: `Схема не напечаталась: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
  };

  return (
    <div
      style={{
        display: 'grid',
        gap: SPACE.md,
        color: colors.text,
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: SPACE.sm,
        }}
      >
        <Button
          isBusy={print.status === 'busy'}
          busyText="Готовим PDF…"
          onClick={startPrint}
        >
          Печать схемы
        </Button>
        {print.status === 'ready' ? (
          <a
            href={print.url}
            target="_blank"
            rel="noreferrer"
            style={{ color: colors.accent, fontWeight: 600 }}
          >
            Открыть PDF для печати
          </a>
        ) : null}
        {print.status === 'failed' ? (
          <Hint tone="danger" text={print.text} />
        ) : null}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_WIDTH_PX}px, 1fr))`,
          gap: SPACE.md,
        }}
      >
        {scheme.openings.map((opening) => (
          <OpeningCard
            key={opening.id}
            opening={opening}
            isEditing={editingId === opening.id}
            onEdit={() => setEditingId(opening.id)}
            onCancel={() => setEditingId(null)}
            onSaved={() => {
              setEditingId(null);
              setPrint({ status: 'idle' });
              setSavedCount((count) => count + 1);
            }}
          />
        ))}
      </div>
    </div>
  );
};

export const OrderSketch = () => {
  const selectedRecordIds = useSelectedRecordIds();

  if (selectedRecordIds.length !== 1) return null;

  return (
    <OrderSketchOf key={selectedRecordIds[0]} orderId={selectedRecordIds[0]} />
  );
};
