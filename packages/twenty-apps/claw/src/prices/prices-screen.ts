import {
  type ExtraServiceKind,
  type ExtraServiceUnit,
} from 'src/constants/select-options';
import { parseDecimalInput } from 'src/measurer-form/measurer-form';
import { computeMaterialCost } from 'src/prices/material-cost';
import { formatMoney } from 'src/ui/format';

export type PriceUnit = ExtraServiceUnit;

export type CompositionLine = {
  normId: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unitLabel: string;
  // Purchase price of one unit and of this line; null without a purchase price
  unitPrice: number | null;
  lineCost: number | null;
};

export type PriceRow = {
  id: string;
  section: 'GRILLE' | 'VISOR' | 'SERVICE';
  name: string;
  price: number | null;
  unit: PriceUnit;
  priceText: string | null;
  photoUrl: string | null;
  metal: string | null;
  // «Вид решётки для цеха»: the id of one of the owner's kinds
  kindId: string | null;
  warnings: string[];
  composition: CompositionLine[];
  // «Материал 168,900 сум · остаётся 281,100 сум»; null for a role that does
  // not see purchase prices and until a line has one
  costText: string | null;
};

export type PriceSections = {
  grilles: PriceRow[];
  visors: PriceRow[];
  services: PriceRow[];
};

export type BuildPriceSectionsInput = {
  grilles: {
    id: string;
    name: string | null;
    metal: string | null;
    kindId?: string | null;
    price: number | null;
    photoUrl: string | null;
  }[];
  services: {
    id: string;
    name: string | null;
    kind: ExtraServiceKind | null;
    unit: PriceUnit | null;
    price: number | null;
  }[];
  norms: {
    id: string;
    designId: string | null;
    extraServiceId: string | null;
    materialId: string | null;
    quantityPerUnit: number | null;
  }[];
  materials: {
    id: string;
    name: string | null;
    unitLabel: string;
    unitPrice?: number | null;
  }[];
  // Purchase prices are the owner's: without them no cost is shown or warned about
  canSeeCosts?: boolean;
};

export const UNIT_TEXT: Record<PriceUnit, string> = {
  PER_SQUARE_METER: 'за м²',
  PER_RUNNING_METER: 'за п.м.',
  PER_PIECE: 'за шт',
  FIXED: 'за заказ',
};

export type GrilleKind = { id: string; name: string };

// A kind's name as typed: not empty, and not a second kind of the same name.
export const buildKindName = (
  raw: string,
  kinds: GrilleKind[],
  ownId?: string,
): { ok: true; value: string } | { ok: false; error: string } => {
  const name = raw.trim();

  if (name === '') return { ok: false, error: 'Введите название вида' };

  return kinds.some(
    (kind) =>
      kind.id !== ownId && kind.name.toLowerCase() === name.toLowerCase(),
  )
    ? { ok: false, error: 'Такой вид уже есть' }
    : { ok: true, value: name };
};

const GRILLES_WORD: Partial<Record<Intl.LDMLPluralRule, string>> = {
  one: 'решётки',
};

// Removing a kind that grilles carry leaves them without one, so it is said first.
export const removeKindQuestion = (name: string, usedBy: number): string =>
  usedBy === 0
    ? `Убрать вид "${name}"?`
    : `Вид "${name}" стоит у ${usedBy} ${GRILLES_WORD[new Intl.PluralRules('ru').select(usedBy)] ?? 'решёток'}. У них вид станет пустым. Убрать?`;

const byName = (left: PriceRow, right: PriceRow) =>
  left.name.localeCompare(right.name, 'ru', { numeric: true });

