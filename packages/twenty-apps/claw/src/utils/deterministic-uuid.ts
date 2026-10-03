import { createHash } from 'node:crypto';

// Records written by the order sync get ids derived from what they stand for,
// so an upsert of the same id can never create a duplicate.
export const deterministicUuid = (key: string): string => {
  const hex = createHash('sha1').update(`claw:${key}`).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
};
