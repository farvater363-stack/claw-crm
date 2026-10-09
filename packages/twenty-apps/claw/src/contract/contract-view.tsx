import { type ReactNode, useEffect, useRef, useState } from 'react';

import {
  type ContractBlock,
  type ContractData,
  type ContractDocument,
  describeOpeningSize,
  formatPhone,
  percentOf,
} from 'src/contract/contract-document';
import { type ContractRun } from 'src/contract/contract-template';
import {
  OpeningSketch,
  SignaturePad,
  type SignatureStroke,
  useElementWidth,
} from 'src/measurer-form/measurer-form-ui';
import { formatMoney, formatQuantity, formatWhole } from 'src/ui/format';
import { Button, Checkbox, Hint, usePalette } from 'src/ui/kit';
import { RADIUS, SPACE, TABULAR_NUMBERS, TYPE } from 'src/ui/tokens';

// The sandbox reports a scroll position but no layout events: the box's
// heights are read again now and then, so a short contract that never
// scrolls still counts as read.
const GEOMETRY_POLL_INTERVAL_MS = 500;
const READ_TO_END_RATIO = 0.98;
const SKETCH_MIN_WIDTH_PX = 180;
// The contract beside its summary and signature from this width (a tablet)
const SIDE_BY_SIDE_MIN_WIDTH = 860;
const PAPER_HEIGHT_WIDE_PX = 640;
const PAPER_HEIGHT_NARROW_PX = 440;

const Runs = ({ runs }: { runs: ContractRun[] }) => (
  <>
    {runs.map((run, index) =>
      run.isFilled ? (
        <strong key={index}>{run.text}</strong>
      ) : (
        <span key={index}>{run.text}</span>
      ),
    )}
  </>
);

const Block = ({ block }: { block: ContractBlock }) => {
  switch (block.kind) {
    case 'title':
      return (
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 18 }}>
          <Runs runs={block.runs} />
        </div>
      );
    case 'subtitle':
      return (
        <div
          style={{
            textAlign: 'center',
            fontWeight: 600,
            marginBottom: SPACE.sm,
          }}
        >
          <Runs runs={block.runs} />
        </div>
      );
    case 'dateline':
      return (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: SPACE.sm,
            marginBottom: SPACE.md,
          }}
        >
          <span>
            <Runs runs={block.left} />
          </span>
          <span>
            <Runs runs={block.right} />
          </span>
        </div>
      );
    case 'heading':
      return (
        <div
          style={{
            textAlign: 'center',
            fontWeight: 700,
            marginTop: SPACE.lg,
            marginBottom: SPACE.xs,
          }}
        >
          {block.text}
        </div>
      );
    case 'bullet':
      return (
        <div style={{ display: 'flex', gap: SPACE.sm, paddingLeft: SPACE.lg }}>
          <span aria-hidden>•</span>
          <span>
            <Runs runs={block.runs} />
          </span>
        </div>
      );
    case 'paragraph':
      return (
        <p style={{ margin: `0 0 ${SPACE.xs}px` }}>
          <Runs runs={block.runs} />
        </p>
      );
  }
};

