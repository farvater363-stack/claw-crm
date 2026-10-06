import { Fragment, useEffect, useRef, useState } from 'react';
import { CoreApiClient, type CoreSchema } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { defineFrontComponent } from 'twenty-sdk/define';
import { uploadFile } from 'twenty-sdk/front-component';

import {
  EXTRA_SERVICE_UNIT_OPTIONS,
  materialUnitLabel,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { materialUnitPrice } from 'src/prices/material-cost';
import {
  buildKindName,
  type BuildPriceSectionsInput,
  buildPriceSections,
  type CompositionLine,
  type GrilleKind,
  parseOptionalMoney,
  parsePositiveNumber,
  type PriceRow,
  type PriceSections,
  removeKindQuestion,
  UNIT_TEXT,
} from 'src/prices/prices-screen';
import { fromCurrency, toCurrency } from 'src/recalc/money';
import { formatMoney, formatQuantity, formatWhole } from 'src/ui/format';
import {
  Button,
  Columns,
  ErrorNote,
  Field,
  FilePicker,
  Group,
  Hint,
  InlineConfirm,
  Line,
  PhotoTile,
  Row,
  Screen,
  Section,
  SelectInput,
  SkeletonRows,
  StatePill,
  StaticRow,
  TextInput,
  Thumbnail,
  UndoBar,
  Wrap,
} from 'src/ui/kit';
import { SPACE } from 'src/ui/tokens';
import { dropKey } from 'src/utils/drop-key';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';
import { isAccessError } from 'src/utils/is-access-error';

type Photo = { fileId: string; label: string; url: string | null };

type PricesData = {
  sections: PriceSections;
  materials: { id: string; name: string; unitLabel: string }[];
  // The owner's list for «Вид решётки для цеха», by name
  kinds: GrilleKind[];
  // What the sections are built from: an edit changes it and the rows, their
  // price text and their warnings are rebuilt
  source: BuildPriceSectionsInput;
  photosById: Map<string, Photo[]>;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: PricesData };

type ParseResult<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; error: string };

// Twenty caps a page at 200 records.
const PAGE_SIZE = 200;
const SAVED_TICK_MS = 2_000;
const UNDO_MS = 10_000;
const PHOTO_SIZE = 96;
const MONEY = { amountMicros: true } as const;
const PHOTO = { fileId: true, label: true, url: true } as const;

const SECTIONS = [
  {
    key: 'grilles',
    title: 'Решётки',
    addText: '+ Добавить решётку',
    newName: 'Новая решётка',
    service: null,
  },
  {
    key: 'visors',
    title: 'Козырьки',
    addText: '+ Добавить козырёк',
    newName: 'Новый козырёк',
    service: { kind: 'VISOR', unit: 'PER_RUNNING_METER' },
  },
  {
    key: 'services',
    title: 'Услуги',
    addText: '+ Добавить услугу',
    newName: 'Новая услуга',
    service: { kind: 'SERVICE', unit: 'FIXED' },
  },
] as const;

// The select's entry that opens a field for a kind of one's own
const OWN_KIND = '__own__';

const UNIT_OPTIONS = EXTRA_SERVICE_UNIT_OPTIONS.map(({ value }) => ({
  value,
  label: UNIT_TEXT[value],
}));

const moneyText = (value: number | null) =>
  value === null ? '' : formatWhole(value);

const toPhotos = (
  photos: (Partial<Photo> | undefined)[] | undefined,
): Photo[] =>
  (photos ?? []).flatMap((photo) =>
    photo?.fileId
      ? [
          {
            fileId: photo.fileId,
            label: photo.label ?? '',
            url: photo.url ?? null,
          },
        ]
      : [],
  );

