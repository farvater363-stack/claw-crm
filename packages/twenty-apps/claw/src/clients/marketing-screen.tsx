import { useCallback, useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';

import {
  type ClientListIds,
  findClientListIds,
  loadMarketing,
  type MarketingData,
} from 'src/clients/load-clients';
import {
  clientTotals,
  MARKETING_PERIODS,
  type MarketingPeriod,
  sourceRows,
} from 'src/clients/marketing';
import { todayInTashkent } from 'src/pricing/dates';
import { formatMoney } from 'src/ui/format';
import {
  AmountLine,
  ErrorNote,
  Hint,
  Link,
  Row,
  Screen,
  Section,
  SkeletonRows,
  StaticRow,
  Tabs,
} from 'src/ui/kit';
import { SPACE } from 'src/ui/tokens';
import { isAccessError } from 'src/utils/is-access-error';

const LOAD_FAILED =
  'Не удалось загрузить маркетинг. Проверьте интернет и нажмите "Повторить"';
const NO_ACCESS = 'Доступно владельцу и менеджеру';
const EXPORT_HINT =
  'Откройте список, нажмите «⋯» справа вверху и выберите «Экспорт»: получится файл с именами и телефонами.';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; text: string }
  | { status: 'ready'; data: MarketingData; listIds: ClientListIds };

const listHref = (viewId: string | undefined) =>
  viewId === undefined ? '/objects/people' : `/objects/people?viewId=${viewId}`;

export const MarketingScreen = () => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [period, setPeriod] = useState<MarketingPeriod>('quarter');
  const [openSource, setOpenSource] = useState<string | null>(null);
  const today = todayInTashkent();

  const load = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      const [data, listIds] = await Promise.all([
        loadMarketing(new CoreApiClient()),
        // Without the list ids the links open the plain client list.
        findClientListIds(new MetadataApiClient()).catch(
          (): ClientListIds => ({}),
        ),
      ]);

      setState({ status: 'ready', data, listIds });
    } catch (caught) {
      setState({
        status: 'error',
        text: isAccessError(caught) ? NO_ACCESS : LOAD_FAILED,
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <Screen title="Маркетинг">
        <SkeletonRows count={5} />
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen title="Маркетинг">
        <ErrorNote text={state.text} onRetry={() => void load()} />
      </Screen>
    );
  }

  const rows = sourceRows(state.data.orders, period, today);
  const totals = clientTotals(state.data.clients);

  return (
    <Screen title="Маркетинг">
      <div style={{ marginBottom: SPACE.xl }}>
        <Tabs<MarketingPeriod>
          value={period}
          options={MARKETING_PERIODS}
          onChange={setPeriod}
        />
      </div>

      <Section title="Откуда приходят клиенты">
        {rows.length === 0 ? (
          <StaticRow>
            <Hint text="За этот срок заказов нет." />
          </StaticRow>
        ) : (
          rows.map((row) => {
            const key = row.source ?? 'none';

            return (
              <Row
                key={key}
                title={row.label}
                value={formatMoney(row.revenue)}
                pill={
                  row.conversionPercent !== null ? (
                    <span>{`${row.sold} из ${row.leads} купили, ${row.conversionPercent}%`}</span>
                  ) : undefined
                }
                isOpen={openSource === key}
                onToggle={() =>
                  setOpenSource((current) => (current === key ? null : key))
                }
              >
                <AmountLine amount={String(row.leads)}>Обращений</AmountLine>
                <AmountLine amount={String(row.measured)}>Замеров</AmountLine>
                <AmountLine amount={String(row.sold)}>Купили</AmountLine>
                <AmountLine amount={formatMoney(row.revenue)}>
                  Выручка
                </AmountLine>
                {row.averageOrder !== null ? (
                  <AmountLine amount={formatMoney(row.averageOrder)}>
                    Средний чек
                  </AmountLine>
                ) : null}
                {row.topRefusal !== null ? (
                  <Hint text={`Чаще всего отказывают: ${row.topRefusal}`} />
                ) : null}
              </Row>
            );
          })
        )}
      </Section>

      <Section title="Клиенты за всё время">
        <StaticRow>
          <AmountLine amount={String(totals.buyers)}>Купили</AmountLine>
          <AmountLine amount={String(totals.repeat)}>
            Купили повторно
          </AmountLine>
        </StaticRow>
        {totals.topClients.length > 0 ? (
          <StaticRow>
            <Hint text="Лучшие клиенты" />
            {totals.topClients.map((client) => (
              <AmountLine
                key={client.id}
                amount={formatMoney(client.totalSpent)}
              >
                <Link href={`/object/person/${client.id}`}>{client.name}</Link>
              </AmountLine>
            ))}
          </StaticRow>
        ) : null}
        {totals.topReferrers.length > 0 ? (
          <StaticRow>
            <Hint text="Приводят знакомых" />
            {totals.topReferrers.map(({ client, count }) => (
              <AmountLine key={client.id} amount={String(count)}>
                <Link href={`/object/person/${client.id}`}>{client.name}</Link>
              </AmountLine>
            ))}
          </StaticRow>
        ) : null}
      </Section>

      <Section title="Списки для рассылки">
        <StaticRow>
          <Link href={listHref(state.listIds.clientsCanMessage)}>
            Можно писать
          </Link>
          <Link href={listHref(state.listIds.clientsOwe)}>Должны нам</Link>
          <Link href={listHref(state.listIds.clients)}>Все клиенты</Link>
          <Hint text={EXPORT_HINT} />
        </StaticRow>
      </Section>
    </Screen>
  );
};