const Appendices = ({ document }: { document: ContractDocument }) => {
  const colors = usePalette();
  const cell = {
    padding: `${SPACE.xs}px ${SPACE.sm}px`,
    borderBottom: `1px solid ${colors.border}`,
    textAlign: 'left' as const,
    verticalAlign: 'top' as const,
  };
  const number = { ...cell, textAlign: 'right' as const, ...TABULAR_NUMBERS };
  const drawn = document.openings.filter(
    (opening) => opening.widthCm !== null && opening.heightCm !== null,
  );

  return (
    <>
      <div
        style={{
          textAlign: 'center',
          fontWeight: 700,
          marginTop: SPACE.xl,
          marginBottom: SPACE.sm,
        }}
      >
        ПРИЛОЖЕНИЕ 1. СПЕЦИФИКАЦИЯ
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            ...TYPE.label,
          }}
        >
          <thead>
            <tr style={{ background: colors.panel }}>
              <th style={cell}>№</th>
              <th style={cell}>Изделие</th>
              <th style={cell}>Размер, см</th>
              <th style={number}>Кол-во</th>
              <th style={number}>м²</th>
              <th style={number}>Сумма, сум</th>
            </tr>
          </thead>
          <tbody>
            {document.openings.map((opening, index) => (
              <tr key={index}>
                <td style={cell}>{index + 1}</td>
                <td style={cell}>
                  {[opening.product, opening.visorText]
                    .filter(Boolean)
                    .join(', ')}
                </td>
                <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                  {describeOpeningSize(opening)}
                </td>
                <td style={number}>{opening.quantity}</td>
                <td style={number}>
                  {opening.areaSquareMeters === null
                    ? '—'
                    : opening.areaSquareMeters.toFixed(2)}
                </td>
                <td style={number}>
                  {opening.lineTotal === null
                    ? '—'
                    : formatWhole(opening.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: SPACE.sm }}>
        {document.specificationNotes.map((note) =>
          note.startsWith('Итого') ? (
            <p key={note} style={{ margin: 0, fontWeight: 700 }}>
              {note}
            </p>
          ) : (
            <p key={note} style={{ margin: 0 }}>
              {note}
            </p>
          ),
        )}
      </div>
      {drawn.length > 0 ? (
        <>
          <div
            style={{
              textAlign: 'center',
              fontWeight: 700,
              marginTop: SPACE.xl,
              marginBottom: SPACE.xs,
            }}
          >
            ПРИЛОЖЕНИЕ 2. СХЕМА
          </div>
          <p style={{ margin: `0 0 ${SPACE.sm}px`, ...TYPE.label }}>
            Схема проёмов по замеру: вид спереди и сбоку. Размеры в сантиметрах.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(${SKETCH_MIN_WIDTH_PX}px, 1fr))`,
              gap: SPACE.sm,
            }}
          >
            {drawn.map((opening) => (
              <div
                key={opening.title}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: RADIUS.control,
                  padding: SPACE.sm,
                  ...TYPE.label,
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {opening.quantity > 1
                    ? `${opening.title} × ${opening.quantity}`
                    : opening.title}
                </div>
                <OpeningSketch
                  widthCm={opening.widthCm}
                  heightCm={opening.heightCm}
                  projectionKind={opening.projectionKind}
                  projectionCm={opening.projectionCm}
                />
                <div style={{ fontWeight: 600 }}>{opening.product}</div>
                <div style={{ color: colors.muted, ...TABULAR_NUMBERS }}>
                  {describeOpeningSize(opening)} см
                  {opening.areaSquareMeters === null
                    ? ''
                    : ` · ${opening.areaSquareMeters.toFixed(2)} м²`}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
};

type Geometry = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

const readRatio = ({ scrollTop, scrollHeight, clientHeight }: Geometry) =>
  scrollHeight > 0 ? Math.min(1, (scrollTop + clientHeight) / scrollHeight) : 0;

// The contract as the client reads it before signing, in its own scroll box.
export const ContractPaper = ({
  document,
  height = 560,
  onReadToEnd,
}: {
  document: ContractDocument;
  height?: number | string;
  onReadToEnd: () => void;
}) => {
  const colors = usePalette();
  const box = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const hasReported = useRef(false);

  const update = (geometry: Geometry) => {
    const ratio = readRatio(geometry);

    setProgress((current) => Math.max(current, ratio));

    if (ratio >= READ_TO_END_RATIO && !hasReported.current) {
      hasReported.current = true;
      onReadToEnd();
    }
  };

  const latestUpdate = useRef(update);

  latestUpdate.current = update;

  useEffect(() => {
    const read = () => {
      const element = box.current;

      if (element !== null) latestUpdate.current(element);
    };

    read();

    const timer = setInterval(read, GEOMETRY_POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ display: 'grid', gap: SPACE.sm, minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: SPACE.sm,
          ...TYPE.label,
          color: colors.muted,
        }}
      >
        <span>Пролистайте договор до конца</span>
        <span
          style={TABULAR_NUMBERS}
        >{`Прочитано ${Math.round(progress * 100)}%`}</span>
      </div>
      <div
        aria-hidden
        style={{
          height: 6,
          borderRadius: 3,
          background: colors.panel,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.round(progress * 100)}%`,
            background: colors.accent,
          }}
        />
      </div>
      <div
        ref={box}
        role="document"
        aria-label="Текст договора"
        tabIndex={0}
        onScroll={(event) => update(event.currentTarget)}
        style={{
          height,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          padding: SPACE.lg,
          background: colors.surface,
          color: colors.text,
          border: `1px solid ${colors.border}`,
          borderRadius: RADIUS.card,
          ...TYPE.body,
        }}
      >
        {document.blocks.map((block, index) => (
          <Block key={index} block={block} />
        ))}
        <Appendices document={document} />
        <div
          style={{
            marginTop: SPACE.xl,
            padding: SPACE.md,
            border: `1px dashed ${colors.border}`,
            borderRadius: RADIUS.control,
            textAlign: 'center',
            color: colors.muted,
            ...TYPE.label,
          }}
        >
          Конец договора. Можно подписывать.
        </div>
      </div>
    </div>
  );
};

