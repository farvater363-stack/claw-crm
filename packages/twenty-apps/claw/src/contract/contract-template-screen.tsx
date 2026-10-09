import { useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';

import {
  contractDataFromOrder,
  type StoredOrderForContract,
} from 'src/contract/contract-data';
import { buildContractDocument } from 'src/contract/contract-document';
import {
  loadContractTemplate,
  saveContractTemplate,
} from 'src/contract/contract-store';
import {
  type ContractSection,
  type ContractTemplate,
  findUnknownPlaceholders,
  missingCompanyDetails,
  PLACEHOLDERS,
  templateTexts,
} from 'src/contract/contract-template';
import { ContractPaper } from 'src/contract/contract-view';
import { loadOrderContract } from 'src/contract/load-order-contract';
import { useElementWidth } from 'src/measurer-form/measurer-form-ui';
import { todayInTashkent } from 'src/pricing/dates';
import {
  Button,
  ErrorNote,
  Field,
  FilePicker,
  Hint,
  Panel,
  Screen,
  Sheet,
  SkeletonRows,
  TextInput,
  usePalette,
} from 'src/ui/kit';
import { RADIUS, SPACE, TABULAR_NUMBERS, TYPE } from 'src/ui/tokens';

const PAGE_SIZE = 500;
// The sections list beside the editor from this width
const SIDE_LIST_MIN_WIDTH = 760;
const SEAL_MAX_SIDE_PX = 600;
// Section 14 is what makes a finger signature on the screen binding.
const SIGNING_SECTION_PATTERN = /ЭЛЕКТРОНН/i;
const PREAMBLE_KEY = -1;

type Loaded = {
  saved: ContractTemplate;
  signedByVersion: Map<number, number>;
  preview: { orderName: string; order: StoredOrderForContract } | null;
};

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const loadSignedCounts = async (): Promise<Map<number, number>> => {
  const { signedContracts } = await new CoreApiClient().query({
    signedContracts: {
      __args: { first: PAGE_SIZE },
      edges: { node: { templateVersion: true } },
    },
  });
  const counts = new Map<number, number>();

  for (const { node } of signedContracts?.edges ?? []) {
    const version = node.templateVersion ?? 0;

    counts.set(version, (counts.get(version) ?? 0) + 1);
  }

  return counts;
};

// The newest order with a sum: the preview reads like a real contract.
const loadPreviewOrder = async (): Promise<Loaded['preview']> => {
  const { orders } = await new CoreApiClient().query({
    orders: {
      __args: {
        filter: { total: { amountMicros: { gt: 0 } } },
        first: 1,
        orderBy: [{ createdAt: 'DescNullsLast' }],
      },
      edges: { node: { id: true } },
    },
  });
  const orderId = orders?.edges[0]?.node?.id;

  if (orderId === undefined) return null;

  const contract = await loadOrderContract(orderId);

  if (contract === null) return null;

  return { orderName: contract.order.name ?? '', order: contract.order };
};

const readAsBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
};

// A phone photo is several megabytes; the PDF needs a few hundred pixels.
const toSealDataUrl = async (file: File): Promise<string> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    SEAL_MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = new OffscreenCanvas(
    Math.round(bitmap.width * scale),
    Math.round(bitmap.height * scale),
  );
  const context = canvas.getContext('2d');

  if (context === null) throw new Error('no 2d context');

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await canvas.convertToBlob({ type: 'image/png' });

  return `data:image/png;base64,${await readAsBase64(blob)}`;
};

const isSigningSection = (section: ContractSection) =>
  SIGNING_SECTION_PATTERN.test(section.title);

const sameTemplate = (left: ContractTemplate, right: ContractTemplate) =>
  JSON.stringify({ ...left, id: null, version: 0 }) ===
  JSON.stringify({ ...right, id: null, version: 0 });

// A whole section at a time: a few lines would hide most of it.
const LongText = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => {
  const colors = usePalette();

  return (
    <label style={{ display: 'grid', gap: SPACE.xs, ...TYPE.label }}>
      <span style={{ color: colors.muted }}>{label}</span>
      <textarea
        rows={14}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          padding: `${SPACE.sm}px ${SPACE.md}px`,
          border: `1px solid ${colors.border}`,
          borderRadius: RADIUS.control,
          background: colors.surface,
          color: colors.text,
          font: 'inherit',
          ...TYPE.body,
          resize: 'vertical',
        }}
      />
    </label>
  );
};

