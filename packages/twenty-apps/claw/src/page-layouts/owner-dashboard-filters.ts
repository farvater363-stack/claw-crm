const TIME_ZONE = 'Asia/Tashkent';

// A relative date filter of a view, counted in Tashkent days.
export const relative = (period: string) => `${period};;${TIME_ZONE};;`;
