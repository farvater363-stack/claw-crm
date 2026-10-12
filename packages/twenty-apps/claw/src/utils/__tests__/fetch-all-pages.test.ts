import { describe, expect, it, vi } from 'vitest';

import { withRemainingPages } from 'src/utils/fetch-all-pages';

const page = (ids: string[], endCursor: string | null) => ({
  edges: ids.map((id) => ({ node: { id } })),
  pageInfo: { hasNextPage: endCursor !== null, endCursor },
});

describe('withRemainingPages', () => {
  it('asks for nothing more when the first page is the whole list', async () => {
    const fetchPage = vi.fn();

    const result = await withRemainingPages(page(['a', 'b'], null), fetchPage);

    expect(result.edges.map(({ node }) => node.id)).toEqual(['a', 'b']);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('reads every page after the first one', async () => {
    const fetchPage = vi.fn(async (after: string) =>
      after === 'c1' ? page(['c'], 'c2') : page(['d'], null),
    );

    const result = await withRemainingPages(page(['a', 'b'], 'c1'), fetchPage);

    expect(result.edges.map(({ node }) => node.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(fetchPage.mock.calls.map(([after]) => after)).toEqual(['c1', 'c2']);
  });

  it('treats a missing list as empty', async () => {
    expect(await withRemainingPages(null, vi.fn())).toEqual({ edges: [] });
  });
});
