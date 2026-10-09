import { useEffect, useState } from 'react';
import {
  copyToClipboard,
  enqueueSnackbar,
  useSelectedRecordIds,
  useUserId,
} from 'twenty-sdk/front-component';

import { describeContractChange } from 'src/contract/contract-change';
import {
  contractDataFromOrder,
  missingClientDetails,
} from 'src/contract/contract-data';
import {
  buildContractDocument,
  formatPhone,
  formatSigningTime,
} from 'src/contract/contract-document';
import {
  shortCheckCode,
  type SignatureStroke,
} from 'src/contract/contract-pdf';
import {
  loadContractTemplate,
  loadSignerName,
  signContract,
} from 'src/contract/contract-store';
import {
  type ContractTemplate,
  missingCompanyDetails,
} from 'src/contract/contract-template';
import { ContractSigning } from 'src/contract/contract-view';
import {
  loadOrderContract,
  type OrderContract,
  type SignedContractRecord,
} from 'src/contract/load-order-contract';
import { todayInTashkent } from 'src/pricing/dates';
import { formatMoney } from 'src/ui/format';
import {
  Button,
  ErrorNote,
  Hint,
  SkeletonRows,
  StatePill,
  usePalette,
} from 'src/ui/kit';
import { RADIUS, SPACE, TABULAR_NUMBERS, TYPE } from 'src/ui/tokens';

type Loaded = { contract: OrderContract; template: ContractTemplate };

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const PdfLine = ({
  signing,
  isReplaced,
}: {
  signing: SignedContractRecord;
  isReplaced: boolean;
}) => {
  const colors = usePalette();
  const when =
    signing.signedAt === null
      ? ''
      : formatSigningTime(new Date(signing.signedAt));

  return (
    <a
      href={signing.pdfUrl ?? undefined}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACE.md,
        padding: SPACE.md,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.control,
        color: colors.text,
        textDecoration: 'none',
        opacity: isReplaced ? 0.75 : 1,
      }}
    >
      <span
        aria-hidden
        style={{
          flex: 'none',
          padding: `${SPACE.xs}px ${SPACE.sm}px`,
          borderRadius: RADIUS.control,
          background: colors.dangerTint,
          color: colors.danger,
          ...TYPE.label,
          fontWeight: 700,
        }}
      >
        PDF
      </span>
      <span style={{ display: 'grid', minWidth: 0 }}>
        <span
          style={{
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {signing.pdfLabel ?? 'Договор.pdf'}
        </span>
        <span style={{ ...TYPE.label, color: colors.muted }}>
          {isReplaced ? `Заменён · подписан ${when}` : `Подписан ${when}`}
        </span>
      </span>
    </a>
  );
};