const SectionList = ({
  sections,
  chosen,
  onChoose,
  onMove,
}: {
  sections: ContractSection[];
  chosen: number;
  onChoose: (index: number) => void;
  onMove: (index: number, delta: -1 | 1) => void;
}) => {
  const colors = usePalette();
  const item = (index: number, title: string) => {
    const isChosen = index === chosen;

    return (
      <div
        key={index}
        style={{ display: 'flex', alignItems: 'stretch', gap: SPACE.xs }}
      >
        <button
          type="button"
          aria-current={isChosen}
          onClick={() => onChoose(index)}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 44,
            padding: `${SPACE.sm}px ${SPACE.md}px`,
            textAlign: 'left',
            border: 'none',
            borderRadius: RADIUS.control,
            background: isChosen ? colors.accentTint : 'transparent',
            color: isChosen ? colors.accent : colors.text,
            font: 'inherit',
            ...TYPE.label,
            fontWeight: isChosen ? 600 : 400,
            cursor: 'pointer',
          }}
        >
          {title || 'Без названия'}
        </button>
        {index >= 0 && isChosen ? (
          <>
            <Button label="Выше" onClick={() => onMove(index, -1)}>
              ↑
            </Button>
            <Button label="Ниже" onClick={() => onMove(index, 1)}>
              ↓
            </Button>
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {item(PREAMBLE_KEY, 'Стороны договора')}
      {sections.map((section, index) => item(index, section.title))}
    </div>
  );
};

const MarkerChips = ({ onInsert }: { onInsert: (marker: string) => void }) => {
  const colors = usePalette();

  return (
    <div style={{ display: 'grid', gap: SPACE.xs }}>
      <span style={{ ...TYPE.label, color: colors.muted }}>
        Вставить данные заказа:
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.xs }}>
        {PLACEHOLDERS.map((placeholder) => (
          <button
            key={placeholder.key}
            type="button"
            title={placeholder.hint}
            onClick={() => onInsert(`{${placeholder.key}}`)}
            style={{
              minHeight: 36,
              padding: `0 ${SPACE.md}px`,
              border: `1px solid ${colors.border}`,
              borderRadius: 18,
              background: colors.panel,
              color: colors.text,
              font: 'inherit',
              ...TYPE.label,
              cursor: 'pointer',
            }}
          >
            {`{${placeholder.key}}`}
          </button>
        ))}
      </div>
    </div>
  );
};

