export const PALETTE = {
  light: {
    text: '#1f1f1f',
    muted: '#666666',
    border: '#d6d6d6',
    surface: '#ffffff',
    panel: '#f6f6f6',
    accent: '#1961ed',
    onAccent: '#ffffff',
    danger: '#b42318',
    dangerTint: '#fdecea',
    warning: '#8a4b00',
    warningTint: '#fdf1d6',
    success: '#17693a',
    successTint: '#e4f4e9',
  },
  dark: {
    text: '#ebebeb',
    muted: '#a6a6a6',
    border: '#3d3d3d',
    surface: '#1b1b1b',
    panel: '#242424',
    accent: '#5b8def',
    onAccent: '#111111',
    danger: '#f97066',
    dangerTint: '#3a1512',
    warning: '#f2b84b',
    warningTint: '#33250a',
    success: '#62d08c',
    successTint: '#10301c',
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
