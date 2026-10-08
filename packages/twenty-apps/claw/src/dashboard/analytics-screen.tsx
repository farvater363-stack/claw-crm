import { useCallback, useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { AppPath, navigate } from 'twenty-sdk/front-component';

import {
  ANALYTICS_PERIODS,
  type AnalyticsPeriod,
  buildFunnel,
  buildKinds,
  buildMeasurers,
  buildMetrics,
  buildMonthBars,
  buildRefusals,
  buildSources,
  buildStageDays,
  type MetricKey,
  type MetricView,
  periodRanges,
} from 'src/dashboard/analytics';
import {
  ArrowButton,
  BarRow,
  Bars,
  Card,
  CheckLine,
  DataTable,
  DropCount,
  FunnelDrop,
  FunnelStep,
  MonthBarsChart,
  QuietLine,
  Segmented,
  TextButton,
  TileGrid,
  TrendTile,
  CompactContext,
  TWO_COLUMNS_FROM_WIDTH,
  TwoColumns,
  type ValueTone,
} from 'src/dashboard/dashboard-ui';
import {
  type AnalyticsData,
  findPageIds,
  loadAnalytics,
  type PageIds,
} from 'src/dashboard/load-dashboard';
import { useElementWidth } from 'src/measurer-form/measurer-form-ui';
import { formatWhole } from 'src/ui/format';
import { ErrorNote, SkeletonRows, usePalette } from 'src/ui/kit';
import { COLUMNS_MIN_WIDTH, SPACE, TYPE } from 'src/ui/tokens';
import { isAccessError } from 'src/utils/is-access-error';

const LOAD_FAILED =
  'Не удалось загрузить аналитику. Проверьте интернет и нажмите «Повторить»';
const NO_ACCESS = 'Этот экран видит только владелец';
const DASH = '—';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; text: string }
  | { status: 'ready'; data: AnalyticsData };

const money = (value: number | null) =>
  value === null ? DASH : formatWhole(value);
