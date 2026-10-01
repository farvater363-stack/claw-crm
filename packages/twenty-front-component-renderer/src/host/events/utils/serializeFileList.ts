import { isNumber, isObject } from '@sniptt/guards';

// File objects are structured-cloneable and cross the thread as handles to the
// browser's blob store, so the component gets the bytes without a copy here.
export const serializeFileList = (files: unknown): File[] | undefined => {
  if (!isObject(files) || !isNumber((files as { length?: unknown }).length)) {
    return undefined;
  }

  return Array.from(files as ArrayLike<unknown>).filter(
    (file): file is File => file instanceof File,
  );
};
