import { Fragment, useEffect, useRef, useState } from 'react';
import { CoreApiClient, type CoreSchema } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { defineFrontComponent } from 'twenty-sdk/define';
import { uploadFile } from 'twenty-sdk/front-component';

import {
  EXTRA_SERVICE_UNIT_OPTIONS,
  materialUnitLabel,
  METAL_OPTIONS,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import {
  type BuildPriceSectionsInput,
  buildPriceSections,
  type CompositionLine,
  parseOptionalMoney,
  parsePositiveNumber,
  type PriceRow,
  type PriceSections,
  UNIT_TEXT,
} from 'src/prices/prices-screen';
import { fromCurrency, toCurrency } from 'src/recalc/money';
import { formatMoney } from 'src/ui/format';
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
  Row,
  Screen,
  Section,
  SelectInput,
  SkeletonRows,
  StatePill,
  TextInput,
  Thumbnail,
  UndoBar,
  Wrap,
} from 'src/ui/kit';
import { dropKey } from 'src/utils/drop-key';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';
import { isAccessError } from 'src/utils/is-access-error';

type Costs = {
  material: number | null;
  work: number | null;
  installation: number | null;
};

type Photo = { fileId: string; label: string; url: string | null };

type PricesData = {
  sections: PriceSections;
  materials: { id: string; name: string; unitLabel: string }[];
  // id of a grille or service -> the three cost numbers; absent for roles that cannot read costs
  costsById: Map<string, Costs>;
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

// A grille has three costs; a visor or a service has one, kept in `material`
// so the total is the same sum for both.
const COST_FIELDS = [
  ['material', 'Материал', 'materialCostPerSquareMeter'],
  ['work', 'Работа', 'manufacturingCostPerSquareMeter'],
  ['installation', 'Установка', 'installationCostPerSquareMeter'],
] as const;

const UNIT_OPTIONS = EXTRA_SERVICE_UNIT_OPTIONS.map(({ value }) => ({
  value,
  label: UNIT_TEXT[value],
}));

const moneyText = (value: number | null) =>
  value === null ? '' : value.toLocaleString('ru-RU');

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

const loadCosts = async (client: CoreApiClient) => {
  const costsById = new Map<string, Costs>();

  try {
    const designNodes = await fetchAllPages(async (after) => {
      const { designs } = await client.query({
        designs: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              id: true,
              materialCostPerSquareMeter: MONEY,
              manufacturingCostPerSquareMeter: MONEY,
              installationCostPerSquareMeter: MONEY,
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
          edges: { node: { id: true, cost: MONEY } },
          pageInfo: PAGE_INFO,
        },
      });

      return extraServices;
    });

    for (const node of designNodes) {
      costsById.set(node.id, {
        material: fromCurrency(node.materialCostPerSquareMeter),
        work: fromCurrency(node.manufacturingCostPerSquareMeter),
        installation: fromCurrency(node.installationCostPerSquareMeter),
      });
    }

    for (const node of serviceNodes) {
      costsById.set(node.id, {
        material: fromCurrency(node.cost),
        work: null,
        installation: null,
      });
    }
  } catch (error) {
    if (!isAccessError(error)) throw error;
  }

  return costsById;
};

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

  const materials = materialNodes
    .map((node) => ({
      id: node.id,
      name: node.name ?? '',
      unitLabel: materialUnitLabel(node.unit),
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
  };

  return {
    sections: buildPriceSections(source),
    materials,
    costsById: await loadCosts(client),
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
      Pick<PriceRow, 'name' | 'price' | 'metal' | 'unit' | 'photoUrl'>
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

      // Reloaded rather than patched in: the owner's costs come with it.
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
        title={`Из чего делается, на 1 ${UNIT_TEXT[row.unit].replace('за ', '')}`}
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
            </Line>
          ),
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

  const renderCosts = (row: PriceRow, costs: Costs) => {
    const costField = (
      [field, , column]: (typeof COST_FIELDS)[number],
      label: string,
      suffix: string,
    ) =>
      moneyField(row, field, label, costs[field], suffix, async (value) => {
        const amount = toCurrency(value);

        await updateRow(row, { [column]: amount }, { cost: amount });
        patchData(({ costsById }) => ({
          costsById: new Map(costsById).set(row.id, {
            ...(costsById.get(row.id) ?? costs),
            [field]: value,
          }),
        }));
      });

    if (row.section !== 'GRILLE') {
      return costField(
        COST_FIELDS[0],
        'Себестоимость',
        `сум ${UNIT_TEXT[row.unit]}`,
      );
    }

    const hasCost = COST_FIELDS.some(([field]) => costs[field] !== null);
    const total = COST_FIELDS.reduce(
      (sum, [field]) => sum + (costs[field] ?? 0),
      0,
    );

    return (
      <Group title="Себестоимость">
        <Columns>
          {COST_FIELDS.map((cost) => costField(cost, cost[1], 'сум'))}
        </Columns>
        {hasCost ? (
          <Hint text={`Всего ${formatMoney(total)} ${UNIT_TEXT[row.unit]}`} />
        ) : null}
      </Group>
    );
  };

  const renderOpenRow = (row: PriceRow, data: PricesData) => {
    const nameKey = `${row.id}:name`;
    const choiceKey = `${row.id}:choice`;
    const photosKey = `${row.id}:photos`;
    const costs = data.costsById.get(row.id);
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
            <Field label="Металл" isSaved={savedKey === choiceKey}>
              <SelectInput
                value={row.metal ?? ''}
                options={[
                  ...(row.metal === null
                    ? [{ value: '', label: 'Не указан' }]
                    : []),
                  ...METAL_OPTIONS,
                ]}
                onChange={(value) => {
                  const metal = METAL_OPTIONS.find(
                    (option) => option.value === value,
                  )?.value;

                  if (metal !== undefined) {
                    saveChoice(metal, { metal }, {}, { metal });
                  }
                }}
              />
            </Field>
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
        {costs ? renderCosts(row, costs) : null}
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
          {/* A row just added stays next to the button that added it, not
              where its placeholder name would sort. */}
          {[...data.sections[section.key]]
            .sort(
              (left, right) =>
                Number(left.id === newRowId) - Number(right.id === newRowId),
            )
            .map((row) => (
              <Fragment key={row.id}>
                <Row
                  leading={
                    row.section === 'GRILLE' ? (
                      <Thumbnail photoUrl={row.photoUrl} />
                    ) : undefined
                  }
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
