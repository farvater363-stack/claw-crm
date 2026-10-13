import { type ReactNode } from 'react';

import { FieldLabel, Segmented } from 'src/measurer-form/measurer-form-ui';
import {
  type CustomPointDraft,
  type PointDraft,
  pointLetter,
  SHAPE_KIND_OPTIONS,
  type ShapeDraft,
  type ShapeKind,
} from 'src/opening-shape/opening-shape';
import { Button, Field, TextInput, usePalette } from 'src/ui/kit';
import { SPACE, TYPE } from 'src/ui/tokens';

const column = (gap: number) => ({ display: 'grid', gap });

const PAIR = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: SPACE.md,
} as const;

const CmInput = ({
  label,
  value,
  placeholder = '0',
  isLarge = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  isLarge?: boolean;
  onChange: (value: string) => void;
}) => (
  <TextInput
    label={label}
    inputMode="decimal"
    isLarge={isLarge}
    suffix="см"
    placeholder={placeholder}
    value={value}
    onChange={onChange}
  />
);

const RemoveButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => (
  <Button label={label} onClick={onClick}>
    ×
  </Button>
);

type SizeId =
  'width' | 'height' | 'left' | 'right' | 'center' | 'side' | 'rise';

// One number of the outline, typed on the pad on «Новый замер».
export type ShapeSize = {
  id: SizeId;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
};

// The order the pad's «Далее» walks them in.
const SIZE_ORDER: Record<ShapeKind, SizeId[]> = {
  RECTANGLE: ['width', 'height'],
  SLOPE: ['width', 'left', 'right', 'center'],
  ARCH: ['width', 'side', 'rise'],
  STEP: ['width', 'left', 'right'],
  CUSTOM: ['width'],
};

type ShapeSizeInput = {
  shape: ShapeDraft;
  widthCm: string;
  heightCm: string;
  onShapeChange: (shape: ShapeDraft) => void;
  onWidthChange: (widthCm: string) => void;
  onHeightChange: (heightCm: string) => void;
};

const sizesById = ({
  shape,
  widthCm,
  heightCm,
  onShapeChange,
  onWidthChange,
  onHeightChange,
}: ShapeSizeInput): Record<SizeId, ShapeSize> => {
  const update = (changes: Partial<ShapeDraft>) =>
    onShapeChange({ ...shape, ...changes });
  const size = (
    id: SizeId,
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder = '0',
  ): ShapeSize => ({ id, label, placeholder, value, onChange });

  return {
    width: size('width', 'Ширина', widthCm, onWidthChange),
    height: size('height', 'Высота', heightCm, onHeightChange),
    left: size('left', 'Высота слева', shape.leftCm, (leftCm) =>
      update({ leftCm }),
    ),
    right: size('right', 'Высота справа', shape.rightCm, (rightCm) =>
      update({ rightCm }),
    ),
    center: size(
      'center',
      'По центру, если есть',
      shape.centerCm,
      (centerCm) => update({ centerCm }),
      'нет',
    ),
    side: size('side', 'Высота боковин', shape.sideCm, (sideCm) =>
      update({ sideCm }),
    ),
    rise: size('rise', 'Стрела арки', shape.riseCm, (riseCm) =>
      update({ riseCm }),
    ),
  };
};

export const shapeSizes = (input: ShapeSizeInput): ShapeSize[] => {
  const byId = sizesById(input);

  return SIZE_ORDER[input.shape.kind].map((id) => byId[id]);
};

const PointRow = ({
  title,
  point,
  canRemove,
  onChange,
  onRemove,
}: {
  title: string;
  point: PointDraft;
  canRemove: boolean;
  onChange: (changes: Partial<PointDraft>) => void;
  onRemove: () => void;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '28px minmax(0, 1fr) minmax(0, 1fr) 48px',
        gap: SPACE.sm,
        alignItems: 'center',
      }}
    >
      <span style={{ ...TYPE.rowTitle, color: colors.accent }}>{title}</span>
      <CmInput
        label={`${title}, от левого края`}
        placeholder="от края"
        value={point.xCm}
        onChange={(xCm) => onChange({ xCm })}
      />
      <CmInput
        label={`${title}, высота`}
        placeholder="высота"
        value={point.heightCm}
        onChange={(heightCm) => onChange({ heightCm })}
      />
      {canRemove ? (
        <RemoveButton label={`Убрать ${title}`} onClick={onRemove} />
      ) : (
        <span />
      )}
    </div>
  );
};