// The tick and the finger signature, unlocked once the contract was read.
export const SigningPanel = ({
  isUnlocked,
  lockedText,
  isAgreed,
  onAgreeChange,
  signature,
  onSignatureChange,
  children,
}: {
  isUnlocked: boolean;
  lockedText: string;
  isAgreed: boolean;
  onAgreeChange: (isAgreed: boolean) => void;
  signature: SignatureStroke[];
  onSignatureChange: (
    update: (strokes: SignatureStroke[]) => SignatureStroke[],
  ) => void;
  // The sign button and its note
  children?: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <div style={{ display: 'grid', gap: SPACE.md, minWidth: 0 }}>
      {isUnlocked ? (
        <Checkbox
          label="Я прочитал договор, спецификацию и схему, согласен с условиями, размерами и суммой."
          isChecked={isAgreed}
          onChange={onAgreeChange}
        />
      ) : null}
      {isUnlocked && isAgreed ? (
        <>
          <SignaturePad strokes={signature} onChange={onSignatureChange} />
          {signature.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: SPACE.sm,
              }}
            >
              <span style={{ color: colors.success, fontWeight: 600 }}>
                ✓ Подписано
              </span>
              <Button onClick={() => onSignatureChange(() => [])}>
                Очистить подпись
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 160,
            padding: SPACE.lg,
            textAlign: 'center',
            color: colors.muted,
            background: colors.panel,
            border: `2px dashed ${colors.border}`,
            borderRadius: RADIUS.card,
          }}
        >
          {isUnlocked ? 'Отметьте, что договор прочитан' : lockedText}
        </div>
      )}
      {children}
    </div>
  );
};

const countOpenings = (count: number) =>
  `${count} ${count % 10 === 1 && count % 100 !== 11 ? 'проём' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'проёма' : 'проёмов'}`;

