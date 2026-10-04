import { useCallback, useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';

import { isInProduction } from 'src/constants/order-status-sets';
import { IDS } from 'src/constants/universal-identifiers';
import { todayInTashkent } from 'src/pricing/dates';
import {
  Button,
  ErrorNote,
  Hint,
  InlineConfirm,
  Screen,
  Section,
  SkeletonRows,
  StaticRow,
  usePalette,
  WallCard,
} from 'src/ui/kit';
import { SPACE, TYPE } from 'src/ui/tokens';
import { isAccessError } from 'src/utils/is-access-error';
import {
  loadWorkshopOrders,
  markReady,
} from 'src/workshop/load-workshop-board';
import {
  buildWorkshopBoard,
  type WorkshopOrder,
} from 'src/workshop/workshop-board';

const RELOAD_MILLISECONDS = 60_000;
// One master's column is never narrower than this, or than a phone's screen
const COLUMN_MIN_WIDTH = 280;
const LOAD_ERROR =
  'Не удалось загрузить заказы. Проверьте интернет и нажмите "Повторить"';
const SAVE_ERROR =
  'Не удалось сохранить. Проверьте интернет и нажмите "Повторить"';
const NO_RIGHTS = 'Нет прав на этот шаг';

type WriteError = { orderId: string; text: string; canRetry: boolean };

const WorkshopBoard = () => {
  const colors = usePalette();
  const [orders, setOrders] = useState<WorkshopOrder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<WriteError | null>(null);
  // The timer, a write and «Повторить» all read, and a slow answer may come
  // after a newer one. Only the read that started last is shown.
  const latestRead = useRef(0);
  // State read inside a handler is the one of the render that made the
  // handler; a second tap in the same render would pass a check on it. A ref
  // is current.
  const isWriting = useRef(false);

  const load = useCallback(async () => {
    latestRead.current += 1;

    const read = latestRead.current;

    try {
      const loaded = await loadWorkshopOrders(new CoreApiClient());

      if (read !== latestRead.current) return;

      const isOnWall = (orderId: string) =>
        loaded.some(
          (order) => order.id === orderId && isInProduction(order.status),
        );

      setOrders(loaded);
      setLoadError(null);
      // A question and a note stay through a reload while their card does;
      // when the card has left the wall they have nothing to be about.
      setConfirmingId((current) =>
        current !== null && isOnWall(current) ? current : null,
      );
      setWriteError((current) =>
        current !== null && isOnWall(current.orderId) ? current : null,
      );
    } catch {
      // The last board that was read stays under the note
      if (read === latestRead.current) setLoadError(LOAD_ERROR);
    }
  }, []);

  useEffect(() => {
    void load();

    const timer = setInterval(() => void load(), RELOAD_MILLISECONDS);

    return () => {
      clearInterval(timer);
      // An answer that comes after the screen is gone is dropped
      latestRead.current += 1;
    };
  }, [load]);

  const confirmReady = async (orderId: string) => {
    if (isWriting.current) return;

    isWriting.current = true;
    setBusyId(orderId);
    setWriteError(null);

    try {
      await markReady(new CoreApiClient(), orderId);
      setConfirmingId((current) => (current === orderId ? null : current));
    } catch (error) {
      const isDenied = isAccessError(error);

      setWriteError({
        orderId,
        text: isDenied ? NO_RIGHTS : SAVE_ERROR,
        // Trying again cannot help a login that may not make the change.
        canRetry: !isDenied,
      });
    }

    // After a failure too: a write whose answer was lost may be stored, and
    // the read shows where the order really is.
    await load();
    isWriting.current = false;
    setBusyId(null);
  };

  const board = buildWorkshopBoard(orders ?? [], todayInTashkent());

  return (
    <Screen title="В работе" isWide>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: SPACE.xl,
        }}
      >
        {orders === null && loadError === null ? (
          <SkeletonRows count={4} />
        ) : null}
        {loadError !== null ? (
          <ErrorNote text={loadError} onRetry={() => void load()} />
        ) : null}
        {orders !== null && board.columns.length === 0 ? (
          <Hint text="Сейчас в производстве нет заказов." />
        ) : null}
        {board.columns.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fit, minmax(min(${COLUMN_MIN_WIDTH}px, 100%), 1fr))`,
              gap: SPACE.xl,
              alignItems: 'start',
            }}
          >
            {board.columns.map((column) => (
              <section key={column.key}>
                <h3
                  style={{
                    margin: `0 0 ${SPACE.md}px`,
                    ...TYPE.wallRowTitle,
                  }}
                >
                  {column.title}
                </h3>
                {column.cards.map((card) => (
                  <WallCard
                    key={card.id}
                    title={card.name}
                    note={card.daysLeftText}
                    tone={card.tone}
                    lines={card.lines}
                  >
                    {writeError?.orderId === card.id ? (
                      <ErrorNote
                        text={writeError.text}
                        onRetry={
                          writeError.canRetry
                            ? () => void confirmReady(card.id)
                            : undefined
                        }
                      />
                    ) : null}
                    {confirmingId === card.id ? (
                      <InlineConfirm
                        question={`Готов заказ ${card.name}?`}
                        confirmText="Да, готов"
                        cancelText="Нет"
                        confirmVariant="primary"
                        isBusy={busyId === card.id}
                        onConfirm={() => void confirmReady(card.id)}
                        onCancel={() => {
                          setConfirmingId(null);
                          setWriteError(null);
                        }}
                      />
                    ) : (
                      <div>
                        <Button
                          isBusy={busyId === card.id}
                          onClick={() => setConfirmingId(card.id)}
                        >
                          Готово
                        </Button>
                      </div>
                    )}
                  </WallCard>
                ))}
              </section>
            ))}
          </div>
        ) : null}
        {board.sent.length > 0 ? (
          <Section title="Отправлены на установку">
            {board.sent.map((sentOrder) => (
              <StaticRow key={sentOrder.id}>
                <span>{[sentOrder.name, ...sentOrder.lines].join(' · ')}</span>
                <span style={{ color: colors.muted }}>
                  {sentOrder.installerName === null
                    ? 'Установщик не выбран'
                    : `Установщик: ${sentOrder.installerName}`}
                </span>
              </StaticRow>
            ))}
          </Section>
        ) : null}
      </div>
    </Screen>
  );
};

export default defineFrontComponent({
  universalIdentifier: IDS.workshop.frontComponent,
  name: 'workshop-board',
  description: 'В работе: что делает цех и к какому сроку',
  component: WorkshopBoard,
});