const percent = (value: number | null) => (value === null ? DASH : `${value}%`);
const area = (value: number | null) =>
  value === null
    ? DASH
    : value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const days = (value: number | null) =>
  value === null
    ? DASH
    : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} дн`;

const TILES: {
  key: MetricKey;
  label: string;
  format: (value: number | null) => string;
}[] = [
  { key: 'sold', label: 'Продано', format: money },
  { key: 'received', label: 'Получено денег', format: money },
  { key: 'average', label: 'Средний чек', format: money },
  { key: 'conversion', label: 'Замер → продажа', format: percent },
  { key: 'area', label: 'Сделано м²', format: area },
  { key: 'revenue', label: 'Выручка (готовые)', format: money },
  { key: 'margin', label: 'Заработали на заказах', format: money },
  { key: 'onTime', label: 'Сдано в срок', format: percent },
];

const levelOf = (value: number, values: number[]) =>
  value / Math.max(1, ...values);

export const AnalyticsScreen = () => {
  const colors = usePalette();
  const { ref, width } = useElementWidth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [pageIds, setPageIds] = useState<PageIds>({});
  const [period, setPeriod] = useState<AnalyticsPeriod>('month');
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      setState({
        status: 'ready',
        data: await loadAnalytics(new CoreApiClient()),
      });
    } catch (caught) {
      setState({
        status: 'error',
        text: isAccessError(caught) ? NO_ACCESS : LOAD_FAILED,
      });
    }
  }, []);

  useEffect(() => {
    void load();
    findPageIds(new MetadataApiClient())
      .then(setPageIds)
      .catch(() => setPageIds({}));
  }, [load]);

  const isWide = width >= TWO_COLUMNS_FROM_WIDTH;
  const isCompact = width > 0 && width < COLUMNS_MIN_WIDTH;

  if (state.status !== 'ready') {
    return (
      <div ref={ref} style={{ padding: SPACE.lg }}>
        {state.status === 'loading' ? (
          <SkeletonRows count={6} />
        ) : (
          <ErrorNote text={state.text} onRetry={() => void load()} />
        )}
      </div>
    );
  }

  const { data } = state;
  const source = { orders: data.orders, payments: data.payments };
  const ranges = periodRanges(period, offset, data.today);
  const metrics = buildMetrics(source, ranges, data.today);
  const bars = buildMonthBars(
    source,
    ranges,
    data.today,
    period === 'year' ? 12 : 6,
  );
  const funnel = buildFunnel(data.orders, ranges.current);
  const sources = buildSources(data.orders, ranges.current);
  const measurers = buildMeasurers(data.orders, ranges.current);
  const refusals = buildRefusals(data.orders, ranges.current);
  const stageDays = buildStageDays(data.orders, ranges.current);
  const kinds = buildKinds(data.orders, data.items, ranges.current);
  const { checks } = data;
  const isCostComplete =
    checks.materials.priced === checks.materials.total &&
    checks.designs.withComposition === checks.designs.total &&
    checks.masters.withRate === checks.masters.total;
  const checkCount = [
    checks.materials.priced === checks.materials.total,
    checks.designs.withComposition === checks.designs.total,
    checks.masters.withRate === checks.masters.total,
  ].filter(Boolean).length;
  const openPage = (key: keyof PageIds) => {
    const pageLayoutId = pageIds[key];

    if (pageLayoutId !== undefined) {
      void navigate(AppPath.PageLayoutPage, { pageLayoutId });
    }
  };

  const tile = ({ key, label, format }: (typeof TILES)[number]) => {
    const metric: MetricView = metrics[key];
    const isMarginUnsure = key === 'margin' && !isCostComplete;
    const tone: ValueTone = isMarginUnsure ? 'muted' : 'plain';

    return (
      <TrendTile
        key={key}
        label={label}
        value={format(metric.value)}
        series={metric.series}
        change={isMarginUnsure ? null : metric.change}
        tone={tone}
        note={
          isMarginUnsure
            ? 'не хватает данных, см. внизу'
            : metric.value === null
              ? key === 'conversion'
                ? 'никто не решил после замера'
                : 'нет заказов за период'
              : metric.change === null
                ? 'не с чем сравнить'
                : ranges.compareLabel
        }
      />
    );
  };

  return (
    <CompactContext.Provider value={isCompact}>
      <div
        ref={ref}
        style={{
          padding: isCompact ? SPACE.sm : SPACE.lg,
          maxWidth: 1180,
          margin: '0 auto',
          ...TYPE.body,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: SPACE.md,
            marginBottom: SPACE.lg,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                ...TYPE.title,
                fontSize: '26px',
                lineHeight: '32px',
                fontWeight: 800,
              }}
            >
              Аналитика
            </h2>
            <div
              style={{
                ...TYPE.label,
                color: colors.muted,
                marginTop: SPACE.xs,
              }}
            >
              {ranges.isOngoing
                ? 'Период ещё идёт: сравнение с тем же днём прошлого периода'
                : 'Сравнение с периодом до этого'}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: SPACE.md,
            }}
          >
            <Segmented<AnalyticsPeriod>
              value={period}
              options={ANALYTICS_PERIODS}
              onChange={(next) => {
                setPeriod(next);
                setOffset(0);
              }}
            />
            <div
              style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}
            >
              <ArrowButton label="Раньше" onClick={() => setOffset(offset - 1)}>
                ‹
              </ArrowButton>
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                {ranges.label}
              </span>
              <ArrowButton
                label="Позже"
                isDisabled={offset >= 0}
                onClick={() => setOffset(Math.min(0, offset + 1))}
              >
                ›
              </ArrowButton>
            </div>
          </div>
        </div>

        <TileGrid isWide={isWide}>{TILES.map(tile)}</TileGrid>

        <TwoColumns
          isWide={isWide}
          left={
            <Card title="Продажи и деньги по месяцам" subtitle="млн сум">
              <MonthBarsChart
                bars={bars.map((bar) => ({
                  label: bar.label,
                  first: bar.sold,
                  second: bar.received,
                  isOngoing: bar.isOngoing,
                }))}
                firstLabel="Продано (клиент согласился)"
                secondLabel="Получено денег"
              />
            </Card>
          }
          right={
            <Card title="Воронка" subtitle="заявки за период">
              {funnel.leads === 0 ? (
                <QuietLine text="За период заявок не было." />
              ) : (
                <div style={{ display: 'grid', gap: SPACE.sm }}>
                  <FunnelStep label="Заявки" count={funnel.leads} level={1} />
                  {funnel.notMeasured > 0 ? (
                    <FunnelDrop>
                      не дошли до замера{' '}
                      <DropCount value={funnel.notMeasured} />
                    </FunnelDrop>
                  ) : null}
                  <FunnelStep
                    label="Замер сделан"
                    count={funnel.measured}
                    level={funnel.measured / funnel.leads}
                  />
                  {funnel.refusedAfterMeasure + funnel.thinking > 0 ? (
                    <FunnelDrop>
                      отказались после замера{' '}
                      <DropCount value={funnel.refusedAfterMeasure} />, думают
                      ещё <b>{funnel.thinking}</b>
                    </FunnelDrop>
                  ) : null}
                  <FunnelStep
                    label="Продано"
                    count={funnel.sold}
                    level={funnel.sold / funnel.leads}
                  />
                  <FunnelStep
                    label="Установлено"
                    count={funnel.installed}
                    level={funnel.installed / funnel.leads}
                  />
                </div>
              )}
            </Card>
          }
        />

        <Card
          title="Откуда клиенты"
          action={
            pageIds.marketing !== undefined ? (
              <TextButton onClick={() => openPage('marketing')}>
                Маркетинг
              </TextButton>
            ) : undefined
          }
        >
          {sources.length === 0 ? (
            <QuietLine text="За период заявок не было." />
          ) : (
            <DataTable
              rows={sources}
              rowKey={(row) => row.label}
              columns={[
                { title: 'Источник', render: (row) => row.label },
                { title: 'Заявки', isNumber: true, render: (row) => row.leads },
                { title: 'Продано', isNumber: true, render: (row) => row.sold },
                {
                  title: 'Конверсия',
                  isNumber: true,
                  render: (row) => percent(row.conversionPercent),
                },
                {
                  title: 'Сумма продаж',
                  isNumber: true,
                  render: (row) => formatWhole(row.revenue),
                },
                {
                  title: 'Ср. чек',
                  isNumber: true,
                  render: (row) => money(row.averageOrder),
                },
              ]}
            />
          )}
        </Card>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isWide
              ? 'repeat(2, minmax(0, 1fr))'
              : 'minmax(0, 1fr)',
            columnGap: SPACE.lg,
          }}
        >
          <Card title="Замерщики" subtitle="замеры за период">
            {measurers.length === 0 ? (
              <QuietLine text="За период замеров не было." />
            ) : (
              <DataTable
                minWidth={360}
                rows={measurers}
                rowKey={(row) => row.name}
                columns={[
                  { title: 'Кто', render: (row) => row.name },
                  {
                    title: 'Замеров',
                    isNumber: true,
                    render: (row) => row.measured,
                  },
                  {
                    title: 'Продано',
                    isNumber: true,
                    render: (row) => row.sold,
                  },
                  {
                    title: 'Конверсия',
                    isNumber: true,
                    render: (row) => percent(row.conversionPercent),
                  },
                  {
                    title: 'Ср. чек',
                    isNumber: true,
                    render: (row) => money(row.averageOrder),
                  },
                ]}
              />
            )}
          </Card>

          <Card
            title="Почему отказываются"
            subtitle="отменённые заявки периода"
          >
            {refusals.length === 0 ? (
              <QuietLine text="Отказов не было." />
            ) : (
              <Bars>
                {refusals.map((row) => (
                  <BarRow
                    key={row.label}
                    label={row.label}
                    value={String(row.count)}
                    level={levelOf(
                      row.count,
                      refusals.map((other) => other.count),
                    )}
                    accent="danger"
                  />
                ))}
              </Bars>
            )}
          </Card>

          <Card
            title="Сколько дней занимает заказ"
            subtitle="в среднем, по шагам"
          >
            <Bars>
              {stageDays.stages.map((stage) => (
                <BarRow
                  key={stage.label}
                  label={stage.label}
                  value={days(stage.days)}
                  level={levelOf(
                    stage.days ?? 0,
                    stageDays.stages.map((other) => other.days ?? 0),
                  )}
                />
              ))}
            </Bars>
            <QuietLine
              text={
                stageDays.decisionToInstall === null
                  ? 'За период установок не было.'
                  : `От решения клиента до установки в среднем ${days(stageDays.decisionToInstall)}.`
              }
            />
          </Card>

          <Card title="Что берут" subtitle="м² у проданных за период">
            {kinds.length === 0 ? (
              <QuietLine text="За период продаж не было." />
            ) : (
              <Bars>
                {kinds.map((row) => (
                  <BarRow
                    key={row.label}
                    label={row.label}
                    value={`${area(row.area)} м²`}
                    level={levelOf(
                      row.area,
                      kinds.map((other) => other.area),
                    )}
                  />
                ))}
              </Bars>
            )}
          </Card>
        </div>

        <Card
          title="Чтобы прибыль считалась верно"
          subtitle={`${checkCount + 1} из 4 заполнено`}
        >
          <div>
            <CheckLine isDone>
              Цены продажи и оплаты записаны в заказах
            </CheckLine>
            <CheckLine
              isDone={checks.materials.priced === checks.materials.total}
            >
              Цены закупки материалов: {checks.materials.priced} из{' '}
              {checks.materials.total}. Вносятся при приходе на «Склад».
            </CheckLine>
            <CheckLine
              isDone={checks.designs.withComposition === checks.designs.total}
            >
              Материалы на 1 м² у решёток: {checks.designs.withComposition} из{' '}
              {checks.designs.total}. Заполняются в «Ценах».
            </CheckLine>
            <CheckLine
              isDone={checks.masters.withRate === checks.masters.total}
            >
              Ставки цеха: есть у {checks.masters.withRate} из{' '}
              {checks.masters.total} мастеров. Заполняются в «ЗП».
            </CheckLine>
          </div>
          <QuietLine text="Выручка считает заказы, дошедшие до «Готов». Касса и чистая прибыль с расходами будут в «Деньгах»." />
        </Card>
      </div>
    </CompactContext.Provider>
  );
};
