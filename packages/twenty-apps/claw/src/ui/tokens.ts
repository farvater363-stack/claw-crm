// Green, as in the Склад and «Деньги» mockups.
export const PALETTE = {
  light: {
    text: '#1c211d',
    muted: '#626a63',
    border: '#dcdfd9',
    surface: '#ffffff',
    panel: '#eceeea',
    accent: '#2f5d50',
    accentTint: '#e1ebe7',
    onAccent: '#ffffff',
    danger: '#b5402f',
    dangerTint: '#f8e6e2',
    warning: '#8a5f00',
    warningTint: '#fbf0d6',
    success: '#1d7a46',
    successTint: '#e2f2e8',
    urgent: '#6b3fc2',
    urgentTint: '#efe7fb',
    note: '#fff6cc',
  },
  dark: {
    text: '#e7ebe7',
    muted: '#9ba49d',
    border: '#313732',
    surface: '#1c201d',
    panel: '#232824',
    accent: '#8cc3b1',
    accentTint: '#22332d',
    onAccent: '#10201a',
    danger: '#f08b78',
    dangerTint: '#3a2420',
    warning: '#e6b84f',
    warningTint: '#352c16',
    success: '#6fd09a',
    successTint: '#1d3226',
    urgent: '#b896ff',
    urgentTint: '#2b2142',
    note: '#332e14',
  },
} as const;

export type Palette = { [Key in keyof (typeof PALETTE)['light']]: string };

export type Tone = 'danger' | 'warning' | 'success' | 'neutral';

export const TYPE = {
  title: { fontSize: '22px', lineHeight: '28px', fontWeight: 600 },
  rowTitle: { fontSize: '18px', lineHeight: '24px', fontWeight: 600 },
  body: { fontSize: '16px', lineHeight: '24px', fontWeight: 400 },
  label: { fontSize: '14px', lineHeight: '20px', fontWeight: 400 },
  keyNumber: { fontSize: '28px', lineHeight: '32px', fontWeight: 600 },
} as const;

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const RADIUS = { control: 8, card: 12 } as const;
export const CONTROL_HEIGHT = 48;
export const ROW_MIN_HEIGHT = 56;
export const CONTENT_MAX_WIDTH = 720;
// A block narrower than this is on a phone (360 to 480 px wide)
export const COLUMNS_MIN_WIDTH = 480;
export const TABULAR_NUMBERS = { fontVariantNumeric: 'tabular-nums' } as const;