export const ContractTemplateScreen = () => {
  const colors = usePalette();
  const page = useElementWidth();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContractTemplate | null>(null);
  const [chosen, setChosen] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [sealError, setSealError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    setLoadError(null);
    loadContractTemplate()
      .then(async (saved) => {
        const [signedByVersion, preview] = await Promise.all([
          loadSignedCounts(),
          loadPreviewOrder().catch(() => null),
        ]);

        setLoaded({ saved, signedByVersion, preview });
        setDraft(saved);
      })
      .catch((error: unknown) => setLoadError(describeError(error)));
  }, [reloadCount]);

  if (loadError !== null) {
    return (
      <Screen title="Договор">
        <ErrorNote
          text={`Договор не загрузился: ${loadError}`}
          onRetry={() => setReloadCount((count) => count + 1)}
        />
      </Screen>
    );
  }

  if (loaded === null || draft === null) {
    return (
      <Screen title="Договор">
        <SkeletonRows count={6} />
      </Screen>
    );
  }

  const update = (patch: Partial<ContractTemplate>) => {
    setSavedVersion(null);
    setDraft({ ...draft, ...patch });
  };
  const updateSection = (index: number, patch: Partial<ContractSection>) =>
    update({
      sections: draft.sections.map((section, at) =>
        at === index ? { ...section, ...patch } : section,
      ),
    });
  const moveSection = (index: number, delta: -1 | 1) => {
    const target = index + delta;

    if (target < 0 || target >= draft.sections.length) return;

    const sections = [...draft.sections];

    [sections[index], sections[target]] = [sections[target], sections[index]];
    update({ sections });
    setChosen(target);
  };
  const addSection = () => {
    update({
      sections: [
        ...draft.sections,
        { title: `${draft.sections.length + 1}. НОВЫЙ РАЗДЕЛ`, body: '' },
      ],
    });
    setChosen(draft.sections.length);
  };
  const removeSection = (index: number) => {
    update({ sections: draft.sections.filter((_, at) => at !== index) });
    setChosen(Math.max(0, index - 1));
  };

  const unknownMarkers = [
    ...new Set(templateTexts(draft).flatMap(findUnknownPlaceholders)),
  ];
  const hasEmptySection = draft.sections.some(
    (section) => section.title.trim() === '',
  );
  const isDirty = !sameTemplate(draft, loaded.saved);
  const blockers = [
    ...(unknownMarkers.length > 0
      ? [
          `Таких данных заказа нет: ${unknownMarkers.map((marker) => `{${marker}}`).join(', ')}. Исправьте или вставьте кнопкой ниже текста.`,
        ]
      : []),
    ...(hasEmptySection ? ['У раздела нет названия.'] : []),
    ...(draft.defaultTermDays > 0 ? [] : ['Срок по умолчанию: больше нуля.']),
  ];

  const save = async () => {
    if (blockers.length > 0 || !isDirty) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const saved = await saveContractTemplate(draft);

      setLoaded({ ...loaded, saved });
      setDraft(saved);
      setSavedVersion(saved.version);
    } catch (error) {
      setSaveError(`Не сохранено: ${describeError(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const pickSeal = async (files: File[]) => {
    const file = files[0];

    if (file === undefined) return;

    setSealError(null);

    try {
      update({ sealImage: await toSealDataUrl(file) });
    } catch (error) {
      setSealError(`Картинка не открылась: ${describeError(error)}`);
    }
  };

  const insertMarker = (marker: string) => {
    if (chosen === PREAMBLE_KEY) {
      update({ preamble: `${draft.preamble}${marker}` });
    } else {
      const section = draft.sections[chosen];

      if (section !== undefined) {
        updateSection(chosen, { body: `${section.body}${marker}` });
      }
    }
  };

  const chosenSection =
    chosen === PREAMBLE_KEY ? null : (draft.sections[chosen] ?? null);
  const isSideList = page.width >= SIDE_LIST_MIN_WIDTH;
  const missing = missingCompanyDetails(draft);
  const previewData =
    loaded.preview === null
      ? null
      : contractDataFromOrder(loaded.preview.order, draft, todayInTashkent());

  const editor =
    chosen === PREAMBLE_KEY ? (
      <div style={{ display: 'grid', gap: SPACE.md }}>
        <LongText
          label="Стороны договора. Каждый абзац с новой строки."
          value={draft.preamble}
          onChange={(preamble) => update({ preamble })}
        />
        <MarkerChips onInsert={insertMarker} />
      </div>
    ) : chosenSection === null ? null : (
      <div style={{ display: 'grid', gap: SPACE.md }}>
        <Field label="Название раздела">
          <TextInput
            label="Название раздела"
            value={chosenSection.title}
            onChange={(title) => updateSection(chosen, { title })}
          />
        </Field>
        <LongText
          label="Текст. Каждый абзац с новой строки, «•» в начале для списка."
          value={chosenSection.body}
          onChange={(body) => updateSection(chosen, { body })}
        />
        <MarkerChips onInsert={insertMarker} />
        {isSigningSection(chosenSection) ? (
          <Hint
            isSmall
            text="Этот раздел нельзя удалить: без него подпись на экране не имеет основания."
          />
        ) : (
          <div>
            <Button onClick={() => removeSection(chosen)}>
              Удалить раздел
            </Button>
          </div>
        )}
      </div>
    );

  return (
    <div ref={page.ref}>
      <Screen
        title="Договор"
        subtitle={`Действует версия ${loaded.saved.version}. Подписанные договоры не меняются.`}
        maxWidth={1080}
        action={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
            {previewData === null ? null : (
              <Button onClick={() => setIsPreviewOpen(true)}>
                {`Предпросмотр на заказе ${loaded.preview?.orderName ?? ''}`}
              </Button>
            )}
            {isDirty ? (
              <Button
                variant="primary"
                isBusy={isSaving}
                onClick={() => void save()}
              >
                {`Сохранить как версию ${loaded.saved.version + 1}`}
              </Button>
            ) : null}
          </div>
        }
      >
        <div style={{ display: 'grid', gap: SPACE.md, marginBottom: SPACE.lg }}>
          {blockers.map((blocker) => (
            <Hint key={blocker} tone="danger" text={blocker} />
          ))}
          {saveError === null ? null : <ErrorNote text={saveError} />}
          {savedVersion === null ? null : (
            <Hint
              tone="success"
              text={`✓ Сохранено как версия ${savedVersion}. Следующие договоры подписываются по ней.`}
            />
          )}
          {isDirty && savedVersion === null ? (
            <Hint tone="warning" text="Есть несохранённые изменения." />
          ) : null}
        </div>
        <Panel title="Исполнитель">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: SPACE.md,
              padding: `0 ${SPACE.lg}px ${SPACE.lg}px`,
            }}
          >
            <Field label="Название">
              <TextInput
                label="Название"
                value={draft.companyName}
                onChange={(companyName) => update({ companyName })}
              />
            </Field>
            <Field label="В лице">
              <TextInput
                label="В лице"
                placeholder="директора Иванова И. И."
                value={draft.representative}
                onChange={(representative) => update({ representative })}
              />
            </Field>
            <Field label="Действует на основании">
              <TextInput
                label="Действует на основании"
                placeholder="Устава / свидетельства ИП №…"
                value={draft.basis}
                onChange={(basis) => update({ basis })}
              />
            </Field>
            <Field label="Город">
              <TextInput
                label="Город"
                value={draft.city}
                onChange={(city) => update({ city })}
              />
            </Field>
            <Field label="Срок по умолчанию, дней">
              <TextInput
                label="Срок по умолчанию, дней"
                inputMode="numeric"
                value={String(draft.defaultTermDays)}
                onChange={(value) =>
                  update({
                    defaultTermDays: Number.parseInt(value, 10) || 0,
                  })
                }
              />
            </Field>
            <Field label="Заголовок">
              <TextInput
                label="Заголовок"
                value={draft.title}
                onChange={(title) => update({ title })}
              />
            </Field>
            <Field label="Подзаголовок">
              <TextInput
                label="Подзаголовок"
                value={draft.subtitle}
                onChange={(subtitle) => update({ subtitle })}
              />
            </Field>
          </div>
          {missing.length > 0 ? (
            <div style={{ padding: `0 ${SPACE.lg}px ${SPACE.lg}px` }}>
              <Hint
                tone="warning"
                text={`Не заполнено: ${missing.join(', ')}. В договоре на этом месте будет пропуск «____».`}
              />
            </div>
          ) : null}
        </Panel>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isSideList
              ? 'minmax(240px, 1fr) minmax(0, 2fr)'
              : 'minmax(0, 1fr)',
            gap: SPACE.lg,
            alignItems: 'start',
            marginBottom: SPACE.lg,
          }}
        >
          <Panel
            title="Разделы"
            footer={<Button onClick={addSection}>+ Раздел</Button>}
          >
            <div style={{ padding: `0 ${SPACE.sm}px ${SPACE.sm}px` }}>
              <SectionList
                sections={draft.sections}
                chosen={chosen}
                onChoose={setChosen}
                onMove={moveSection}
              />
            </div>
          </Panel>
          <Panel
            title={
              chosen === PREAMBLE_KEY
                ? 'Стороны договора'
                : (chosenSection?.title ?? 'Раздел')
            }
          >
            <div style={{ padding: `0 ${SPACE.lg}px ${SPACE.lg}px` }}>
              {editor}
            </div>
          </Panel>
        </div>
        <Panel
          title="Подпись и печать исполнителя"
          subtitle="Необязательно. Картинка печатается в каждом договоре рядом с подписью клиента."
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: SPACE.md,
              padding: `0 ${SPACE.lg}px ${SPACE.lg}px`,
            }}
          >
            {draft.sealImage === null ? null : (
              <img
                src={draft.sealImage}
                alt="Подпись и печать"
                style={{
                  maxWidth: 200,
                  maxHeight: 100,
                  padding: SPACE.sm,
                  background: '#ffffff',
                  border: `1px solid ${colors.border}`,
                  borderRadius: RADIUS.control,
                }}
              />
            )}
            <FilePicker
              text={draft.sealImage === null ? 'Выбрать картинку' : 'Заменить'}
              accept="image/png,image/jpeg"
              onPick={(files) => void pickSeal(files)}
            />
            {draft.sealImage === null ? null : (
              <Button onClick={() => update({ sealImage: null })}>
                Убрать
              </Button>
            )}
            {sealError === null ? null : (
              <Hint tone="danger" text={sealError} />
            )}
          </div>
        </Panel>
        <Panel title="Версии">
          {Array.from(
            { length: loaded.saved.version },
            (_, index) => loaded.saved.version - index,
          ).map((version) => (
            <div
              key={version}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: SPACE.md,
                padding: `${SPACE.md}px ${SPACE.lg}px`,
                borderTop: `1px solid ${colors.border}`,
                ...TABULAR_NUMBERS,
              }}
            >
              <span>
                {`Версия ${version}`}
                {version === loaded.saved.version ? ' · действует' : ''}
                {version === 1 ? ' · текст PROFMET из .docx' : ''}
              </span>
              <span style={{ color: colors.muted }}>
                {`Подписано: ${loaded.signedByVersion.get(version) ?? 0}`}
              </span>
            </div>
          ))}
        </Panel>
      </Screen>
      {isPreviewOpen && previewData !== null ? (
        <Sheet
          title={`Предпросмотр на заказе ${loaded.preview?.orderName ?? ''}`}
          onClose={() => setIsPreviewOpen(false)}
        >
          <Hint
            isSmall
            text="Так клиент увидит договор с текстом, который сейчас на экране, ещё до сохранения."
          />
          <ContractPaper
            document={buildContractDocument(draft, previewData)}
            onReadToEnd={() => undefined}
          />
        </Sheet>
      ) : null}
    </div>
  );
};