export const buildPriceSections = ({
  grilles,
  services,
  norms,
  materials,
  canSeeCosts = false,
}: BuildPriceSectionsInput): PriceSections => {
  const materialById = new Map(
    materials.map((material) => [material.id, material]),
  );
  const hasMaterials = materials.length > 0;

  const compositionOf = (owner: 'designId' | 'extraServiceId', id: string) =>
    norms.flatMap((norm): CompositionLine[] => {
      const material =
        norm.materialId === null
          ? undefined
          : materialById.get(norm.materialId);

      if (
        norm[owner] !== id ||
        material === undefined ||
        norm.quantityPerUnit === null
      ) {
        return [];
      }

      const unitPrice = material.unitPrice ?? null;

      return [
        {
          normId: norm.id,
          materialId: material.id,
          materialName: material.name ?? '',
          quantity: norm.quantityPerUnit,
          unitLabel: material.unitLabel,
          unitPrice,
          lineCost:
            unitPrice === null
              ? null
              : Math.round(norm.quantityPerUnit * unitPrice),
        },
      ];
    });

  const toRow = (
    base: Pick<
      PriceRow,
      | 'id'
      | 'section'
      | 'name'
      | 'price'
      | 'unit'
      | 'photoUrl'
      | 'metal'
      | 'kindId'
    >,
    composition: CompositionLine[],
  ): PriceRow => {
    const { cost, isComplete } = computeMaterialCost(composition);

    return {
      ...base,
      priceText:
        base.price === null
          ? null
          : `${formatMoney(base.price)} ${UNIT_TEXT[base.unit]}`,
      composition,
      costText:
        !canSeeCosts || cost === null
          ? null
          : [
              `Материал ${formatMoney(cost)}`,
              ...(base.price === null
                ? []
                : [`остаётся ${formatMoney(base.price - cost)}`]),
            ].join(' · '),
      warnings: [
        ...(base.price === null ? ['Укажите цену'] : []),
        ...(base.section !== 'SERVICE' &&
        hasMaterials &&
        composition.length === 0
          ? ['Не указаны материалы']
          : []),
        ...(canSeeCosts && !isComplete ? ['Нет цены закупки'] : []),
      ],
    };
  };

  const serviceRows = services.map((service) =>
    toRow(
      {
        id: service.id,
        section: service.kind === 'VISOR' ? 'VISOR' : 'SERVICE',
        name: service.name ?? '',
        price: service.price,
        unit: service.unit ?? 'FIXED',
        photoUrl: null,
        metal: null,
        kindId: null,
      },
      compositionOf('extraServiceId', service.id),
    ),
  );

  return {
    grilles: grilles
      .map((grille) =>
        toRow(
          {
            id: grille.id,
            section: 'GRILLE',
            name: grille.name ?? '',
            price: grille.price,
            unit: 'PER_SQUARE_METER',
            photoUrl: grille.photoUrl,
            metal: grille.metal,
            kindId: grille.kindId ?? null,
          },
          compositionOf('designId', grille.id),
        ),
      )
      .sort(byName),
    visors: serviceRows.filter((row) => row.section === 'VISOR').sort(byName),
    services: serviceRows
      .filter((row) => row.section === 'SERVICE')
      .sort(byName),
  };
};

export const PLAIN_DECIMAL = /^\d+([.,]\d+)?$/;
// Thousands groups: one kind of separator throughout, and a first group that is not all zeros.
const WHOLE_SUM = /^(\d+|(?!0+[.,])\d{1,3}((\.\d{3})+|(,\d{3})+))$/;

export const parsePositiveNumber = (
  raw: string,
): { ok: true; value: number } | { ok: false; error: string } => {
  const trimmed = raw.trim();
  // Number() alone would also take «1e3», «0x10» and a signed value.
  const value = PLAIN_DECIMAL.test(trimmed) ? parseDecimalInput(trimmed) : null;

  return value !== null && value > 0
    ? { ok: true, value }
    : { ok: false, error: 'Введите число больше нуля' };
};

export const parseOptionalMoney = (
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: string } => {
  const compact = raw.replace(/\s/g, '');

  if (compact === '') return { ok: true, value: null };

  // A price in сум has no fraction, so a dot or a comma can only group
  // thousands; anything else is refused rather than rounded.
  const value = WHOLE_SUM.test(compact)
    ? Number(compact.replace(/[.,]/g, ''))
    : Number.NaN;

  // Digits alone can still be too many to fit a number.
  return Number.isFinite(value)
    ? { ok: true, value }
    : { ok: false, error: 'Введите цену целым числом, без минуса' };
};
