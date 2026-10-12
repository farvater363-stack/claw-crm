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
}: {
  shape: ShapeDraft;
  widthCm: string;
  heightCm: string;
  nextKey: () => string;
  liveErrors: string[];
  onShapeChange: (shape: ShapeDraft) => void;
  onWidthChange: (widthCm: string) => void;
  onHeightChange: (heightCm: string) => void;
}) => {
  const colors = usePalette();
  const update = (changes: Partial<ShapeDraft>) =>
    onShapeChange({ ...shape, ...changes });
  const updateListItem = <TItem extends { key: string }>(
    items: TItem[],
    key: string,
    changes: Partial<TItem>,
  ) => items.map((item) => (item.key === key ? { ...item, ...changes } : item));

  const widthField = (
    <Field label="Ширина">
      <CmInput
        label="Ширина, см"
        isLarge
        value={widthCm}
        onChange={onWidthChange}
      />
    </Field>
  );
  const heightPair = (
    <>
      <Field label="Высота слева">
        <CmInput
          label="Высота слева, см"
          value={shape.leftCm}
          onChange={(leftCm) => update({ leftCm })}
        />
      </Field>
      <Field label="Высота справа">
        <CmInput
          label="Высота справа, см"
          value={shape.rightCm}
          onChange={(rightCm) => update({ rightCm })}
        />
      </Field>
    </>
  );

  const fieldsByKind: Record<ShapeKind, () => ReactNode> = {
    RECTANGLE: () => (
      <div style={PAIR}>
        {widthField}
        <Field label="Высота">
          <CmInput
            label="Высота, см"
            isLarge
            value={heightCm}
            onChange={onHeightChange}
          />
        </Field>
      </div>
    ),
    SLOPE: () => (
      <>
        <div style={PAIR}>
          {widthField}
          <Field label="По центру, если есть">
            <CmInput
              label="Высота по центру, см"
              placeholder="нет"
              value={shape.centerCm}
              onChange={(centerCm) => update({ centerCm })}
            />
          </Field>
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
          <Field label="Высота боковин">
            <CmInput
              label="Высота боковин, см"
              value={shape.sideCm}
              onChange={(sideCm) => update({ sideCm })}
            />
          </Field>
          <Field label="Стрела арки">
            <CmInput
              label="Стрела арки, см"
              value={shape.riseCm}
              onChange={(riseCm) => update({ riseCm })}
            />
          </Field>
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