// The figures the client checks before signing, under «Коротко».
const ContractSummary = ({ data }: { data: ContractData }) => {
  const colors = usePalette();
  const pieces = data.openings.reduce(
    (sum, opening) => sum + (opening.widthCm === null ? 0 : opening.quantity),
    0,
  );
  const area = data.openings.reduce(
    (sum, opening) => sum + (opening.areaSquareMeters ?? 0),
    0,
  );
  const rows: { label: string; value: string; isTotal?: boolean }[] = [
    ...(pieces > 0
      ? [
          {
            label: countOpenings(pieces),
            value: formatQuantity(Math.round(area * 100) / 100, 'м²'),
          },
        ]
      : []),
    ...(data.subtotal !== null && data.discount > 0
      ? [
          { label: 'Сумма', value: formatMoney(data.subtotal) },
          { label: 'Скидка', value: `−${formatMoney(data.discount)}` },
        ]
      : []),
    { label: 'Итого', value: formatMoney(data.total), isTotal: true },
    {
      label: `Предоплата, ${percentOf(data.prepayment, data.total)}%`,
      value: formatMoney(data.prepayment),
    },
    { label: 'Срок', value: `${data.termDays} дней` },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gap: SPACE.xs,
        padding: SPACE.lg,
        background: colors.panel,
        borderRadius: RADIUS.card,
      }}
    >
      <span style={{ ...TYPE.label, color: colors.muted }}>Коротко</span>
      <span style={{ fontWeight: 600 }}>{data.clientName || '—'}</span>
      <span style={{ color: colors.muted, ...TABULAR_NUMBERS }}>
        {formatPhone(data.clientPhone) || '—'}
      </span>
      {rows.map((row) => (
        <div
          key={row.label}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: SPACE.md,
            fontWeight: row.isTotal ? 700 : 400,
            ...TABULAR_NUMBERS,
          }}
        >
          <span>{row.label}</span>
          <span style={{ whiteSpace: 'nowrap' }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
};

// Reading and signing, the same on «Новый замер» and on the order page: the
// contract, then what the client checks and where they sign. The signature
// is the parent's, which saves it; unticking «Ознакомлен» wipes it.
export const ContractSigning = ({
  document,
  data,
  blockers,
  warnings,
  signature,
  onSignatureChange,
  children,
}: {
  document: ContractDocument;
  data: ContractData;
  // Missing order details: signing stays locked while any is listed
  blockers: string[];
  // Company details the owner has not filled yet; signing still works
  warnings: string[];
  signature: SignatureStroke[];
  onSignatureChange: (
    update: (strokes: SignatureStroke[]) => SignatureStroke[],
  ) => void;
  // The sign button and its note
  children?: ReactNode;
}) => {
  const page = useElementWidth();
  const [isRead, setIsRead] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);
  const isSideBySide = page.width >= SIDE_BY_SIDE_MIN_WIDTH;

  return (
    <div
      ref={page.ref}
      style={{
        display: 'grid',
        gridTemplateColumns: isSideBySide
          ? 'minmax(0, 1.7fr) minmax(280px, 1fr)'
          : 'minmax(0, 1fr)',
        gap: SPACE.xl,
        alignItems: 'start',
      }}
    >
      <ContractPaper
        document={document}
        height={isSideBySide ? PAPER_HEIGHT_WIDE_PX : PAPER_HEIGHT_NARROW_PX}
        onReadToEnd={() => setIsRead(true)}
      />
      <div style={{ display: 'grid', gap: SPACE.md, minWidth: 0 }}>
        <ContractSummary data={data} />
        {warnings.length > 0 ? (
          <Hint
            tone="warning"
            isSmall
            text={`В договоре не заполнено: ${warnings.join(', ')}. Владелец заполняет это на экране «Договор».`}
          />
        ) : null}
        <SigningPanel
          isUnlocked={isRead && blockers.length === 0}
          lockedText={
            blockers.length > 0
              ? `Чтобы подписать, заполните в заказе: ${blockers.join(', ')}`
              : 'Пролистайте договор до конца, чтобы подписать'
          }
          isAgreed={isAgreed}
          onAgreeChange={(nextIsAgreed) => {
            setIsAgreed(nextIsAgreed);

            if (!nextIsAgreed) onSignatureChange(() => []);
          }}
          signature={signature}
          onSignatureChange={onSignatureChange}
        >
          {children}
        </SigningPanel>
      </div>
    </div>
  );
};