// Everything the measurer types for one проём's outline: the «Форма» chips
// and the sizes that chip asks for. Width and height stay on the opening
// itself, so a rectangle saves exactly as it did before shapes.
export const ShapeFields = ({
  shape,
  widthCm,
  heightCm,
  nextKey,
  liveErrors,
  onShapeChange,
  onWidthChange,
  onHeightChange,
  renderSize,
}: ShapeSizeInput & {
  nextKey: () => string;
  liveErrors: string[];
  // Draws the outline's numbers as pad fields; without it they are inputs
  renderSize?: (size: ShapeSize) => ReactNode;
}) => {
  const colors = usePalette();
  const update = (changes: Partial<ShapeDraft>) =>
    onShapeChange({ ...shape, ...changes });
  const updateListItem = <TItem extends { key: string }>(
    items: TItem[],
    key: string,
    changes: Partial<TItem>,
  ) => items.map((item) => (item.key === key ? { ...item, ...changes } : item));

  const byId = sizesById({
    shape,
    widthCm,
    heightCm,
    onShapeChange,
    onWidthChange,
    onHeightChange,
  });
  const sizeField = (id: SizeId) => {
    const size = byId[id];

    return renderSize ? (
      renderSize(size)
    ) : (
      <Field label={size.label}>
        <CmInput
          label={`${size.label}, см`}
          isLarge={id === 'width' || id === 'height'}
          placeholder={size.placeholder}
          value={size.value}
          onChange={size.onChange}
        />
      </Field>
    );
  };
  const widthField = sizeField('width');
  const heightPair = (
    <>
      {sizeField('left')}
      {sizeField('right')}
    </>
  );

  const fieldsByKind: Record<ShapeKind, () => ReactNode> = {
    RECTANGLE: () => (
      <div style={PAIR}>
        {widthField}
        {sizeField('height')}
      </div>
    ),
    SLOPE: () => (
      <>
        <div style={PAIR}>
          {widthField}
          {sizeField('center')}
          {heightPair}
        </div>
        {shape.slopePoints.length > 0 && (
          <div style={column(SPACE.sm)}>
            <FieldLabel>
              Ещё высоты: от левого края и высота в этом месте
            </FieldLabel>
            {shape.slopePoints.map((point, index) => (
              <PointRow
                key={point.key}
                title={`${index + 1}`}
                point={point}
                canRemove
                onChange={(changes) =>
                  update({
                    slopePoints: updateListItem(
                      shape.slopePoints,
                      point.key,
                      changes,
                    ),
                  })
                }
                onRemove={() =>
                  update({
                    slopePoints: shape.slopePoints.filter(
                      (other) => other.key !== point.key,
                    ),
                  })
                }
              />
            ))}
          </div>
        )}
        <div>
          <Button
            onClick={() =>
              update({
                slopePoints: [
                  ...shape.slopePoints,
                  { key: nextKey(), xCm: '', heightCm: '' },
                ],
              })
            }
          >
            + Точка замера
          </Button>
        </div>
      </>
    ),
    ARCH: () => (
      <>
        <div style={PAIR}>
          {widthField}
          {sizeField('side')}
          {sizeField('rise')}
        </div>
        <span style={{ ...TYPE.label, color: colors.muted }}>
          Боковины 0, если арка стоит прямо на подоконнике. Стрела: от линии
          боковин до верха арки.
        </span>
      </>
    ),
    STEP: () => (
      <>
        <div style={PAIR}>
          {widthField}
          <span />
          {heightPair}
        </div>
        <div style={column(SPACE.md)}>
          {shape.steps.map((step, index) => {
            const isLast = index === shape.steps.length - 1;
            const stepLabel =
              shape.steps.length === 1 ? 'Ступень' : `Ступень ${index + 1}`;

            return (
              <div
                key={step.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 48px',
                  gap: SPACE.md,
                  alignItems: 'end',
                }}
              >
                <Field label={`${stepLabel} от левого края`}>
                  <CmInput
                    label={`${stepLabel} от левого края, см`}
                    value={step.xCm}
                    onChange={(xCm) =>
                      update({
                        steps: updateListItem(shape.steps, step.key, { xCm }),
                      })
                    }
                  />
                </Field>
                {isLast ? (
                  <span
                    style={{
                      ...TYPE.label,
                      color: colors.muted,
                      paddingBottom: SPACE.md,
                    }}
                  >
                    дальше высота справа
                  </span>
                ) : (
                  <Field label="Высота после неё">
                    <CmInput
                      label={`Высота после ступени ${index + 1}, см`}
                      value={step.heightCm}
                      onChange={(stepHeightCm) =>
                        update({
                          steps: updateListItem(shape.steps, step.key, {
                            heightCm: stepHeightCm,
                          }),
                        })
                      }
                    />
                  </Field>
                )}
                {shape.steps.length > 1 ? (
                  <RemoveButton
                    label={`Убрать ступень ${index + 1}`}
                    onClick={() =>
                      update({
                        steps: shape.steps.filter(
                          (other) => other.key !== step.key,
                        ),
                      })
                    }
                  />
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
        <div>
          <Button
            onClick={() =>
              update({
                steps: [
                  ...shape.steps,
                  { key: nextKey(), xCm: '', heightCm: '' },
                ],
              })
            }
          >
            + Ступень
          </Button>
        </div>
      </>
    ),
    CUSTOM: () => {
      const updatePoint = (key: string, changes: Partial<CustomPointDraft>) =>
        update({ points: updateListItem(shape.points, key, changes) });

      return (
        <>
          <div style={PAIR}>{widthField}</div>
          <div style={column(SPACE.sm)}>
            <FieldLabel>
              Точки слева направо: от левого края и высота в этом месте
            </FieldLabel>
            {shape.points.map((point, index) => {
              const letter = pointLetter(index);
              const isLast = index === shape.points.length - 1;

              return (
                <div key={point.key} style={column(SPACE.sm)}>
                  <PointRow
                    title={letter}
                    point={point}
                    canRemove={shape.points.length > 2}
                    onChange={(changes) => updatePoint(point.key, changes)}
                    onRemove={() =>
                      update({
                        points: shape.points.filter(
                          (other) => other.key !== point.key,
                        ),
                      })
                    }
                  />
                  {!isLast && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: SPACE.sm,
                        paddingLeft: 36,
                      }}
                    >
                      <span style={{ ...TYPE.label, color: colors.muted }}>
                        {letter} → {pointLetter(index + 1)}
                      </span>
                      <Segmented
                        label={`${letter} → ${pointLetter(index + 1)}`}
                        value={point.isArcToNext ? 'ARC' : 'LINE'}
                        options={[
                          { value: 'LINE', label: 'Прямо' },
                          { value: 'ARC', label: 'Дуга' },
                        ]}
                        onChange={(answer) =>
                          updatePoint(point.key, {
                            isArcToNext: answer === 'ARC',
                          })
                        }
                      />
                      {point.isArcToNext && (
                        <div style={{ width: 150 }}>
                          <CmInput
                            label={`Стрела дуги ${letter} → ${pointLetter(index + 1)}, см`}
                            placeholder="стрела"
                            value={point.arcRiseCm}
                            onChange={(arcRiseCm) =>
                              updatePoint(point.key, { arcRiseCm })
                            }
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div>
            <Button
              onClick={() =>
                update({
                  points: [
                    ...shape.points,
                    {
                      key: nextKey(),
                      xCm: '',
                      heightCm: '',
                      isArcToNext: false,
                      arcRiseCm: '',
                    },
                  ],
                })
              }
            >
              + Точка замера
            </Button>
          </div>
        </>
      );
    },
  };

  return (
    <div style={column(SPACE.md)}>
      <div style={column(SPACE.sm)}>
        <FieldLabel>Форма</FieldLabel>
        <Segmented
          label="Форма"
          value={shape.kind}
          options={SHAPE_KIND_OPTIONS}
          onChange={(kind) => update({ kind })}
        />
      </div>
      {fieldsByKind[shape.kind]()}
      {liveErrors.map((error) => (
        <span key={error} role="alert" style={{ color: colors.danger }}>
          {error}
        </span>
      ))}
    </div>
  );
};
