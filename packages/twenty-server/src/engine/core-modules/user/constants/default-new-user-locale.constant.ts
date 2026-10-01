import { type APP_LOCALES } from 'twenty-shared/translations';

// Claw CRM staff work in Russian; new users start in ru-RU whatever their
// browser reports, and can change it in profile settings.
export const DEFAULT_NEW_USER_LOCALE: keyof typeof APP_LOCALES = 'ru-RU';

export const DEFAULT_NEW_WORKSPACE_MEMBER_DATE_FORMAT = 'DAY_FIRST';
export const DEFAULT_NEW_WORKSPACE_MEMBER_TIME_FORMAT = 'HOUR_24';
export const DEFAULT_NEW_WORKSPACE_MEMBER_TIME_ZONE = 'Asia/Tashkent';
