import { FieldType } from 'twenty-sdk/define';

import { FULL_MONEY_DISPLAY } from 'src/constants/money-display';

// The code is stored SQL-quoted. With no amount the field stays empty; the code
// alone makes Twenty's input open on сум, the only currency it then offers.
export const UZS_DEFAULT = {
  amountMicros: null,
  currencyCode: "'UZS'",
} as const;

export const money = (
  universalIdentifier: string,
  name: string,
  label: string,
  extra: { icon?: string; isAuditLogged?: boolean } = {},
) =>
  ({
    universalIdentifier,
    type: FieldType.CURRENCY,
    name,
    label,
    icon: 'IconCurrency',
    isNullable: true,
    universalSettings: FULL_MONEY_DISPLAY,
    defaultValue: UZS_DEFAULT,
    ...extra,
  }) as const;
