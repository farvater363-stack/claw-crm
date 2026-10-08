import { type ReactNode, useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';

import {
  createMoneyEntry,
  loadMoneyBooks,
  type MoneyBooks,
} from 'src/money/load-money-books';
import {
  cashHolders,
  dueSoon,
  recurringBadge,
  type RecurringRecord,
} from 'src/money/money-books';
import { recurringPayment } from 'src/money/money-forms';
import { todayInTashkent } from 'src/pricing/dates';
import { formatDayMonth, formatMoney } from 'src/ui/format';
import {
  Button,
  ErrorNote,
  Hint,
  SkeletonRows,
  StatePill,
  usePalette,
} from 'src/ui/kit';
import { SPACE, TABULAR_NUMBERS, TYPE } from 'src/ui/tokens';
import { isAccessError } from 'src/utils/is-access-error';
import { randomUuid } from 'src/utils/random-uuid';

type LoadState =
  | { status: 'loading' }
  | { status: 'hidden' }
  | { status: 'error' }
  | { status: 'ready'; books: MoneyBooks };

const loadState = async (): Promise<LoadState> => {
  try {
    return {
      status: 'ready',
      books: await loadMoneyBooks(new CoreApiClient()),
    };
  } catch (error) {
    console.error(error);

    // Money is the owner's; anyone else sees nothing here.
    return isAccessError(error) ? { status: 'hidden' } : { status: 'error' };
  }
};

const Line = ({
  title,
  detail,
  side,
}: {
  title: string;
  detail: string;
  side: ReactNode;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: SPACE.sm,
        padding: `${SPACE.sm}px 0`,
        borderTop: `1px solid ${colors.border}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <b>{title}</b>
        <div style={{ ...TYPE.label, color: colors.muted }}>{detail}</div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: SPACE.sm,
          ...TABULAR_NUMBERS,
        }}
      >
        {side}
      </div>
    </div>
  );
};

// «Сегодня»: what has to be paid now, and who still holds client cash.
export const MoneyToday = () => {
  const colors = usePalette();
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const attempts = useRef<Record<string, string>>({});

  useEffect(() => {
    void loadState().then(setLoad);
  }, []);

  if (load.status === 'loading') return <SkeletonRows count={3} />;

  if (load.status === 'hidden') return null;

  if (load.status === 'error') {
    return (
      <ErrorNote
        text="Не удалось загрузить деньги"
        onRetry={() => {
          setLoad({ status: 'loading' });
          void loadState().then(setLoad);
        }}
      />
    );
  }

  const today = todayInTashkent();
  const due = dueSoon(load.books.recurring, load.books.entries, today);
  const holders = cashHolders(load.books);

  const pay = (item: RecurringRecord) => {
    if (busyId !== null) return;

    // A retry after a lost answer overwrites the same record.
    attempts.current[item.id] ??= randomUuid();
    setBusyId(item.id);
    setFailedId(null);
    void createMoneyEntry(
      new CoreApiClient(),
      attempts.current[item.id] ?? randomUuid(),
      recurringPayment(item, today),
    )
      .then(async () => {
        delete attempts.current[item.id];
        setLoad(await loadState());
      })
      .catch((error) => {
        console.error(error);
        setFailedId(item.id);
      })
      .finally(() => setBusyId(null));
  };

  return (
    <div style={{ color: colors.text, ...TYPE.body }}>
      {due.length === 0 && holders.length === 0 ? (
        <Hint text="Сегодня платить ничего не нужно, все деньги сданы." />
      ) : null}
      {due.length > 0 ? (
        <div style={{ marginBottom: SPACE.md }}>
          <div style={{ ...TYPE.label, color: colors.muted }}>
            Постоянные расходы
          </div>
          {due.map(({ item, state }) => {
            const badge = recurringBadge(state);

            return (
              <div key={item.id}>
                <Line
                  title={item.name}
                  detail={`${formatMoney(item.amount ?? 0)}, до ${formatDayMonth(state.dueDate)}`}
                  side={
                    <>
                      <StatePill tone={badge.tone} text={badge.text} />
                      <Button
                        variant="primary"
                        isBusy={busyId === item.id}
                        onClick={() => pay(item)}
                      >
                        Оплачено
                      </Button>
                    </>
                  }
                />
                {failedId === item.id ? (
                  <ErrorNote
                    text="Не удалось записать"
                    onRetry={() => pay(item)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {holders.length > 0 ? (
        <div>
          <div style={{ ...TYPE.label, color: colors.muted }}>
            Деньги у работников
          </div>
          {holders.map((holder) => (
            <Line
              key={holder.workerId}
              title={holder.name}
              detail={
                holder.since === null
                  ? 'ещё не сдал'
                  : `держит с ${formatDayMonth(holder.since)}`
              }
              side={<b>{formatMoney(holder.amount)}</b>}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};
