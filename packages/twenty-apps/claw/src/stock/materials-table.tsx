import { Fragment, type ReactNode } from 'react';

import { type StockPrices, type StockRow } from 'src/stock/stock-screen';
import { formatWhole } from 'src/ui/format';
import { StatePill, usePalette } from 'src/ui/kit';
import { SPACE, TABULAR_NUMBERS, TYPE } from 'src/ui/tokens';

const UNNAMED = 'Без названия';

// Below this the columns no longer fit and the screen shows rows instead.
export const MATERIALS_TABLE_MIN_WIDTH = 720;

export const MaterialsTable = ({
  rows,
  prices,
  canSeeMoney,
  openId,
  settlingIds,
  onToggle,
  renderOpen,
}: {
  rows: StockRow[];
  prices: StockPrices;
  canSeeMoney: boolean;
  openId: string | null;
  settlingIds: string[];
  onToggle: (rowId: string) => void;
  renderOpen: (row: StockRow) => ReactNode;
}) => {
  const colors = usePalette();
  const columns = canSeeMoney
    ? 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1.2fr) 150px'
    : 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.3fr) 150px';
  const line = {
    display: 'grid',
    gridTemplateColumns: columns,
    gap: SPACE.md,
    alignItems: 'center',
    padding: `${SPACE.sm}px ${SPACE.lg}px`,
    borderTop: `1px solid ${colors.border}`,
  } as const;
  const number = {
    ...TABULAR_NUMBERS,
    textAlign: 'right',
    whiteSpace: 'nowrap',
  } as const;
  const heading = {
    ...TYPE.label,
    color: colors.muted,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontSize: '12px',
  } as const;

  return (
    <div role="table" aria-label="Что лежит на складе">
      <div role="row" style={line}>
        <span role="columnheader" style={heading}>
          Материал
        </span>
        <span role="columnheader" style={{ ...heading, textAlign: 'right' }}>
          Есть
        </span>
        <span role="columnheader" style={{ ...heading, textAlign: 'right' }}>
          Нужно на заказы
        </span>
        {canSeeMoney ? (
          <>
            <span
              role="columnheader"
              style={{ ...heading, textAlign: 'right' }}
            >
              Средняя цена
            </span>
            <span
              role="columnheader"
              style={{ ...heading, textAlign: 'right' }}
            >
              На сумму
            </span>
          </>
        ) : null}
        <span role="columnheader" style={heading} />
      </div>
      {rows.map((row) => {
        const isOpen = openId === row.id;
        const price = prices[row.id]?.average ?? prices[row.id]?.last ?? null;

        return (
          <Fragment key={row.id}>
            <button
              type="button"
              role="row"
              aria-expanded={isOpen}
              onClick={() => onToggle(row.id)}
              style={{
                ...line,
                width: '100%',
                minHeight: 48,
                background: isOpen ? colors.panel : 'transparent',
                border: 'none',
                borderTop: `1px solid ${colors.border}`,
                color: colors.text,
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {row.name || UNNAMED}
              </span>
              <span style={number}>{row.onHandText}</span>
              <span style={number}>{row.reservedText}</span>
              {canSeeMoney ? (
                <>
                  <span style={number}>
                    {price === null ? '—' : formatWhole(price)}
                  </span>
                  <span style={number}>
                    {price === null
                      ? '—'
                      : formatWhole(Math.max(row.onHand, 0) * price)}
                  </span>
                </>
              ) : null}
              <span>
                {settlingIds.includes(row.id) ? (
                  <StatePill tone="neutral" text="Обновляем…" />
                ) : (
                  <StatePill tone={row.pill.tone} text={row.pill.text} />
                )}
              </span>
            </button>
            {isOpen ? (
              <div
                style={{
                  display: 'grid',
                  gap: SPACE.md,
                  padding: `0 ${SPACE.lg}px ${SPACE.lg}px`,
                  background: colors.panel,
                }}
              >
                {renderOpen(row)}
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
};
