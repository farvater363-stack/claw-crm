// The server carries stored values over by option id, and the id the SDK
// generates changes with the label: an option that is relabelled gets, as the
// optional fourth entry, the id its first label produced. Without it every row
// holding that value falls back to the field's default.
const toOptions = <TValue extends string, TColor extends string>(
  entries: ReadonlyArray<readonly [TValue, string, TColor, string?]>,
) =>
  entries.map(([value, label, color, id], position) => ({
    value,
    label,
    color,
    position,
    ...(id === undefined ? {} : { id }),
  }));

export const METAL_OPTIONS = toOptions([
  ['ROD', 'Прут', 'blue'],
  ['PROFILE', 'Профиль', 'green'],
  ['REBAR', 'Арматура', 'orange'],
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
  ['PRODUCTION', 'Производство', 'orange'],
  [
    'QUALITY_CHECK',
    'Отправлено на установку',
    'purple',
    '96aee4e3-71ce-5947-8df6-0cc4e80c8b2a',
  ],
  ['INSTALLED', 'Установлен', 'green'],
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

export const EXTRA_SERVICE_KIND_OPTIONS = toOptions([
  ['VISOR', 'Козырёк', 'gray'],
  ['SERVICE', 'Услуга', 'gray'],
] as const);

export type ExtraServiceKind =
  (typeof EXTRA_SERVICE_KIND_OPTIONS)[number]['value'];

export const DEADLINE_STATE_OPTIONS = toOptions([
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

export const materialUnitLabel = (unit: string | null | undefined): string =>
  MATERIAL_UNIT_OPTIONS.find((option) => option.value === unit)?.label ?? '';

// Views sort SELECT by value text, so BUY < LOW < OK alphabetically is also the urgency order; keep that when renaming.
export const STOCK_STATE_OPTIONS = toOptions([
  ['BUY', 'Нужно купить', 'red'],
  ['LOW', 'Скоро закончится', 'yellow'],
  ['OK', 'Достаточно', 'green'],
] as const);

export type StockState = (typeof STOCK_STATE_OPTIONS)[number]['value'];

export const STOCK_MOVEMENT_KIND_OPTIONS = toOptions([
  ['RECEIPT', 'Купил', 'green', 'f3a49374-82bc-5de5-bdeb-b177c8a7dabd'],
  ['STOCKTAKE', 'Пересчёт', 'blue', '39c60125-a523-58d9-a592-bf57d41ec9cd'],
  [
    'WRITE_OFF',
    'Ушло на заказ',
    'orange',
    'c4613eef-94a1-512e-87c6-deae83f82f51',
  ],
] as const);

export type StockMovementKind =
  (typeof STOCK_MOVEMENT_KIND_OPTIONS)[number]['value'];

export const ORDER_MATERIAL_STATE_OPTIONS = toOptions([
  ['ENOUGH', 'Хватает', 'green'],
  ['SHORTAGE', 'Не хватает', 'red'],
  [
    'NO_NORM',
    'Не указан состав',
    'yellow',
    '7c5c1feb-5c5f-5d83-bfff-7985de022885',
  ],
] as const);

export type OrderMaterialState =
  (typeof ORDER_MATERIAL_STATE_OPTIONS)[number]['value'];

export const PAYMENT_METHOD_OPTIONS = toOptions([
  ['CASH', 'Наличные', 'gray'],
  ['CARD', 'Карта', 'gray'],
  ['TRANSFER', 'Перевод', 'gray'],
] as const);

export type PaymentMethod = (typeof PAYMENT_METHOD_OPTIONS)[number]['value'];

export const DISCOUNT_KIND_OPTIONS = toOptions([
  ['PERCENT', '%', 'gray'],
  ['AMOUNT', 'сум', 'gray'],
] as const);

export type DiscountKind = (typeof DISCOUNT_KIND_OPTIONS)[number]['value'];

export const WORKER_CATEGORY_OPTIONS = toOptions([
  ['MASTER', 'Мастер', 'gray'],
  ['INSTALLER', 'Установщик', 'gray'],
  ['MEASURER', 'Замерщик', 'gray'],
  ['SALES', 'Продажник', 'gray'],
] as const);

export type WorkerCategory = (typeof WORKER_CATEGORY_OPTIONS)[number]['value'];

const PAY_METHOD_ENTRIES = [
  ['FIXED', 'Фикса', 'gray'],
  ['PER_SQUARE_METER', 'За м²', 'gray'],
  ['PER_ORDER', 'За заказ', 'gray'],
  ['PERCENT_OF_SALES', '% от продаж', 'gray'],
  ['PER_MEASUREMENT', 'За замер', 'gray'],
] as const;

export const PAY_METHOD_OPTIONS = toOptions(PAY_METHOD_ENTRIES);

export type PayMethod = (typeof PAY_METHOD_OPTIONS)[number]['value'];

// A line of earned pay keeps the method of its rule; a bonus and a penalty have no rule.
export const ACCRUAL_METHOD_OPTIONS = toOptions([
  ...PAY_METHOD_ENTRIES,
  ['BONUS', 'Премия', 'gray'],
  ['PENALTY', 'Штраф', 'gray'],
] as const);

export type AccrualMethod = (typeof ACCRUAL_METHOD_OPTIONS)[number]['value'];