// Purchase prices are the owner's: any other role gets null and sees no cost.
const loadMaterialPrices = async (client: CoreApiClient) => {
  try {
    const nodes = await fetchAllPages(async (after) => {
      const { materials } = await client.query({
        materials: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: { id: true, averagePrice: MONEY, lastPurchasePrice: MONEY },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return materials;
    });

    return new Map(
      nodes.map((node) => [
        node.id,
        materialUnitPrice({
          averagePrice: fromCurrency(node.averagePrice),
          lastPurchasePrice: fromCurrency(node.lastPurchasePrice),
        }),
      ]),
    );
  } catch (error) {
    if (!isAccessError(error)) throw error;

    return null;
  }
};

const sortKinds = (kinds: GrilleKind[]): GrilleKind[] =>
  [...kinds].sort((left, right) => left.name.localeCompare(right.name, 'ru'));

const loadPricesData = async (client: CoreApiClient): Promise<PricesData> => {
  const designNodes = await fetchAllPages(async (after) => {
    const { designs } = await client.query({
      designs: {
        __args: { first: PAGE_SIZE, after },
        edges: {
          node: {
            id: true,
            name: true,
            metal: true,
            grilleKindId: true,
            pricePerSquareMeter: MONEY,
            photos: PHOTO,
          },
        },
        pageInfo: PAGE_INFO,
      },
    });

    return designs;
  });
  const serviceNodes = await fetchAllPages(async (after) => {
    const { extraServices } = await client.query({
      extraServices: {
        __args: { first: PAGE_SIZE, after },
        edges: {
          node: { id: true, name: true, kind: true, unit: true, price: MONEY },
        },
        pageInfo: PAGE_INFO,
      },
    });

    return extraServices;
  });
  const normNodes = await fetchAllPages(async (after) => {
    const { materialNorms } = await client.query({
      materialNorms: {
        __args: { first: PAGE_SIZE, after },
        edges: {
          node: {
            id: true,
            designId: true,
            extraServiceId: true,
            materialId: true,
            quantityPerUnit: true,
          },
        },
        pageInfo: PAGE_INFO,
      },
    });

    return materialNorms;
  });
  const materialNodes = await fetchAllPages(async (after) => {
    const { materials } = await client.query({
      materials: {
        __args: { first: PAGE_SIZE, after },
        edges: { node: { id: true, name: true, unit: true } },
        pageInfo: PAGE_INFO,
      },
    });

    return materials;
  });

  const kindNodes = await fetchAllPages(async (after) => {
    const { grilleKinds } = await client.query({
      grilleKinds: {
        __args: { first: PAGE_SIZE, after },
        edges: { node: { id: true, name: true } },
        pageInfo: PAGE_INFO,
      },
    });

    return grilleKinds;
  });
  const prices = await loadMaterialPrices(client);
  const materials = materialNodes
    .map((node) => ({
      id: node.id,
      name: node.name ?? '',
      unitLabel: materialUnitLabel(node.unit),
      unitPrice: prices?.get(node.id) ?? null,
    }))
    .sort((left, right) =>
      left.name.localeCompare(right.name, 'ru', { numeric: true }),
    );
  const photosById = new Map(
    designNodes.map((node) => [node.id, toPhotos(node.photos)]),
  );
  const source: BuildPriceSectionsInput = {
    grilles: designNodes.map((node) => ({
      id: node.id,
      name: node.name ?? null,
      metal: node.metal ?? null,
      kindId: node.grilleKindId ?? null,
      price: fromCurrency(node.pricePerSquareMeter),
      photoUrl: photosById.get(node.id)?.[0]?.url ?? null,
    })),
    services: serviceNodes.map((node) => ({
      id: node.id,
      name: node.name ?? null,
      kind: node.kind ?? null,
      unit: node.unit ?? null,
      price: fromCurrency(node.price),
    })),
    norms: normNodes.map((node) => ({
      id: node.id,
      designId: node.designId ?? null,
      extraServiceId: node.extraServiceId ?? null,
      materialId: node.materialId ?? null,
      quantityPerUnit: node.quantityPerUnit ?? null,
    })),
    materials,
    canSeeCosts: prices !== null,
  };

  return {
    sections: buildPriceSections(source),
    materials,
    kinds: sortKinds(
      kindNodes.map((node) => ({ id: node.id, name: node.name ?? '' })),
    ),
    source,
    photosById,
  };
};

// uploadFile needs this workspace's id for design.photos, which differs from
// the universalIdentifier the app declares.
const fetchPhotosFieldMetadataId = async (): Promise<string> => {
  const { objects } = await new MetadataApiClient().query({
    objects: {
      __args: {
        paging: { first: 1 },
        filter: { universalIdentifier: { eq: IDS.design.object } },
      },
      edges: { node: { fieldsList: { id: true, universalIdentifier: true } } },
    },
  });
  const fieldMetadataId = objects.edges[0]?.node.fieldsList?.find(
    (field) => field.universalIdentifier === IDS.design.photos,
  )?.id;

  if (!fieldMetadataId) throw new Error('design.photos field not found');

  return fieldMetadataId;
};

const loadState = async (): Promise<LoadState> => {
  try {
    return { status: 'ready', data: await loadPricesData(new CoreApiClient()) };
  } catch (error) {
    console.error(error);

    return {
      status: 'error',
      message:
        'Не удалось загрузить цены. Проверьте интернет и нажмите "Повторить"',
    };
  }
};

const updateRow = (
  row: PriceRow,
  grilleData: CoreSchema.DesignUpdateInput,
  serviceData: CoreSchema.ExtraServiceUpdateInput,
) =>
  row.section === 'GRILLE'
    ? new CoreApiClient().mutation({
        updateDesign: { __args: { id: row.id, data: grilleData }, id: true },
      })
    : new CoreApiClient().mutation({
        updateExtraService: {
          __args: { id: row.id, data: serviceData },
          id: true,
        },
      });

const Prices = () => {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [newLine, setNewLine] = useState<{
    materialId: string;
    quantity: string;
  } | null>(null);
  const [newRowId, setNewRowId] = useState<string | null>(null);
  // The grille whose kind is being typed in instead of picked
  const [ownKindId, setOwnKindId] = useState<string | null>(null);
  const [isEditingKinds, setIsEditingKinds] = useState(false);
  const [busyKeys, setBusyKeys] = useState<string[]>([]);
  const [failures, setFailures] = useState<
    Record<string, { scope: string; retry: () => void }>
  >({});
  const [removed, setRemoved] = useState<Pick<
    PriceRow,
    'id' | 'section'
  > | null>(null);
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    void loadState().then(setLoad);
  }, []);

  const patchData = (update: (data: PricesData) => Partial<PricesData>) =>
    setLoad((current) => {
      if (current.status !== 'ready') return current;

      const data = { ...current.data, ...update(current.data) };

      return {
        status: 'ready',
        data: { ...data, sections: buildPriceSections(data.source) },
      };
    });

  const patchRow = (
    row: PriceRow,
    changes: Partial<
      Pick<PriceRow, 'name' | 'price' | 'metal' | 'kindId' | 'unit' | 'photoUrl'>
    >,
  ) =>
    patchData(({ source }) => ({
      source:
        row.section === 'GRILLE'
          ? {
              ...source,
              grilles: source.grilles.map((grille) =>
                grille.id === row.id ? { ...grille, ...changes } : grille,
              ),
            }
          : {
              ...source,
              services: source.services.map((service) =>
                service.id === row.id ? { ...service, ...changes } : service,
              ),
            },
    }));

  const patchNorms = (
    update: (
      norms: BuildPriceSectionsInput['norms'],
    ) => BuildPriceSectionsInput['norms'],
  ) =>
    patchData(({ source }) => ({
      source: { ...source, norms: update(source.norms) },
    }));

  const setDraft = (key: string, value: string) =>
    setDrafts((current) => ({ ...current, [key]: value }));

  const showSaved = (key: string) => {
    setSavedKey(key);
    setTimeout(
      () => setSavedKey((current) => (current === key ? null : current)),
      SAVED_TICK_MS,
    );
  };

  const showRow = (rowId: string | null) => {
    setOpenId(rowId);
    setDrafts({});
    setErrors({});
    setConfirmKey(null);
    setNewLine(null);
    setOwnKindId(null);
    setIsEditingKinds(false);
  };

  // `scope` is where a failure is shown and `key` names the action: a failure
  // stays until that same action is run again, whatever else is saved in
  // between. `flightKey` keeps an identical request (Enter, then the blur
  // that follows) from being sent twice.
  const run = async (
    scope: string,
    key: string,
    action: () => Promise<void>,
    flightKey = key,
  ) => {
    if (inFlight.current.has(flightKey)) return;

    inFlight.current.add(flightKey);
    setBusyKeys([...inFlight.current]);
    setFailures((current) => dropKey(current, key));

    try {
      await action();
    } catch (error) {
      console.error(error);
      setFailures((current) => ({
        ...current,
        [key]: { scope, retry: () => void run(scope, key, action, flightKey) },
      }));
    } finally {
      inFlight.current.delete(flightKey);
      setBusyKeys([...inFlight.current]);
    }
  };

  const failureNotes = (scope: string) =>
    Object.entries(failures).flatMap(([key, failure]) =>
      failure.scope === scope
        ? [
            <ErrorNote
              key={key}
              text={
                'Не удалось сохранить. Проверьте интернет и нажмите "Повторить"'
              }
              onRetry={failure.retry}
            />,
          ]
        : [],
    );

  const commit = <TValue,>(
    row: PriceRow,
    field: string,
    saved: TValue,
    parse: (draft: string) => ParseResult<TValue>,
    save: (value: TValue) => Promise<void>,
  ) => {
    const key = `${row.id}:${field}`;
    const draft = drafts[key];

    // TextInput commits on every blur, typed in or not.
    if (draft === undefined) return;

    const parsed = parse(draft);

    if (!parsed.ok) {
      setErrors((current) => ({ ...current, [key]: parsed.error }));

      return;
    }

    setErrors((current) => dropKey(current, key));

    if (parsed.value === saved) {
      setDrafts((current) => dropKey(current, key));
      // Typing the saved value back withdraws a change that failed to save.
      setFailures((current) => dropKey(current, key));

      return;
    }

    void run(
      row.id,
      key,
      async () => {
        await save(parsed.value);
        setDrafts((current) =>
          current[key] === draft ? dropKey(current, key) : current,
        );
        showSaved(key);
      },
      `${key}=${parsed.value}`,
    );
  };

  const addRow = (section: (typeof SECTIONS)[number]) =>
    void run(section.key, `add:${section.key}`, async () => {
      const client = new CoreApiClient();
      const created =
        section.service === null
          ? (
              await client.mutation({
                createDesign: {
                  __args: { data: { name: section.newName } },
                  id: true,
                },
              })
            ).createDesign
          : (
              await client.mutation({
                createExtraService: {
                  __args: {
                    data: { name: section.newName, ...section.service },
                  },
                  id: true,
                },
              })
            ).createExtraService;

      if (!created) throw new Error('the created row was not returned');

      setLoad(await loadState());
      setNewRowId(created.id);
      showRow(created.id);
    });

  // The question closes as soon as it is answered: if the delete is refused,
  // the row is back as it was, with the failure note under it.
  const removeRow = (row: PriceRow) => {
    setConfirmKey(null);
    void run(row.id, `remove:${row.id}`, async () => {
      const entry = { id: row.id, section: row.section };

      await (row.section === 'GRILLE'
        ? new CoreApiClient().mutation({
            deleteDesign: { __args: { id: row.id }, id: true },
          })
        : new CoreApiClient().mutation({
            deleteExtraService: { __args: { id: row.id }, id: true },
          }));
      patchData(({ source }) => ({
        source: {
          ...source,
          grilles: source.grilles.filter((grille) => grille.id !== row.id),
          services: source.services.filter((service) => service.id !== row.id),
        },
      }));
      showRow(null);
      setRemoved(entry);
      setTimeout(
        () => setRemoved((current) => (current === entry ? null : current)),
        UNDO_MS,
      );
    });
  };

  const restoreRow = (entry: Pick<PriceRow, 'id' | 'section'>) =>
    void run('undo', `restore:${entry.id}`, async () => {
      await (entry.section === 'GRILLE'
        ? new CoreApiClient().mutation({
            restoreDesign: { __args: { id: entry.id }, id: true },
          })
        : new CoreApiClient().mutation({
            restoreExtraService: { __args: { id: entry.id }, id: true },
          }));
      setRemoved(null);
      setLoad(await loadState());
    });

  const addPhotos = (row: PriceRow, current: Photo[], files: File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/'));

    if (images.length === 0) return;

    void run(row.id, `${row.id}:photos`, async () => {
      const fieldMetadataId = await fetchPhotosFieldMetadataId();
      const uploaded: { fileId: string; label: string }[] = [];

      for (const image of images) {
        const result = await uploadFile(image, {
          fieldMetadataId,
          fileName: image.name,
        });

        if (result.status !== 'uploaded') throw new Error(result.reason);

        uploaded.push({ fileId: result.file.fileId, label: image.name });
      }

      // The field takes the whole list: a photo left out of it is removed.
      const { updateDesign } = await new CoreApiClient().mutation({
        updateDesign: {
          __args: {
            id: row.id,
            data: {
              photos: [
                ...current.map(({ fileId, label }) => ({ fileId, label })),
                ...uploaded,
              ],
            },
          },
          photos: PHOTO,
        },
      });
      const photos = toPhotos(updateDesign?.photos);

      patchData((data) => ({
        photosById: new Map(data.photosById).set(row.id, photos),
      }));
      patchRow(row, { photoUrl: photos[0]?.url ?? null });
    });
  };

  const moneyField = (
    row: PriceRow,
    field: string,
    label: string,
    saved: number | null,
    suffix: string,
    save: (value: number | null) => Promise<void>,
  ) => {
    const key = `${row.id}:${field}`;

    return (
      <Field label={label} error={errors[key]} isSaved={savedKey === key}>
        <TextInput
          inputMode="numeric"
          isMoney
          value={drafts[key] ?? moneyText(saved)}
          suffix={suffix}
          onChange={(value) => setDraft(key, value)}
          onCommit={() => commit(row, field, saved, parseOptionalMoney, save)}
        />
      </Field>
    );
  };

  const renderComposition = (row: PriceRow, data: PricesData) => {
    const newKey = `${row.id}:newLine`;
    const owner =
      row.section === 'GRILLE'
        ? { designId: row.id }
        : { extraServiceId: row.id };
    const available = data.materials.filter(
      (material) =>
        !row.composition.some((line) => line.materialId === material.id),
    );
    const material =
      available.find((candidate) => candidate.id === newLine?.materialId) ??
      available[0];

    const addLine = (materialId: string) => {
      if (newLine === null) {
        setNewLine({ materialId, quantity: '' });

        return;
      }

      const parsed = parsePositiveNumber(newLine.quantity);

      if (!parsed.ok) {
        setErrors((current) => ({ ...current, [newKey]: parsed.error }));

        return;
      }

      void run(row.id, newKey, async () => {
        // No name is sent: the server writes the line's name itself.
        const { createMaterialNorm } = await new CoreApiClient().mutation({
          createMaterialNorm: {
            __args: {
              data: { materialId, quantityPerUnit: parsed.value, ...owner },
            },
            id: true,
          },
        });

        if (!createMaterialNorm) throw new Error('the line was not returned');

        patchNorms((norms) => [
          ...norms,
          {
            id: createMaterialNorm.id,
            designId: null,
            extraServiceId: null,
            ...owner,
            materialId,
            quantityPerUnit: parsed.value,
          },
        ]);
        closeNewLine();
      });
    };

    const removeLine = (line: CompositionLine) => {
      setConfirmKey(null);
      void run(row.id, `remove:${line.normId}`, async () => {
        await new CoreApiClient().mutation({
          deleteMaterialNorm: { __args: { id: line.normId }, id: true },
        });
        patchNorms((norms) => norms.filter((norm) => norm.id !== line.normId));
      });
    };

    const closeNewLine = () => {
      setNewLine(null);
      setErrors((current) => dropKey(current, newKey));
      setFailures((current) => dropKey(current, newKey));
    };

    const quantityField = (line: CompositionLine) => {
      const key = `${row.id}:${line.normId}`;

      return (
        <Field
          isInline
          label={line.materialName}
          error={errors[key]}
          isSaved={savedKey === key}
        >
          <TextInput
            inputMode="decimal"
            value={drafts[key] ?? String(line.quantity).replace('.', ',')}
            suffix={line.unitLabel}
            onChange={(value) => setDraft(key, value)}
            onCommit={() =>
              commit(
                row,
                line.normId,
                line.quantity,
                parsePositiveNumber,
                async (quantityPerUnit) => {
                  await new CoreApiClient().mutation({
                    updateMaterialNorm: {
                      __args: { id: line.normId, data: { quantityPerUnit } },
                      id: true,
                    },
                  });
                  patchNorms((norms) =>
                    norms.map((norm) =>
                      norm.id === line.normId
                        ? { ...norm, quantityPerUnit }
                        : norm,
                    ),
                  );
                },
              )
            }
          />
        </Field>
      );
    };

    return (
      <Group
        title={`Материалы на 1 ${UNIT_TEXT[row.unit].replace('за ', '')}`}
      >
        {row.composition.map((line) =>
          confirmKey === line.normId ? (
            <InlineConfirm
              key={line.normId}
              question={`Убрать "${line.materialName}" из состава?`}
              confirmText="Убрать"
              cancelText="Оставить"
              onConfirm={() => removeLine(line)}
              onCancel={() => setConfirmKey(null)}
            />
          ) : (
            <Line
              key={line.normId}
              action={
                <Button
                  label={`Убрать "${line.materialName}" из состава`}
                  onClick={() => setConfirmKey(line.normId)}
                >
                  ×
                </Button>
              }
            >
              {quantityField(line)}
              {line.lineCost === null || line.unitPrice === null ? null : (
                <Hint
                  text={`${formatQuantity(line.quantity, line.unitLabel)} × ${formatMoney(line.unitPrice)} = ${formatMoney(line.lineCost)}`}
                />
              )}
              {data.source.canSeeCosts && line.unitPrice === null ? (
                <Hint
                  tone="warning"
                  text="Нет цены закупки: запишите закупку в «Складе»"
                />
              ) : null}
            </Line>
          ),
        )}
        {row.costText === null ? null : (
          <Hint
            text={`${row.costText} ${UNIT_TEXT[row.unit]}. Считается по закупкам в «Складе»`}
          />
        )}
        {material === undefined ? (
          <Hint
            text={
              data.materials.length === 0
                ? 'Сначала добавьте материалы в «Склад»'
                : 'Все материалы уже в составе'
            }
          />
        ) : (
          <>
            {newLine === null ? null : (
              <Columns>
                <Field label="Материал">
                  <SelectInput
                    value={material.id}
                    options={available.map(({ id, name }) => ({
                      value: id,
                      label: name,
                    }))}
                    onChange={(materialId) =>
                      setNewLine({ ...newLine, materialId })
                    }
                  />
                </Field>
                <Field label="Сколько" error={errors[newKey]}>
                  {/* No onCommit: leaving the amount for the material select
                      must not save the line. */}
                  <TextInput
                    inputMode="decimal"
                    value={newLine.quantity}
                    suffix={material.unitLabel}
                    onChange={(quantity) => {
                      setNewLine({ ...newLine, quantity });
                      setErrors((current) => dropKey(current, newKey));
                    }}
                    onEnter={() => addLine(material.id)}
                    onCancel={closeNewLine}
                  />
                </Field>
              </Columns>
            )}
            <Wrap>
              <Button
                isBusy={busyKeys.includes(newKey)}
                onClick={() => addLine(material.id)}
              >
                + Добавить материал
              </Button>
              {newLine === null ? null : (
                <Button variant="link" onClick={closeNewLine}>
                  Отмена
                </Button>
              )}
            </Wrap>
          </>
        )}
      </Group>
    );
  };

  const renderOpenRow = (row: PriceRow, data: PricesData) => {
    const nameKey = `${row.id}:name`;
    const choiceKey = `${row.id}:choice`;
    const photosKey = `${row.id}:photos`;
    const photos = data.photosById.get(row.id) ?? [];
    const savePrice = async (value: number | null) => {
      const amount = toCurrency(value);

      await updateRow(row, { pricePerSquareMeter: amount }, { price: amount });
      patchRow(row, { price: value });
    };
    const saveChoice = (
      value: string,
      grilleData: CoreSchema.DesignUpdateInput,
      serviceData: CoreSchema.ExtraServiceUpdateInput,
      changes: Parameters<typeof patchRow>[1],
    ) =>
      void run(
        row.id,
        choiceKey,
        async () => {
          await updateRow(row, grilleData, serviceData);
          patchRow(row, changes);
          showSaved(choiceKey);
        },
        `${choiceKey}=${value}`,
      );

    const ownKindKey = `${row.id}:kind`;
    const linkKind = (kindId: string) =>
      saveChoice(kindId, { grilleKindId: kindId }, {}, { kindId });

    // A name already in the list is that kind: it is picked, not added twice.
    const addOwnKind = (raw: string) => {
      const existing = data.kinds.find(
        (kind) => kind.name.toLowerCase() === raw.trim().toLowerCase(),
      );
      const name = buildKindName(raw, existing ? [] : data.kinds);

      if (!name.ok) return;

      if (existing) {
        if (existing.id !== row.kindId) linkKind(existing.id);

        return;
      }

      void run(row.id, ownKindKey, async () => {
        const client = new CoreApiClient();
        const { createGrilleKind } = await client.mutation({
          createGrilleKind: {
            __args: { data: { name: name.value } },
            id: true,
          },
        });

        if (!createGrilleKind) throw new Error('the kind was not returned');

        patchData(({ kinds }) => ({
          kinds: sortKinds([
            ...kinds,
            { id: createGrilleKind.id, name: name.value },
          ]),
        }));
        await updateRow(row, { grilleKindId: createGrilleKind.id }, {});
        patchRow(row, { kindId: createGrilleKind.id });
        showSaved(choiceKey);
      });
    };

    const renameKind = (kind: GrilleKind) => {
      const key = `kind:${kind.id}`;
      const draft = drafts[key];

      // TextInput commits on every blur, typed in or not.
      if (draft === undefined) return;

      const name = buildKindName(draft, data.kinds, kind.id);

      if (!name.ok) {
        setErrors((current) => ({ ...current, [key]: name.error }));

        return;
      }

      setErrors((current) => dropKey(current, key));

      if (name.value === kind.name) {
        setDrafts((current) => dropKey(current, key));

        return;
      }

      void run(row.id, key, async () => {
        await new CoreApiClient().mutation({
          updateGrilleKind: {
            __args: { id: kind.id, data: { name: name.value } },
            id: true,
          },
        });
        patchData(({ kinds }) => ({
          kinds: sortKinds(
            kinds.map((other) =>
              other.id === kind.id ? { ...other, name: name.value } : other,
            ),
          ),
        }));
        setDrafts((current) =>
          current[key] === draft ? dropKey(current, key) : current,
        );
        showSaved(key);
      });
    };

    const grillesOfKind = (kind: GrilleKind) =>
      data.sections.grilles.filter((grille) => grille.kindId === kind.id);

    const removeKind = (kind: GrilleKind) => {
      setConfirmKey(null);
      void run(row.id, `removeKind:${kind.id}`, async () => {
        const client = new CoreApiClient();

        // Unlinked first: a grille must not keep pointing at a kind that is gone.
        for (const grille of grillesOfKind(kind)) {
          await client.mutation({
            updateDesign: {
              __args: { id: grille.id, data: { grilleKindId: null } },
              id: true,
            },
          });
        }

        await client.mutation({
          deleteGrilleKind: { __args: { id: kind.id }, id: true },
        });
        patchData(({ kinds, source }) => ({
          kinds: kinds.filter((other) => other.id !== kind.id),
          source: {
            ...source,
            grilles: source.grilles.map((grille) =>
              grille.kindId === kind.id ? { ...grille, kindId: null } : grille,
            ),
          },
        }));
      });
    };

    const renderKindList = () => (
      <Group title="Виды решёток">
        {data.kinds.length === 0 ? (
          <Hint text="Пока пусто. Выберите «Свой вариант…» выше, чтобы добавить первый вид" />
        ) : null}
        {data.kinds.map((kind) => {
          const key = `kind:${kind.id}`;

          return confirmKey === key ? (
            <InlineConfirm
              key={kind.id}
              question={removeKindQuestion(
                kind.name,
                grillesOfKind(kind).length,
              )}
              confirmText="Убрать"
              cancelText="Оставить"
              onConfirm={() => removeKind(kind)}
              onCancel={() => setConfirmKey(null)}
            />
          ) : (
            <Line
              key={kind.id}
              action={
                <Button
                  label={`Убрать вид "${kind.name}"`}
                  onClick={() => setConfirmKey(key)}
                >
                  ×
                </Button>
              }
            >
              <Field
                isInline
                label={`Вид "${kind.name}"`}
                error={errors[key]}
                isSaved={savedKey === key}
              >
                <TextInput
                  value={drafts[key] ?? kind.name}
                  onChange={(value) => setDraft(key, value)}
                  onCommit={() => renameKind(kind)}
                />
              </Field>
            </Line>
          );
        })}
        <Wrap>
          <Button variant="link" onClick={() => setIsEditingKinds(false)}>
            Готово
          </Button>
        </Wrap>
      </Group>
    );

    return (
      <>
        <Field
          label="Название"
          error={errors[nameKey]}
          isSaved={savedKey === nameKey}
        >
          <TextInput
            value={drafts[nameKey] ?? row.name}
            onChange={(value) => setDraft(nameKey, value)}
            onCommit={() =>
              commit(
                row,
                'name',
                row.name,
                (draft) =>
                  draft.trim() === ''
                    ? { ok: false, error: 'Введите название' }
                    : { ok: true, value: draft.trim() },
                async (name) => {
                  await updateRow(row, { name }, { name });
                  patchRow(row, { name });
                },
              )
            }
          />
        </Field>
        {row.section === 'GRILLE' ? (
          <>
            {moneyField(
              row,
              'price',
              'Цена',
              row.price,
              `сум ${UNIT_TEXT[row.unit]}`,
              savePrice,
            )}
            <Field
              label="Вид решётки для цеха"
              isSaved={savedKey === choiceKey}
            >
              <SelectInput
                value={ownKindId === row.id ? OWN_KIND : (row.kindId ?? '')}
                options={[
                  ...(row.kindId === null
                    ? [{ value: '', label: 'Не указан' }]
                    : []),
                  ...data.kinds.map((kind) => ({
                    value: kind.id,
                    label: kind.name,
                  })),
                  { value: OWN_KIND, label: 'Свой вариант…' },
                ]}
                onChange={(value) => {
                  if (value === OWN_KIND) {
                    setOwnKindId(row.id);

                    return;
                  }

                  setOwnKindId(null);
                  if (value !== '') linkKind(value);
                }}
              />
            </Field>
            {ownKindId === row.id ? (
              <Field label="Свой вид">
                <TextInput
                  value={drafts[ownKindKey] ?? ''}
                  onChange={(value) => setDraft(ownKindKey, value)}
                  onCommit={() => {
                    const typed = drafts[ownKindKey] ?? '';

                    // Left empty, the field goes away and the kind stays as it was.
                    setOwnKindId(null);
                    setDrafts((current) => dropKey(current, ownKindKey));
                    addOwnKind(typed);
                  }}
                />
              </Field>
            ) : null}
            <Hint text="Видно только на карточке заказа в «В работе». На склад и цену не влияет" />
            {isEditingKinds ? (
              renderKindList()
            ) : (
              <Wrap>
                <Button variant="link" onClick={() => setIsEditingKinds(true)}>
                  Изменить список видов
                </Button>
              </Wrap>
            )}
            <Group title="Фото">
              <Wrap>
                {photos.map((photo, index) => (
                  <Thumbnail
                    key={photo.fileId}
                    photoUrl={photo.url}
                    alt={`${row.name}, фото ${index + 1}`}
                    size={PHOTO_SIZE}
                  />
                ))}
                <FilePicker
                  text="+ Фото"
                  accept="image/*"
                  isBusy={busyKeys.includes(photosKey)}
                  onPick={(files) => addPhotos(row, photos, files)}
                />
              </Wrap>
            </Group>
          </>
        ) : (
          <Columns>
            {moneyField(row, 'price', 'Цена', row.price, 'сум', savePrice)}
            <Field label="За что" isSaved={savedKey === choiceKey}>
              <SelectInput
                value={row.unit}
                options={UNIT_OPTIONS}
                onChange={(value) => {
                  const unit = UNIT_OPTIONS.find(
                    (option) => option.value === value,
                  )?.value;

                  if (unit !== undefined) {
                    saveChoice(unit, {}, { unit }, { unit });
                  }
                }}
              />
            </Field>
          </Columns>
        )}
        {renderComposition(row, data)}
        {confirmKey === row.id ? (
          <InlineConfirm
            question={`Убрать "${row.name}"?`}
            confirmText="Убрать"
            cancelText="Оставить"
            onConfirm={() => removeRow(row)}
            onCancel={() => setConfirmKey(null)}
          />
        ) : (
          <Wrap>
            <Button variant="link" onClick={() => setConfirmKey(row.id)}>
              Убрать из прайса
            </Button>
          </Wrap>
        )}
      </>
    );
  };

  // Grilles are chosen by their look, so they are tiles. An open grille takes
  // the place of the grid: under fifteen tiles its fields would be off screen.
  const renderGrilleTiles = (data: PricesData) => {
    const grilles = [...data.sections.grilles].sort(
      (left, right) =>
        Number(left.id === newRowId) - Number(right.id === newRowId),
    );
    const open = grilles.find((row) => row.id === openId);

    return (
      <StaticRow>
        {open ? (
          <>
            <Wrap>
              <Button variant="link" onClick={() => showRow(null)}>
                <span aria-hidden>‹</span> Все решётки
              </Button>
            </Wrap>
            {renderOpenRow(open, data)}
          </>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: SPACE.md,
            }}
          >
            {grilles.map((row) => (
              <PhotoTile
                key={row.id}
                name={row.name}
                photoUrl={row.photoUrl}
                isSelected={false}
                onSelect={() => showRow(row.id)}
                caption={[row.priceText, row.costText, ...row.warnings]
                  .filter((part) => part !== null)
                  .join(' · ')}
              />
            ))}
          </div>
        )}
        {grilles.map((row) => (
          <Fragment key={row.id}>{failureNotes(row.id)}</Fragment>
        ))}
      </StaticRow>
    );
  };

  if (load.status === 'loading') {
    return (
      <Screen title="Цены">
        <SkeletonRows count={6} />
      </Screen>
    );
  }

  if (load.status === 'error') {
    return (
      <Screen title="Цены">
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

  const { data } = load;

  return (
    <Screen title="Цены">
      {SECTIONS.map((section) => (
        <Section
          key={section.key}
          title={section.title}
          footer={
            <>
              {failureNotes(section.key)}
              <Button
                isBusy={busyKeys.includes(`add:${section.key}`)}
                onClick={() => addRow(section)}
              >
                {section.addText}
              </Button>
            </>
          }
        >
          {section.key === 'grilles' ? renderGrilleTiles(data) : null}
          {/* A row just added stays next to the button that added it, not
              where its placeholder name would sort. */}
          {[...(section.key === 'grilles' ? [] : data.sections[section.key])]
            .sort(
              (left, right) =>
                Number(left.id === newRowId) - Number(right.id === newRowId),
            )
            .map((row) => (
              <Fragment key={row.id}>
                <Row
                  title={row.name}
                  value={row.priceText ?? undefined}
                  pill={
                    row.warnings.length > 0
                      ? row.warnings.map((warning) => (
                          <StatePill
                            key={warning}
                            tone="warning"
                            text={warning}
                          />
                        ))
                      : undefined
                  }
                  isOpen={openId === row.id}
                  onToggle={() => showRow(openId === row.id ? null : row.id)}
                >
                  {openId === row.id ? renderOpenRow(row, data) : null}
                </Row>
                {/* Outside the row, so a save that fails after the row was
                    closed is still seen. */}
                {failureNotes(row.id)}
              </Fragment>
            ))}
        </Section>
      ))}
      {failureNotes('undo')}
      {removed ? (
        <UndoBar text="Убрано." onUndo={() => restoreRow(removed)} />
      ) : null}
    </Screen>
  );
};

export default defineFrontComponent({
  universalIdentifier: IDS.prices.frontComponent,
  name: 'prices',
  description: 'Прайс: решётки, козырьки и услуги, их цены и состав',
  component: Prices,
});
