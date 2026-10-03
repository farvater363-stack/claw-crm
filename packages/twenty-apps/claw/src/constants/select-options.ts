const toOptions = <TValue extends string, TColor extends string>(
  entries: ReadonlyArray<readonly [TValue, string, TColor]>,
) =>
  entries.map(([value, label, color], position) => ({
    value,
    label,
    color,
    position,
  }));

export const METAL_OPTIONS = toOptions([
  ['ROD', 'Прут', 'blue'],
  ['PROFILE', 'Профиль', 'green'],
  ['REBAR', 'Арматура', 'orange'],
] as const);

export const METAL_SIZE_OPTIONS = toOptions([
  ['SIZE_8', '8', 'gray'],
  ['SIZE_10', '10', 'gray'],
  ['SIZE_15_15', '15/15', 'gray'],
] as const);

export const DISTRICT_OPTIONS = toOptions([
  ['ALMAZAR', 'Алмазарский', 'gray'],
  ['BEKTEMIR', 'Бектемирский', 'gray'],
  ['MIRABAD', 'Мирабадский', 'gray'],
  ['MIRZO_ULUGBEK', 'Мирзо-Улугбекский', 'gray'],
  ['SERGELI', 'Сергелийский', 'gray'],
  ['UCHTEPA', 'Учтепинский', 'gray'],
  ['CHILANZAR', 'Чиланзарский', 'gray'],
  ['SHAYKHANTAKHUR', 'Шайхантахурский', 'gray'],
  ['YUNUSABAD', 'Юнусабадский', 'gray'],
  ['YAKKASARAY', 'Яккасарайский', 'gray'],
  ['YASHNABAD', 'Яшнабадский', 'gray'],
  ['YANGIHAYOT', 'Янгихаётский', 'gray'],
] as const);

export const SOURCE_OPTIONS = toOptions([
  ['OLX', 'OLX', 'purple'],
  ['INSTAGRAM', 'Instagram', 'pink'],
  ['FACEBOOK', 'Facebook', 'blue'],
  ['TELEGRAM', 'Telegram', 'sky'],
  ['REFERRAL', 'Через знакомых', 'green'],
  ['CALL', 'Звонок', 'yellow'],
  ['WEBSITE', 'Сайт', 'turquoise'],
] as const);

export const ORDER_STATUS_OPTIONS = toOptions([
  ['NEW', 'Новый', 'gray'],
  ['MEASUREMENT_SCHEDULED', 'Замер назначен', 'blue'],
  ['MEASURED', 'Замер выполнен', 'sky'],
  ['PRICE_APPROVAL', 'Согласование цены', 'yellow'],
  ['PRODUCTION', 'Производство', 'orange'],
  ['QUALITY_CHECK', 'Проверка качества', 'purple'],
  ['READY', 'Готов', 'turquoise'],
  ['INSTALLED', 'Установлен', 'green'],
  ['CLOSED', 'Закрыт', 'green'],
  ['CANCELLED', 'Отменен', 'red'],
] as const);

export type OrderStatus = (typeof ORDER_STATUS_OPTIONS)[number]['value'];

export const EXTRA_SERVICE_UNIT_OPTIONS = toOptions([
  ['FIXED', 'Фикс', 'gray'],
  ['PER_SQUARE_METER', 'За м²', 'blue'],
  ['PER_PIECE', 'За шт', 'green'],
  ['PER_RUNNING_METER', 'За п.м.', 'orange'],
] as const);

export type ExtraServiceUnit =
  (typeof EXTRA_SERVICE_UNIT_OPTIONS)[number]['value'];

export const DESIGN_CATALOG_OPTIONS = toOptions([
  ['MAIN', 'Основной', 'gray'],
] as const);

export const DEADLINE_STATE_OPTIONS = toOptions([
  ['ON_TIME', 'В срок', 'green'],
  ['DUE_TODAY', 'Срок сегодня', 'orange'],
  ['OVERDUE', 'Просрочен', 'red'],
] as const);

export type DeadlineState = (typeof DEADLINE_STATE_OPTIONS)[number]['value'];

export const CANCEL_REASON_OPTIONS = toOptions([
  ['TOO_EXPENSIVE', 'Дорого', 'orange'],
  ['CHANGED_MIND', 'Передумал', 'gray'],
  ['UNREACHABLE', 'Не дозвонились', 'yellow'],
  ['COMPETITOR', 'Конкурент', 'red'],
  ['OTHER', 'Другое', 'gray'],
] as const);

export const MASTER_PAYMENT_KIND_OPTIONS = toOptions([
  ['ADVANCE', 'Аванс', 'yellow'],
  ['SETTLEMENT', 'Расчёт', 'green'],
] as const);

export type MasterPaymentKind =
  (typeof MASTER_PAYMENT_KIND_OPTIONS)[number]['value'];

export const MATERIAL_UNIT_OPTIONS = toOptions([
  ['METER', 'м', 'gray'],
  ['SQUARE_METER', 'м²', 'gray'],
  ['KILOGRAM', 'кг', 'gray'],
  ['LITER', 'л', 'gray'],
  ['PIECE', 'шт', 'gray'],
] as const);

export type MaterialUnit = (typeof MATERIAL_UNIT_OPTIONS)[number]['value'];

// Views sort SELECT by value text, so BUY < LOW < OK alphabetically is also the urgency order; keep that when renaming.
export const STOCK_STATE_OPTIONS = toOptions([
  ['BUY', 'Нужно купить', 'red'],
  ['LOW', 'Скоро закончится', 'yellow'],
  ['OK', 'Достаточно', 'green'],
] as const);

export type StockState = (typeof STOCK_STATE_OPTIONS)[number]['value'];

export const STOCK_MOVEMENT_KIND_OPTIONS = toOptions([
  ['RECEIPT', 'Приход', 'green'],
  ['STOCKTAKE', 'Инвентаризация', 'blue'],
  ['CORRECTION', 'Корректировка', 'gray'],
  ['WRITE_OFF', 'Списание на заказ', 'orange'],
  ['FACT_ADJUSTMENT', 'Корректировка по факту', 'purple'],
] as const);

export type StockMovementKind =
  (typeof STOCK_MOVEMENT_KIND_OPTIONS)[number]['value'];
