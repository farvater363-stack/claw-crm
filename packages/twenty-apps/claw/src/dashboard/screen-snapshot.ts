import { todayInTashkent } from 'src/pricing/dates';

// The renderer seeds each user's localStorage before the first render, so a
// screen can draw its last numbers at once and refresh them quietly. Bump the
// version whenever a snapshot's data shape changes, so an old one is dropped.
const SNAPSHOT_VERSION = 2;
const KEY_PREFIX = 'claw:screen-snapshot:';

type StoredSnapshot<TData> = { version: number; day: string; data: TData };

export const readScreenSnapshot = <TData>(screen: string): TData | null => {
  try {
    const stored = localStorage.getItem(KEY_PREFIX + screen);

    if (stored === null) return null;

    const snapshot = JSON.parse(stored) as StoredSnapshot<TData>;

    // Yesterday's plan for the day would be wrong, not just old
    return snapshot.version === SNAPSHOT_VERSION &&
      snapshot.day === todayInTashkent()
      ? snapshot.data
      : null;
  } catch {
    return null;
  }
};

export const writeScreenSnapshot = <TData>(screen: string, data: TData) => {
  try {
    const snapshot: StoredSnapshot<TData> = {
      version: SNAPSHOT_VERSION,
      day: todayInTashkent(),
      data,
    };

    localStorage.setItem(KEY_PREFIX + screen, JSON.stringify(snapshot));
  } catch {
    // A full or blocked storage only costs the instant first draw
  }
};
