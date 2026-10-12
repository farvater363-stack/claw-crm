type Page<TNode> =
  | {
      edges?: { node: TNode }[];
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    }
  | undefined;

export const PAGE_INFO = { hasNextPage: true, endCursor: true } as const;

export const fetchAllPages = async <TNode>(
  fetchPage: (after: string | undefined) => Promise<Page<TNode>>,
): Promise<TNode[]> => {
  const nodes: TNode[] = [];
  let after: string | undefined;

  for (;;) {
    const page = await fetchPage(after);

    nodes.push(...(page?.edges ?? []).map(({ node }) => node));

    const endCursor = page?.pageInfo?.endCursor;

    if (!page?.pageInfo?.hasNextPage || !endCursor) return nodes;

    after = endCursor;
  }
};

// One query reads the first page of every list it needs; only a list longer
// than a page costs more requests.
export const withRemainingPages = async <TNode>(
  page: Page<TNode> | null,
  fetchPage: (after: string) => Promise<Page<TNode>>,
): Promise<{ edges: { node: TNode }[] }> => {
  const firstNodes = (page?.edges ?? []).map(({ node }) => node);
  const endCursor = page?.pageInfo?.endCursor;
  const restNodes =
    page?.pageInfo?.hasNextPage && endCursor
      ? await fetchAllPages((after) => fetchPage(after ?? endCursor))
      : [];

  return {
    edges: [...firstNodes, ...restNodes].map((node) => ({ node })),
  };
};
