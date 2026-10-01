import { serializeFileList } from '../serializeFileList';

describe('serializeFileList', () => {
  it('should return undefined for a non-object', () => {
    expect(serializeFileList(null)).toBeUndefined();
    expect(serializeFileList('files')).toBeUndefined();
  });

  it('should return undefined when there is no numeric length', () => {
    expect(serializeFileList({})).toBeUndefined();
  });

  it('should return the File objects themselves so their bytes stay readable', () => {
    const file = new File(['hello'], 'note.txt', {
      type: 'text/plain',
      lastModified: 1700000000000,
    });

    const [serialized] = serializeFileList({ length: 1, 0: file }) ?? [];

    expect(serialized).toBe(file);
    expect(serialized.name).toBe('note.txt');
    expect(serialized.lastModified).toBe(1700000000000);
  });

  it('should skip entries that are not files', () => {
    const file = new File(['a'], 'a.txt');

    const result = serializeFileList({
      length: 3,
      0: file,
      1: { name: 'fake.txt', size: 1, type: 'text/plain', lastModified: 1 },
      2: null,
    });

    expect(result).toEqual([file]);
  });
});