const Facts = ({ rows }: { rows: { label: string; value: string }[] }) => {
  const colors = usePalette();

  return (
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: 'max-content minmax(0, 1fr)',
        gap: `${SPACE.xs}px ${SPACE.lg}px`,
        margin: 0,
        ...TYPE.label,
      }}
    >
      {rows.map((row) => (
        <div key={row.label} style={{ display: 'contents' }}>
          <dt style={{ color: colors.muted }}>{row.label}</dt>
          <dd style={{ margin: 0, ...TABULAR_NUMBERS }}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
};

const SigningForm = ({
  orderId,
  loaded,
  isResign,
  onClose,
  onSigned,
}: {
  orderId: string;
  loaded: Loaded;
  isResign: boolean;
  onClose: () => void;
  onSigned: () => void;
}) => {
  const userId = useUserId();
  const [signature, setSignature] = useState<SignatureStroke[]>([]);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { contract, template } = loaded;
  const data = contractDataFromOrder(
    contract.order,
    template,
    todayInTashkent(),
  );
  const document = buildContractDocument(template, data);
  const blockers = missingClientDetails(data);

  const sign = async () => {
    setIsSigning(true);
    setError(null);

    try {
      await signContract({
        orderId,
        orderName: contract.order.name ?? '',
        template,
        data,
        signature,
        signedBy: userId === null ? '—' : await loadSignerName(userId),
      });
      onSigned();
    } catch (signError) {
      setError(
        `Договор не сохранён, подпись на месте. Попробуйте ещё раз. (${describeError(signError)})`,
      );
      setIsSigning(false);
    }
  };

  // In place, not in a Sheet: the order page stacks its widgets, and the
  // tables under this one would cover a panel that floats over them.
  return (
    <div style={{ display: 'grid', gap: SPACE.md }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: SPACE.sm,
        }}
      >
        <span style={TYPE.rowTitle}>
          {isResign ? 'Подписать заново' : 'Подписать договор'}
        </span>
        <Button onClick={() => !isSigning && onClose()}>Отмена</Button>
      </div>
      <ContractSigning
        document={document}
        data={data}
        blockers={blockers}
        warnings={missingCompanyDetails(template)}
        signature={signature}
        onSignatureChange={setSignature}
      >
        {error === null ? null : <ErrorNote text={error} />}
        {signature.length > 0 ? (
          <Button
            variant="primary"
            isWideOnPhone
            isBusy={isSigning}
            busyText="Сохраняем PDF…"
            onClick={() => void sign()}
          >
            Подписать
          </Button>
        ) : null}
      </ContractSigning>
    </div>
  );
};

const OrderContractOf = ({ orderId }: { orderId: string }) => {
  const colors = usePalette();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    setLoadError(null);
    Promise.all([loadOrderContract(orderId), loadContractTemplate()])
      .then(([contract, template]) => {
        if (contract === null) throw new Error('заказ не найден');

        setLoaded({ contract, template });
      })
      .catch((error: unknown) => setLoadError(describeError(error)));
  }, [orderId, reloadCount]);

  if (loadError !== null) {
    return (
      <ErrorNote
        text={`Договор не загрузился: ${loadError}`}
        onRetry={() => setReloadCount((count) => count + 1)}
      />
    );
  }

  if (loaded === null) return <SkeletonRows count={2} />;

  const { contract, template } = loaded;
  const [current, ...older] = contract.signings;
  const changes =
    current === undefined
      ? []
      : describeContractChange(
          current.termsKey,
          contractDataFromOrder(contract.order, template, todayInTashkent()),
        );
  const isChanged = changes.length > 0;
  const header = (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: SPACE.sm,
      }}
    >
      {current === undefined ? (
        <StatePill tone="warning" text="Не подписан" />
      ) : isChanged ? (
        <StatePill tone="danger" text="Изменился после подписи" />
      ) : (
        <StatePill tone="success" text="Подписан" />
      )}
    </div>
  );
  const signingForm = isSigning ? (
    <SigningForm
      orderId={orderId}
      loaded={loaded}
      isResign={current !== undefined}
      onClose={() => setIsSigning(false)}
      onSigned={() => {
        setIsSigning(false);
        setLoaded(null);
        setReloadCount((count) => count + 1);
      }}
    />
  ) : null;
  const share = (signing: SignedContractRecord) => {
    if (signing.pdfUrl === null) return;

    void copyToClipboard(signing.pdfUrl).then(() =>
      enqueueSnackbar({
        message:
          'Ссылка на PDF скопирована: вставьте её в Telegram клиенту. Ссылка действует сутки.',
        variant: 'success',
      }),
    );
  };

  if (signingForm !== null) {
    return (
      <div style={{ color: colors.text, fontFamily: 'inherit', ...TYPE.body }}>
        {signingForm}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: SPACE.md,
        color: colors.text,
        fontFamily: 'inherit',
        ...TYPE.body,
      }}
    >
      {header}
      {current === undefined ? (
        <>
          <span style={{ color: colors.muted }}>
            Клиент не подписал договор на замере. Дайте планшет клиенту, чтобы
            он прочитал и подписал.
          </span>
          <div>
            <Button variant="primary" onClick={() => setIsSigning(true)}>
              Подписать договор
            </Button>
          </div>
        </>
      ) : isChanged ? (
        <>
          <span>
            {`После подписи ${current.signedAt === null ? '' : formatSigningTime(new Date(current.signedAt)).replace(/, \d{2}:\d{2}$/, '')} изменилось: `}
            <strong>{changes.join(', ')}</strong>.
          </span>
          <div>
            <Button variant="primary" onClick={() => setIsSigning(true)}>
              Подписать заново
            </Button>
          </div>
          <PdfLine signing={current} isReplaced />
        </>
      ) : (
        <>
          <Facts
            rows={[
              {
                label: 'Подписал',
                value: [
                  current.clientName,
                  current.clientPhone === null
                    ? null
                    : formatPhone(current.clientPhone),
                ]
                  .filter(Boolean)
                  .join(', '),
              },
              {
                label: 'Когда',
                value:
                  current.signedAt === null
                    ? '—'
                    : formatSigningTime(new Date(current.signedAt)),
              },
              {
                label: 'На устройстве',
                value: [current.signedBy, current.device?.split(' · ')[0]]
                  .filter(Boolean)
                  .join(', '),
              },
              {
                label: 'Сумма',
                value:
                  current.total === null ? '—' : formatMoney(current.total),
              },
              {
                label: 'Шаблон',
                value:
                  current.templateVersion === null
                    ? '—'
                    : `Версия ${current.templateVersion}`,
              },
              {
                label: 'Код проверки',
                value:
                  current.checkCode === null
                    ? '—'
                    : shortCheckCode(current.checkCode),
              },
            ]}
          />
          <PdfLine signing={current} isReplaced={false} />
          {current.pdfUrl === null ? (
            <Hint tone="danger" text="PDF не найден в заказе" />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
              <a
                href={current.pdfUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 48,
                  padding: `0 ${SPACE.lg}px`,
                  borderRadius: RADIUS.control,
                  background: colors.accent,
                  color: colors.onAccent,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Открыть PDF
              </a>
              <Button onClick={() => share(current)}>Поделиться</Button>
            </div>
          )}
        </>
      )}
      {older.map((signing) => (
        <PdfLine key={signing.id} signing={signing} isReplaced />
      ))}
    </div>
  );
};

export const OrderContract = () => {
  const selectedRecordIds = useSelectedRecordIds();

  if (selectedRecordIds.length !== 1) return null;

  return (
    <OrderContractOf
      key={selectedRecordIds[0]}
      orderId={selectedRecordIds[0]}
    />
  );
};
