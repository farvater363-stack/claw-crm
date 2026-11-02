// When this device last opened an order's photos and notes. The renderer
// keeps each user's localStorage, and the workshop's wall is one shared login
// on one screen, so a device is the right place to remember it.
const KEY_PREFIX = 'claw:order-media-seen:';

export const readSeenAt = (orderId: string): number | null => {
  try {
    const stored = localStorage.getItem(KEY_PREFIX + orderId);
    const seenAt = stored === null ? NaN : Number(stored);

    return Number.isFinite(seenAt) ? seenAt : null;
  } catch {
    return null;
  }
};

export const markSeen = (orderId: string, now: number = Date.now()) => {
  try {
    localStorage.setItem(KEY_PREFIX + orderId, String(now));
  } catch {
    // Blocked storage only means the highlight comes back next time
  }
};
